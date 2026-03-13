import json
import time
from pathlib import Path
from ...config import XTTS_OUT_DIR, SENT_CHAR_LIMIT
from ...state import update_job
from ...engines import xtts_generate, xtts_generate_script, wav_to_mp3, get_audio_duration, stitch_segments
from ...textops import sanitize_for_xtts, safe_split_long_sentences
from ..speaker import get_speaker_wavs

def handle_xtts_job(jid, j, start, logs, on_output, cancel_check, default_sw, speed, pdir, out_wav, out_mp3, text=None):
    from ...db import get_connection, update_segment, get_chapter_segments, update_segments_status_bulk, update_queue_item

    # Ensure status is 'running' if we got here
    if j.status != "running":
        j.status = "running"
        update_job(jid, status="running")

    # NEW: Handle Chapter Baking (Stitching existing segments)
    if j.is_bake and j.chapter_id:
        on_output(f"Baking Chapter {j.chapter_id} starting...\n")
        segs = get_chapter_segments(j.chapter_id)

        # 1. Identify missing segments
        missing_segs = []
        for s in segs:
            spath = pdir / (s['audio_file_path'] or f"seg_{s['id']}.wav")
            if s['audio_status'] != 'done' or not spath.exists():
                missing_segs.append(s)

        if missing_segs:
            missing_groups = []
            if missing_segs:
                current_group = [missing_segs[0]]
                for i in range(1, len(missing_segs)):
                    prev = missing_segs[i-1]
                    curr = missing_segs[i]
                    prev_full_idx = next((idx for idx, s in enumerate(segs) if s['id'] == prev['id']), -1)
                    curr_full_idx = next((idx for idx, s in enumerate(segs) if s['id'] == curr['id']), -1)
                    trimmed_group_text = " ".join([s['text_content'] for s in current_group])
                    combined_len = len(trimmed_group_text) + 1 + len(curr['text_content'])
                    same_char = curr['character_id'] == prev['character_id']
                    is_consecutive = curr_full_idx == prev_full_idx + 1
                    fits_limit = combined_len <= SENT_CHAR_LIMIT
                    if same_char and is_consecutive and fits_limit:
                        current_group.append(curr)
                    else:
                        missing_groups.append(current_group)
                        current_group = [curr]
                missing_groups.append(current_group)

            full_script = []
            path_to_group = {}
            for group in missing_groups:
                char_profile = group[0].get('speaker_profile_name')
                sw = get_speaker_wavs(char_profile) or default_sw
                combined_text = " ".join([s['text_content'] for s in group])
                if j.safe_mode:
                    combined_text = sanitize_for_xtts(combined_text)
                    combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)
                sid = group[0]['id']
                seg_out = pdir / f"seg_{sid}.wav"
                save_path_str = str(seg_out.absolute())
                full_script.append({"text": combined_text, "speaker_wav": sw, "save_path": save_path_str})
                path_to_group[save_path_str] = group

            script_path = pdir / f"bake_{j.id}_script.json"
            script_path.write_text(json.dumps(full_script), encoding="utf-8")

            groups_completed = [0]
            def bake_on_output(line):
                on_output(line)
                if "[SEGMENT_SAVED]" in line:
                    saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                    group = path_to_group.get(saved_path)
                    if group:
                        seg_filename = Path(saved_path).name
                        for s in group:
                            update_segment(s['id'], audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                        groups_completed[0] += 1
                        prog = (groups_completed[0] / len(missing_groups)) * 0.9
                        update_job(jid, progress=prog)

            try:
                xtts_generate_script(script_json_path=script_path, out_wav=out_wav, on_output=bake_on_output, cancel_check=cancel_check, speed=speed)
            finally:
                if script_path.exists(): script_path.unlink()

        # Final Stitch
        if cancel_check(): return
        update_job(jid, status="finalizing", progress=0.91)
        fresh_segs = get_chapter_segments(j.chapter_id)
        segment_paths = []
        last_path = None
        for s in fresh_segs:
            if s['audio_status'] == 'done' and s['audio_file_path']:
                spath = pdir / s['audio_file_path']
                if spath.exists() and spath != last_path:
                    segment_paths.append(spath)
                    last_path = spath
        if not segment_paths:
            update_job(jid, status="failed", error="No valid audio segments found to stitch.")
            return
        rc = stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
        if rc == 0 and out_wav.exists():
            duration = get_audio_duration(out_wav)
            update_queue_item(jid, "done", audio_length_seconds=duration)
        else:
            update_job(jid, status="failed", error=f"Stitching failed (rc={rc})")
            return

    elif j.segment_ids:
        # Requested segments mode
        all_segs = get_chapter_segments(j.chapter_id)
        requested_ids = set(j.segment_ids)
        segs_to_gen = [s for s in all_segs if s['id'] in requested_ids]
        if not segs_to_gen:
            update_job(jid, status="done", progress=1.0)
            return

        gen_groups = []
        if segs_to_gen:
            current_group = [segs_to_gen[0]]
            for i in range(1, len(segs_to_gen)):
                prev = segs_to_gen[i-1]
                curr = segs_to_gen[i]
                prev_full_idx = next((idx for idx, s in enumerate(all_segs) if s['id'] == prev['id']), -1)
                curr_full_idx = next((idx for idx, s in enumerate(all_segs) if s['id'] == curr['id']), -1)
                trimmed_group_text = " ".join([s['text_content'] for s in current_group])
                combined_len = len(trimmed_group_text) + 1 + len(curr['text_content'])
                same_char = curr['character_id'] == prev['character_id']
                is_consecutive = curr_full_idx == prev_full_idx + 1
                fits_limit = combined_len <= SENT_CHAR_LIMIT
                if same_char and is_consecutive and fits_limit:
                    current_group.append(curr)
                else:
                    gen_groups.append(current_group)
                    current_group = [curr]
            gen_groups.append(current_group)

        full_script = []
        path_to_group = {}
        for group in gen_groups:
            char_profile = group[0].get('speaker_profile_name')
            sw = get_speaker_wavs(char_profile) or default_sw
            combined_text = "".join([s['text_content'] for s in group])
            if j.safe_mode:
                combined_text = sanitize_for_xtts(combined_text)
                combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)
            first_sid = group[0]['id']
            seg_out = pdir / f"seg_{first_sid}.wav"
            save_path_str = str(seg_out.absolute())
            full_script.append({"text": combined_text, "speaker_wav": sw, "save_path": save_path_str})
            path_to_group[save_path_str] = group

        script_path = pdir / f"gen_{j.id}_script.json"
        script_path.write_text(json.dumps(full_script), encoding="utf-8")
        groups_completed = [0]
        def gen_on_output(line):
            on_output(line)
            if "[SEGMENT_SAVED]" in line:
                saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                group = path_to_group.get(saved_path)
                if group:
                    seg_filename = Path(saved_path).name
                    for s in group:
                        update_segment(s['id'], broadcast=True, audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                    groups_completed[0] += 1
                    update_job(jid, progress=(groups_completed[0] / len(gen_groups)))

        try:
            xtts_generate_script(script_json_path=script_path, out_wav=pdir / f"output_{j.id}.wav", on_output=gen_on_output, cancel_check=cancel_check, speed=speed)
        finally:
            if script_path.exists(): script_path.unlink()
            scratch = pdir / f"output_{j.id}.wav"
            if scratch.exists(): scratch.unlink()

        if j.chapter_id:
            try:
                from ...api.ws import broadcast_segments_updated
                broadcast_segments_updated(j.chapter_id)
            except: pass
        update_job(jid, status="done", progress=1.0, finished_at=time.time())
        return

    else:
        # Standard Chapter mode
        segments_data = []
        if j.chapter_id:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT s.text_content, s.character_id, c.speaker_profile_name
                    FROM chapter_segments s
                    LEFT JOIN characters c ON s.character_id = c.id
                    WHERE s.chapter_id = ?
                    ORDER BY s.segment_order
                """, (j.chapter_id,))
                segments_data = cursor.fetchall()

        has_custom = any(s['character_id'] for s in segments_data) if segments_data else False

        if has_custom:
            script = []
            current_sw = None
            current_text = ""
            for s in segments_data:
                if not s['text_content'] or not s['text_content'].strip(): continue
                sw = get_speaker_wavs(s['speaker_profile_name']) if (s['character_id'] and s['speaker_profile_name']) else default_sw
                if current_sw is not None and sw == current_sw:
                    current_text += " " + s['text_content'].strip()
                else:
                    if current_sw is not None:
                        processed = current_text.strip()
                        if j.safe_mode:
                            processed = sanitize_for_xtts(processed)
                            processed = safe_split_long_sentences(processed, target=SENT_CHAR_LIMIT)
                        script.append({"text": processed, "speaker_wav": current_sw})
                    current_sw = sw
                    current_text = s['text_content'].strip()
            if current_sw is not None:
                processed = current_text.strip()
                if j.safe_mode:
                    processed = sanitize_for_xtts(processed)
                    processed = safe_split_long_sentences(processed, target=SENT_CHAR_LIMIT)
                script.append({"text": processed, "speaker_wav": current_sw})

            script_path = pdir / f"{j.id}_script.json"
            script_path.write_text(json.dumps(script), encoding="utf-8")
            try:
                rc = xtts_generate_script(script_json_path=script_path, out_wav=out_wav, on_output=on_output, cancel_check=cancel_check, speed=speed)
            finally:
                if script_path.exists(): script_path.unlink()
        else:
            rc = xtts_generate(text=text, out_wav=out_wav, safe_mode=j.safe_mode, on_output=on_output, cancel_check=cancel_check, speaker_wav=default_sw, speed=speed)

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return

    if rc != 0 or not out_wav.exists():
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Generation failed (rc={rc}).")
        return

    # Finalize (MP3 conversion)
    if j.make_mp3:
        update_job(jid, status="finalizing", progress=0.99)
        frc = wav_to_mp3(out_wav, out_mp3, on_output=on_output, cancel_check=cancel_check)
        if frc == 0 and out_mp3.exists():
            if j.chapter_id:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r[0] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name, output_mp3=out_mp3.name)
        else:
            if j.chapter_id:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r[0] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name, error="MP3 conversion failed (using WAV fallback)")
    else:
        if j.chapter_id:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                sids = [r[0] for r in cursor.fetchall()]
                update_segments_status_bulk(sids, j.chapter_id, "done")
        update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name)
