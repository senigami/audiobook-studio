import json
import time
from pathlib import Path
from ...config import XTTS_OUT_DIR, SENT_CHAR_LIMIT
from ...state import update_job
from ...engines import xtts_generate, xtts_generate_script, wav_to_mp3, get_audio_duration, stitch_segments
from ...textops import sanitize_for_xtts, safe_split_long_sentences
from ..speaker import get_speaker_wavs, get_voice_profile_dir


def _profile_inputs_for_segment(char_profile, job_default_profile, default_sw):
    profile_name = char_profile or job_default_profile
    sw = get_speaker_wavs(char_profile) if char_profile else default_sw
    voice_profile_dir = None
    if profile_name:
        try:
            voice_profile_dir = str(get_voice_profile_dir(profile_name))
        except ValueError:
            voice_profile_dir = None
    return sw, voice_profile_dir


def handle_xtts_job(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, out_mp3, text=None):
    from ...db import get_connection, update_segment, get_chapter_segments, update_segments_status_bulk, update_queue_item
    from ...db.segments import cleanup_orphaned_segments

    pdir.mkdir(parents=True, exist_ok=True)
    generated_segment_audio = bool(j.is_bake or j.segment_ids)

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return

    if j.chapter_id:
        cleanup_orphaned_segments(j.chapter_id)

    # NEW: Handle Chapter Baking (Stitching existing segments)
    if j.is_bake and j.chapter_id:
        on_output(f"Baking Chapter {j.chapter_id} starting...\n")
        segs = get_chapter_segments(j.chapter_id)

        # 1. Identify missing segments
        missing_segs = []
        for s in segs:
            spath = pdir / (s['audio_file_path'] or f"chunk_{s['id']}.wav")
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
                sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
                combined_text = " ".join([s['text_content'] for s in group])
                if j.safe_mode:
                    combined_text = sanitize_for_xtts(combined_text)
                    combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)
                sid = group[0]['id']
                seg_out = pdir / f"chunk_{sid}.wav"
                save_path_str = str(seg_out.absolute())
                script_entry = {"text": combined_text, "speaker_wav": sw, "save_path": save_path_str, "id": group[0]['id']}
                if voice_profile_dir:
                    script_entry["voice_profile_dir"] = voice_profile_dir
                full_script.append(script_entry)
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
                        try:
                            from ...db.chapters import get_chapter_segments_counts
                            done_at_end, total_c = get_chapter_segments_counts(j.chapter_id)
                            # Partial progress: done_at_end / total_c * 0.9 (since stitching is next)
                            prog = (done_at_end / total_c) * 0.9 if total_c > 0 else (groups_completed[0] / len(missing_groups)) * 0.9
                        except Exception:
                            prog = (groups_completed[0] / len(missing_groups)) * 0.9
                        update_job(jid, progress=prog, active_segment_id=None, active_segment_progress=0.0)

                if "[START_SEGMENT]" in line:
                    asid = line.split("[START_SEGMENT]")[1].strip()
                    # If it's a path, just take the filename stem or similar if possible, 
                    # but inference script sends segment['id'] if available.
                    update_job(jid, active_segment_id=asid, active_segment_progress=0.0)

                if "[PROGRESS]" in line:
                    try:
                        p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                        update_job(jid, active_segment_progress=float(p_str)/100.0)
                    except: pass

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
            from ...db import update_queue_item
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
            sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
            combined_text = "".join([s['text_content'] for s in group])
            if j.safe_mode:
                combined_text = sanitize_for_xtts(combined_text)
                combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)
            first_sid = group[0]['id']
            seg_out = pdir / f"chunk_{first_sid}.wav"
            save_path_str = str(seg_out.absolute())
            script_entry = {"text": combined_text, "speaker_wav": sw, "save_path": save_path_str, "id": group[0]['id']}
            if voice_profile_dir:
                script_entry["voice_profile_dir"] = voice_profile_dir
            full_script.append(script_entry)
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
                    try:
                        from ...db.chapters import get_chapter_segments_counts
                        done_at_end, total_c = get_chapter_segments_counts(j.chapter_id)
                        prog = (done_at_end / total_c) if total_c > 0 else (groups_completed[0] / len(gen_groups))
                    except Exception:
                        prog = (groups_completed[0] / len(gen_groups))
                    update_job(jid, progress=prog, active_segment_id=None, active_segment_progress=0.0)

            if "[START_SEGMENT]" in line:
                asid = line.split("[START_SEGMENT]")[1].strip()
                update_job(jid, active_segment_id=asid, active_segment_progress=0.0)

            if "[PROGRESS]" in line:
                try:
                    p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                    update_job(jid, active_segment_progress=float(p_str)/100.0)
                except: pass

        try:
            xtts_generate_script(script_json_path=script_path, out_wav=pdir / f"output_{j.id}.wav", on_output=gen_on_output, cancel_check=cancel_check, speed=speed)
        finally:
            if script_path.exists(): script_path.unlink()
            scratch = pdir / f"output_{j.id}.wav"
            if scratch.exists(): scratch.unlink()

            try:
                from ...api.ws import broadcast_segments_updated
                broadcast_segments_updated(j.chapter_id)
            except Exception: 
                pass

        # Accurate Resumption: Update progress based on total segments
        try:
            from ...db.chapters import get_chapter_segments_counts
            done_c, total_c = get_chapter_segments_counts(j.chapter_id)
            final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
            update_job(jid, status="done", progress=final_p, finished_at=time.time())
        except Exception:
            update_job(jid, status="done", progress=1.0, finished_at=time.time())
        return

    else:
        # Standard Chapter mode
        segments_data = []
        if j.chapter_id:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT s.text_content, s.character_id, s.id, c.speaker_profile_name
                    FROM chapter_segments s
                    LEFT JOIN characters c ON s.character_id = c.id
                    WHERE s.chapter_id = ?
                    ORDER BY s.segment_order
                """, (j.chapter_id,))
                segments_data = cursor.fetchall()

        has_custom = any(s['character_id'] for s in segments_data) if segments_data else False

        if has_custom:
            script = []
            current_id = None
            current_profile_key = None
            current_sw = None
            current_voice_profile_dir = None
            current_text = ""
            for s in segments_data:
                if not s['text_content'] or not s['text_content'].strip(): continue
                char_profile = s['speaker_profile_name'] if (s['character_id'] and s['speaker_profile_name']) else None
                profile_key = char_profile or j.speaker_profile or ""
                sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
                if current_profile_key is not None and profile_key == current_profile_key:
                    current_text += " " + s['text_content'].strip()
                else:
                    if current_profile_key is not None:
                        processed = current_text.strip()
                        if j.safe_mode:
                            processed = sanitize_for_xtts(processed)
                            processed = safe_split_long_sentences(processed, target=SENT_CHAR_LIMIT)
                        script_entry = {"text": processed, "speaker_wav": current_sw, "id": current_id}
                        if current_voice_profile_dir:
                            script_entry["voice_profile_dir"] = current_voice_profile_dir
                        script.append(script_entry)
                    current_profile_key = profile_key
                    current_sw = sw
                    current_voice_profile_dir = voice_profile_dir
                    current_id = s['id']
                    current_text = s['text_content'].strip()
            if current_profile_key is not None:
                processed = current_text.strip()
                if j.safe_mode:
                    processed = sanitize_for_xtts(processed)
                    processed = safe_split_long_sentences(processed, target=SENT_CHAR_LIMIT)
                script_entry = {"text": processed, "speaker_wav": current_sw, "id": current_id}
                if current_voice_profile_dir:
                    script_entry["voice_profile_dir"] = current_voice_profile_dir
                script.append(script_entry)

            script_path = pdir / f"{j.id}_script.json"
            script_path.write_text(json.dumps(script), encoding="utf-8")
            try:
                rc = xtts_generate_script(script_json_path=script_path, out_wav=out_wav, on_output=on_output, cancel_check=cancel_check, speed=speed)
            finally:
                if script_path.exists(): script_path.unlink()
        else:
            if j.chapter_id:
                script_path = pdir / f"{j.id}_chapter_script.json"
                script_entry = {"text": text, "speaker_wav": default_sw}
                if j.speaker_profile:
                    try:
                        script_entry["voice_profile_dir"] = str(get_voice_profile_dir(j.speaker_profile))
                    except ValueError:
                        pass
                script_path.write_text(json.dumps([script_entry]), encoding="utf-8")
                try:
                    rc = xtts_generate_script(script_json_path=script_path, out_wav=out_wav, on_output=on_output, cancel_check=cancel_check, speed=speed)
                finally:
                    if script_path.exists(): script_path.unlink()
            else:
                try:
                    voice_profile_dir = str(get_voice_profile_dir(j.speaker_profile)) if j.speaker_profile else None
                except ValueError:
                    voice_profile_dir = None
                rc = xtts_generate(text=text, out_wav=out_wav, safe_mode=j.safe_mode, on_output=on_output, cancel_check=cancel_check, speaker_wav=default_sw, speed=speed, voice_profile_dir=voice_profile_dir)

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
            if j.chapter_id and generated_segment_audio:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r['id'] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name, output_mp3=out_mp3.name)
        else:
            if j.chapter_id and generated_segment_audio:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r['id'] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name, error="MP3 conversion failed (using WAV fallback)")
    else:
        if j.chapter_id and generated_segment_audio:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                sids = [r['id'] for r in cursor.fetchall()]
                update_segments_status_bulk(sids, j.chapter_id, "done")
        update_job(jid, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name)
