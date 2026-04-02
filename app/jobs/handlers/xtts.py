import json
import time
from pathlib import Path
from ...config import XTTS_OUT_DIR, SENT_CHAR_LIMIT
from ...chunk_groups import build_chunk_groups, load_chunk_segments
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


def _generate_direct_xtts(text, j, out_wav, on_output, cancel_check, default_sw, speed):
    try:
        voice_profile_dir = str(get_voice_profile_dir(j.speaker_profile)) if j.speaker_profile else None
    except ValueError:
        voice_profile_dir = None
    return xtts_generate(
        text=text,
        out_wav=out_wav,
        safe_mode=j.safe_mode,
        on_output=on_output,
        cancel_check=cancel_check,
        speaker_wav=default_sw,
        speed=speed,
        voice_profile_dir=voice_profile_dir,
    )


def _group_job_progress(
    completed_units: int,
    total_units: int,
    active_segment_progress: float,
    *,
    limit: float,
) -> float:
    if total_units <= 0:
        return round(limit, 2)
    completed = max(0, min(completed_units, total_units))
    active = max(0.0, min(active_segment_progress, 1.0))
    weighted_active = active if completed < total_units else 0.0
    return round(((completed + weighted_active) / total_units) * limit, 2)


def _group_tracking_updates(
    completed_units: int,
    total_units: int,
    *,
    active_index: int = 0,
) -> dict:
    return {
        "completed_render_groups": completed_units,
        "render_group_count": total_units,
        "active_render_group_index": active_index,
    }


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

        total_missing_groups = 0
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

            completed_groups = [0]
            total_missing_groups = len(missing_groups)
            j.render_group_count = total_missing_groups
            j.completed_render_groups = 0
            j.active_render_group_index = 0
            update_job(jid, **_group_tracking_updates(0, total_missing_groups))
            def bake_on_output(line):
                on_output(line)
                if "[SEGMENT_SAVED]" in line:
                    saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                    group = path_to_group.get(saved_path)
                    if group:
                        seg_filename = Path(saved_path).name
                        for s in group:
                            update_segment(s['id'], audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                        completed_groups[0] += 1
                        j.completed_render_groups = completed_groups[0]
                        j.active_render_group_index = 0
                        prog = (completed_groups[0] / total_missing_groups) * 0.9 if total_missing_groups > 0 else 0.9
                        update_job(
                            jid,
                            progress=prog,
                            active_segment_id=None,
                            active_segment_progress=0.0,
                            **_group_tracking_updates(completed_groups[0], total_missing_groups),
                        )

                if "[START_SEGMENT]" in line:
                    asid = line.split("[START_SEGMENT]")[1].strip()
                    j.active_render_group_index = min(completed_groups[0] + 1, total_missing_groups)
                    # If it's a path, just take the filename stem or similar if possible, 
                    # but inference script sends segment['id'] if available.
                    base_progress = _group_job_progress(
                        completed_groups[0],
                        total_missing_groups,
                        0.0,
                        limit=0.9,
                    )
                    update_job(
                        jid,
                        force_broadcast=True,
                        progress=base_progress,
                        active_segment_id=asid,
                        active_segment_progress=0.0,
                        **_group_tracking_updates(completed_groups[0], total_missing_groups, active_index=min(completed_groups[0] + 1, total_missing_groups)),
                    )

                if "[PROGRESS]" in line:
                    try:
                        p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                        segment_progress = float(p_str) / 100.0
                        overall_progress = _group_job_progress(
                            completed_groups[0],
                            total_missing_groups,
                            segment_progress,
                            limit=0.9,
                        )
                        update_job(
                            jid,
                            force_broadcast=True,
                            progress=overall_progress,
                            active_segment_progress=segment_progress,
                            **_group_tracking_updates(completed_groups[0], total_missing_groups, active_index=min(completed_groups[0] + 1, total_missing_groups)),
                        )
                    except: pass

            try:
                xtts_generate_script(script_json_path=script_path, out_wav=out_wav, on_output=bake_on_output, cancel_check=cancel_check, speed=speed)
            finally:
                if script_path.exists(): script_path.unlink()

        # Final Stitch
        if cancel_check(): return
        update_job(jid, status="finalizing", progress=0.91, **_group_tracking_updates(total_missing_groups, total_missing_groups))
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
        completed_groups = [0]
        total_requested_groups = len(gen_groups)
        j.render_group_count = total_requested_groups
        j.completed_render_groups = 0
        j.active_render_group_index = 0
        update_job(jid, **_group_tracking_updates(0, total_requested_groups))
        def gen_on_output(line):
            on_output(line)
            if "[SEGMENT_SAVED]" in line:
                saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                group = path_to_group.get(saved_path)
                if group:
                    seg_filename = Path(saved_path).name
                    for s in group:
                        update_segment(s['id'], broadcast=True, audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                    completed_groups[0] += 1
                    j.completed_render_groups = completed_groups[0]
                    j.active_render_group_index = 0
                    prog = (completed_groups[0] / total_requested_groups) if total_requested_groups > 0 else 1.0
                    update_job(
                        jid,
                        progress=prog,
                        active_segment_id=None,
                        active_segment_progress=0.0,
                        **_group_tracking_updates(completed_groups[0], total_requested_groups),
                    )

            if "[START_SEGMENT]" in line:
                asid = line.split("[START_SEGMENT]")[1].strip()
                j.active_render_group_index = min(completed_groups[0] + 1, total_requested_groups)
                base_progress = _group_job_progress(
                    completed_groups[0],
                    total_requested_groups,
                    0.0,
                    limit=1.0,
                )
                update_job(
                    jid,
                    force_broadcast=True,
                    progress=base_progress,
                    active_segment_id=asid,
                    active_segment_progress=0.0,
                    **_group_tracking_updates(completed_groups[0], total_requested_groups, active_index=min(completed_groups[0] + 1, total_requested_groups)),
                )

            if "[PROGRESS]" in line:
                try:
                    p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                    segment_progress = float(p_str) / 100.0
                    overall_progress = _group_job_progress(
                        completed_groups[0],
                        total_requested_groups,
                        segment_progress,
                        limit=1.0,
                    )
                    update_job(
                        jid,
                        force_broadcast=True,
                        progress=overall_progress,
                        active_segment_progress=segment_progress,
                        **_group_tracking_updates(completed_groups[0], total_requested_groups, active_index=min(completed_groups[0] + 1, total_requested_groups)),
                    )
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
            update_job(jid, status="done", progress=final_p, finished_at=time.time(), **_group_tracking_updates(total_requested_groups, total_requested_groups))
        except Exception:
            update_job(jid, status="done", progress=1.0, finished_at=time.time(), **_group_tracking_updates(total_requested_groups, total_requested_groups))
        return

    else:
        # Standard Chapter mode
        if j.chapter_id:
            groups = build_chunk_groups(load_chunk_segments(j.chapter_id), j.speaker_profile)
            if groups:
                script = []
                path_to_group = {}
                for group in groups:
                    first = group["segments"][0]
                    profile_name = group["profile_name"]
                    sw = get_speaker_wavs(profile_name) if profile_name else default_sw
                    voice_profile_dir = None
                    if profile_name:
                        try:
                            voice_profile_dir = str(get_voice_profile_dir(profile_name))
                        except ValueError:
                            voice_profile_dir = None
                    processed = " ".join(group["text_parts"]).strip()
                    if j.safe_mode:
                        processed = sanitize_for_xtts(processed)
                        processed = safe_split_long_sentences(processed, target=SENT_CHAR_LIMIT)
                    seg_out = pdir / f"chunk_{first['id']}.wav"
                    save_path_str = str(seg_out.absolute())
                    script_entry = {"text": processed, "speaker_wav": sw, "id": first["id"], "save_path": save_path_str}
                    if voice_profile_dir:
                        script_entry["voice_profile_dir"] = voice_profile_dir
                    script.append(script_entry)
                    path_to_group[save_path_str] = group

                script_path = pdir / f"{j.id}_script.json"
                script_path.write_text(json.dumps(script), encoding="utf-8")
                completed_groups = [0]
                total_groups = len(groups)
                j.render_group_count = total_groups
                j.completed_render_groups = 0
                j.active_render_group_index = 0
                update_job(jid, **_group_tracking_updates(0, total_groups))

                def chapter_on_output(line):
                    on_output(line)
                    if "[SEGMENT_SAVED]" in line:
                        saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                        group = path_to_group.get(saved_path)
                        if group:
                            seg_filename = Path(saved_path).name
                            generated_at = time.time()
                            for s in group["segments"]:
                                update_segment(s["id"], broadcast=True, audio_status="done", audio_file_path=seg_filename, audio_generated_at=generated_at)
                            completed_groups[0] += 1
                            j.completed_render_groups = completed_groups[0]
                            j.active_render_group_index = 0
                            progress = (completed_groups[0] / total_groups) * 0.9 if total_groups > 0 else 0.9
                            update_job(
                                jid,
                                progress=progress,
                                active_segment_id=None,
                                active_segment_progress=0.0,
                                **_group_tracking_updates(completed_groups[0], total_groups),
                            )

                    if "[START_SEGMENT]" in line:
                        asid = line.split("[START_SEGMENT]")[1].strip()
                        j.active_render_group_index = min(completed_groups[0] + 1, total_groups)
                        base_progress = _group_job_progress(
                            completed_groups[0],
                            total_groups,
                            0.0,
                            limit=0.9,
                        )
                        update_job(
                            jid,
                            force_broadcast=True,
                            progress=base_progress,
                            active_segment_id=asid,
                            active_segment_progress=0.0,
                            **_group_tracking_updates(completed_groups[0], total_groups, active_index=min(completed_groups[0] + 1, total_groups)),
                        )

                    if "[PROGRESS]" in line:
                        try:
                            p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                            segment_progress = float(p_str) / 100.0
                            overall_progress = _group_job_progress(
                                completed_groups[0],
                                total_groups,
                                segment_progress,
                                limit=0.9,
                            )
                            update_job(
                                jid,
                                force_broadcast=True,
                                progress=overall_progress,
                                active_segment_progress=segment_progress,
                                **_group_tracking_updates(completed_groups[0], total_groups, active_index=min(completed_groups[0] + 1, total_groups)),
                            )
                        except Exception:
                            pass

                scratch_wav = pdir / f"output_{j.id}.wav"
                try:
                    rc = xtts_generate_script(script_json_path=script_path, out_wav=scratch_wav, on_output=chapter_on_output, cancel_check=cancel_check, speed=speed)
                finally:
                    if script_path.exists():
                        script_path.unlink()
                    if scratch_wav.exists():
                        scratch_wav.unlink()

                if rc == 0:
                    update_job(jid, status="finalizing", progress=0.91, **_group_tracking_updates(total_groups, total_groups))
                    segment_paths = []
                    last_path = None
                    for group in build_chunk_groups(load_chunk_segments(j.chapter_id), j.speaker_profile):
                        group_path = pdir / f"chunk_{group['segments'][0]['id']}.wav"
                        if group_path.exists() and group_path != last_path:
                            segment_paths.append(group_path)
                            last_path = group_path
                    if not segment_paths:
                        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="No valid segment audio was available to stitch.")
                        return
                    rc = stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
            else:
                rc = _generate_direct_xtts(text, j, out_wav, on_output, cancel_check, default_sw, speed)
        else:
            rc = _generate_direct_xtts(text, j, out_wav, on_output, cancel_check, default_sw, speed)

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return

    if rc != 0 or not out_wav.exists():
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Generation failed (rc={rc}).")
        return

    # Finalize (MP3 conversion)
    if j.make_mp3:
        update_job(
            jid,
            status="finalizing",
            progress=0.99,
            completed_render_groups=j.render_group_count if getattr(j, "render_group_count", 0) else 0,
            render_group_count=getattr(j, "render_group_count", 0),
            active_render_group_index=0,
        )
        frc = wav_to_mp3(out_wav, out_mp3, on_output=on_output, cancel_check=cancel_check)
        if frc == 0 and out_mp3.exists():
            if j.chapter_id and generated_segment_audio:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r['id'] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(
                jid,
                status="done",
                finished_at=time.time(),
                progress=1.0,
                output_wav=out_wav.name,
                output_mp3=out_mp3.name,
                completed_render_groups=getattr(j, "render_group_count", 0),
                render_group_count=getattr(j, "render_group_count", 0),
                active_render_group_index=0,
            )
        else:
            if j.chapter_id and generated_segment_audio:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r['id'] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(
                jid,
                status="done",
                finished_at=time.time(),
                progress=1.0,
                output_wav=out_wav.name,
                error="MP3 conversion failed (using WAV fallback)",
                completed_render_groups=getattr(j, "render_group_count", 0),
                render_group_count=getattr(j, "render_group_count", 0),
                active_render_group_index=0,
            )
    else:
        if j.chapter_id and generated_segment_audio:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                sids = [r['id'] for r in cursor.fetchall()]
                update_segments_status_bulk(sids, j.chapter_id, "done")
        update_job(
            jid,
            status="done",
            finished_at=time.time(),
            progress=1.0,
            output_wav=out_wav.name,
            completed_render_groups=getattr(j, "render_group_count", 0),
            render_group_count=getattr(j, "render_group_count", 0),
            active_render_group_index=0,
        )
