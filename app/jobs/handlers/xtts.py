from __future__ import annotations
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
    group_weights: list[int] | None = None,
) -> float:
    if total_units <= 0:
        return round(limit, 2)
    completed = max(0, min(completed_units, total_units))
    active = max(0.0, min(active_segment_progress, 1.0))
    weights = list(group_weights or [])
    if len(weights) != total_units:
        weights = [1] * total_units
    weights = [max(1, int(weight)) for weight in weights]
    total_weight = sum(weights)
    if total_weight <= 0:
        return round(limit, 2)
    completed_weight = sum(weights[:completed])
    active_weight = weights[completed] if completed < total_units else 0
    weighted_progress = (completed_weight + (active_weight * active)) / total_weight
    return round(weighted_progress * limit, 2)


def _group_tracking_updates(
    completed_units: int,
    total_units: int,
    *,
    active_index: int = 0,
    group_weights: list[int] | None = None,
) -> dict:
    weights = list(group_weights or [])
    if len(weights) != total_units:
        weights = [1] * total_units
    weights = [max(1, int(weight)) for weight in weights]
    completed = max(0, min(completed_units, total_units))
    active_weight = 0
    if active_index > 0 and weights:
        active_position = min(active_index - 1, len(weights) - 1)
        if active_position >= 0:
            active_weight = weights[active_position]
    return {
        "completed_render_groups": completed,
        "render_group_count": total_units,
        "active_render_group_index": active_index,
        "total_render_weight": sum(weights),
        "completed_render_weight": sum(weights[:completed]),
        "active_render_group_weight": active_weight,
    }


def _group_display_updates(
    completed_units: int,
    total_units: int,
    active_segment_progress: float,
    *,
    limit: float,
    active_index: int = 0,
    group_weights: list[int] | None = None,
) -> dict:
    return {
        "grouped_progress": _group_job_progress(
            completed_units,
            total_units,
            active_segment_progress,
            limit=limit,
            group_weights=group_weights,
        ),
        **_group_tracking_updates(
            completed_units,
            total_units,
            active_index=active_index,
            group_weights=group_weights,
        ),
    }


def _segment_group_weight(group: list[dict]) -> int:
    return max(1, sum(len((segment.get("text_content") or "").strip()) for segment in group))


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

        def _group_needs_render(group: dict, pdir: Path) -> bool:
            expected_name = f"chunk_{group['segments'][0]['id']}.wav"
            expected_path = pdir / expected_name
            if not expected_path.exists():
                return True
            for segment in group["segments"]:
                if segment.get("audio_status") != "done":
                    return True
                if segment.get("audio_file_path") != expected_name:
                    return True
            return False

        all_groups = build_chunk_groups(segs, j.speaker_profile)
        missing_groups = [group for group in all_groups if _group_needs_render(group, pdir)]

        total_missing_groups = len(all_groups)
        offset = total_missing_groups - len(missing_groups)
        missing_group_weights = [_segment_group_weight(group["segments"]) for group in all_groups]

        if missing_groups:
            full_script = []
            path_to_group = {}
            for group in missing_groups:
                char_profile = group["profile_name"]
                sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
                combined_text = " ".join([s['text_content'] for s in group["segments"]])
                if j.safe_mode:
                    combined_text = sanitize_for_xtts(combined_text)
                    combined_text = safe_split_long_sentences(combined_text, target=SENT_CHAR_LIMIT)
                sid = group["segments"][0]['id']
                seg_out = pdir / f"chunk_{sid}.wav"
                save_path_str = str(seg_out.absolute())
                script_entry = {"text": combined_text, "speaker_wav": sw, "save_path": save_path_str, "id": sid}
                if voice_profile_dir:
                    script_entry["voice_profile_dir"] = voice_profile_dir
                full_script.append(script_entry)
                path_to_group[save_path_str] = group["segments"]

            script_path = pdir / f"bake_{j.id}_script.json"
            script_path.write_text(json.dumps(full_script), encoding="utf-8")

            completed_groups = [offset]
            j.render_group_count = total_missing_groups
            j.completed_render_groups = offset
            j.active_render_group_index = offset
            update_job(jid, **_group_display_updates(offset, total_missing_groups, 0.0, limit=0.9, active_index=offset, group_weights=missing_group_weights))
            def bake_on_output(line):
                on_output(line)
                if "[SEGMENT_SAVED]" in line:
                    saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                    group_segs = path_to_group.get(saved_path)
                    if group_segs:
                        seg_filename = Path(saved_path).name
                        for s in group_segs:
                            update_segment(s['id'], audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
                        completed_groups[0] += 1
                        j.completed_render_groups = completed_groups[0]
                        j.active_render_group_index = 0
                        prog = _group_job_progress(
                            completed_groups[0],
                            total_missing_groups,
                            0.0,
                            limit=0.9,
                            group_weights=missing_group_weights,
                        )
                        update_job(
                            jid,
                            progress=prog,
                            active_segment_id=None,
                            active_segment_progress=0.0,
                            **_group_display_updates(completed_groups[0], total_missing_groups, 0.0, limit=0.9, group_weights=missing_group_weights),
                        )

                if "[START_SEGMENT]" in line:
                    asid = line.split("[START_SEGMENT]")[1].strip()
                    j.active_render_group_index = min(completed_groups[0] + 1, total_missing_groups)
                    base_progress = _group_job_progress(
                        completed_groups[0],
                        total_missing_groups,
                        0.0,
                        limit=0.9,
                        group_weights=missing_group_weights,
                    )
                    update_job(
                        jid,
                        force_broadcast=True,
                        progress=base_progress,
                        active_segment_id=asid,
                        active_segment_progress=0.0,
                        **_group_display_updates(completed_groups[0], total_missing_groups, 0.0, limit=0.9, active_index=min(completed_groups[0] + 1, total_missing_groups), group_weights=missing_group_weights),
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
                            group_weights=missing_group_weights,
                        )
                        update_job(
                            jid,
                            force_broadcast=True,
                            progress=overall_progress,
                            active_segment_progress=segment_progress,
                            **_group_display_updates(completed_groups[0], total_missing_groups, segment_progress, limit=0.9, active_index=min(completed_groups[0] + 1, total_missing_groups), group_weights=missing_group_weights),
                        )
                    except: pass

            scratch_wav = pdir / f"output_{j.id}.wav"
            try:
                xtts_generate_script(script_json_path=script_path, out_wav=scratch_wav, on_output=bake_on_output, cancel_check=cancel_check, speed=speed)
            finally:
                if script_path.exists(): script_path.unlink()
                if scratch_wav.exists(): scratch_wav.unlink()

        # Final Stitch
        if cancel_check(): return
        update_job(jid, status="finalizing", progress=0.91, **_group_display_updates(total_missing_groups, total_missing_groups, 0.0, limit=0.9, group_weights=missing_group_weights if missing_groups else []))
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
        requested_group_weights = [_segment_group_weight(group) for group in gen_groups]
        j.render_group_count = total_requested_groups
        j.completed_render_groups = 0
        j.active_render_group_index = 0
        update_job(jid, **_group_display_updates(0, total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights))
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
                    prog = _group_job_progress(
                        completed_groups[0],
                        total_requested_groups,
                        0.0,
                        limit=1.0,
                        group_weights=requested_group_weights,
                    )
                    update_job(
                        jid,
                        progress=prog,
                        active_segment_id=None,
                        active_segment_progress=0.0,
                        **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights),
                    )

            if "[START_SEGMENT]" in line:
                asid = line.split("[START_SEGMENT]")[1].strip()
                j.active_render_group_index = min(completed_groups[0] + 1, total_requested_groups)
                base_progress = _group_job_progress(
                    completed_groups[0],
                    total_requested_groups,
                    0.0,
                    limit=1.0,
                    group_weights=requested_group_weights,
                )
                update_job(
                    jid,
                    force_broadcast=True,
                    progress=base_progress,
                    active_segment_id=asid,
                    active_segment_progress=0.0,
                    **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
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
                        group_weights=requested_group_weights,
                    )
                    update_job(
                        jid,
                        force_broadcast=True,
                        progress=overall_progress,
                        active_segment_progress=segment_progress,
                        **_group_display_updates(completed_groups[0], total_requested_groups, segment_progress, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
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
            update_job(jid, status="done", progress=final_p, finished_at=time.time())
        except Exception:
            update_job(jid, status="done", progress=1.0, finished_at=time.time())
        return

    else:
        # Standard Chapter mode
        if j.chapter_id:
            groups = build_chunk_groups(load_chunk_segments(j.chapter_id), j.speaker_profile)
            if groups:
                # --- Weight-based resume partition ---
                # Every group gets an immutable weight (character count).
                # total_weight is fixed for the entire chapter.
                # completed_weight starts at the sum of already-done groups.
                # As remaining groups finish (in any order) their weight is added.
                # progress = completed_weight[0] / total_weight  →  always sums to 100%.

                def _group_weight(g: dict) -> int:
                    return max(1, int(g.get("text_length") or 0))

                def _group_is_done(g: dict) -> bool:
                    import logging as _logging
                    _log = _logging.getLogger(__name__)
                    all_segs_done = all(
                        s.get("audio_status") == "done" and s.get("audio_file_path")
                        for s in g["segments"]
                    )
                    if not all_segs_done:
                        return False

                    first = g["segments"][0]
                    chunk_path = pdir / f"chunk_{first['id']}.wav"
                    if chunk_path.exists():
                        return True

                    # The DB says it's done, but the audio file is completely missing from disk.
                    # This means the DB is out of sync (stale). We must actively heal the DB
                    # back to 'unprocessed' so the Performance Tab reflects the truth.
                    _log.warning("RESUME: Group %s claims to be done, but %s is missing. Healing DB to unprocessed.", first["id"], chunk_path)
                    for s in g["segments"]:
                        update_segment(
                            s["id"],
                            broadcast=True,
                            audio_status="unprocessed",
                            audio_file_path=None,
                            audio_generated_at=None,
                        )
                    return False



                total_weight = sum(_group_weight(g) for g in groups)
                total_groups = len(groups)

                script = []
                path_to_group = {}   # save_path → (group, weight)
                path_to_weight = {}  # save_path → weight
                done_count = 0
                done_weight = 0

                for group in groups:
                    w = _group_weight(group)
                    if _group_is_done(group):
                        done_count += 1
                        done_weight += w
                        continue

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
                    path_to_weight[save_path_str] = w

                # Mutable accumulators (list so closures can mutate them)
                completed_weight = [done_weight]
                completed_count = [done_count]

                _RENDER_LIMIT = 0.9  # leave headroom for stitching

                def _progress_from_weight(active_seg_p: float = 0.0, active_path: str | None = None) -> float:
                    active_contrib = 0.0
                    if active_path and active_seg_p > 0:
                        active_w = path_to_weight.get(active_path, 0)
                        active_contrib = active_w * active_seg_p
                    raw = (completed_weight[0] + active_contrib) / total_weight if total_weight > 0 else 1.0
                    return round(min(_RENDER_LIMIT, raw), 4)

                j.render_group_count = total_groups
                j.completed_render_groups = done_count
                j.active_render_group_index = done_count
                update_job(
                    jid,
                    completed_render_groups=done_count,
                    render_group_count=total_groups,
                    active_render_group_index=done_count,
                    total_render_weight=total_weight,
                    completed_render_weight=done_weight,
                    active_render_group_weight=0,
                    grouped_progress=_progress_from_weight(),
                )

                active_save_path = [None]  # track currently-rendering group's path

                script_path = pdir / f"{j.id}_script.json"
                script_path.write_text(json.dumps(script), encoding="utf-8")

                def chapter_on_output(line):
                    on_output(line)

                    if "[START_SEGMENT]" in line:
                        asid = line.split("[START_SEGMENT]")[1].strip()
                        # Find which save_path corresponds to this segment id
                        matched_path = next(
                            (p for p, g in path_to_group.items() if g["segments"][0]["id"] == asid),
                            None,
                        )
                        active_save_path[0] = matched_path
                        j.active_render_group_index = min(completed_count[0] + 1, total_groups)
                        prog = _progress_from_weight(0.0)
                        update_job(
                            jid,
                            force_broadcast=True,
                            progress=prog,
                            active_segment_id=asid,
                            active_segment_progress=0.0,
                            completed_render_groups=completed_count[0],
                            render_group_count=total_groups,
                            active_render_group_index=j.active_render_group_index,
                            total_render_weight=total_weight,
                            completed_render_weight=completed_weight[0],
                            active_render_group_weight=path_to_weight.get(matched_path, 0) if matched_path else 0,
                            grouped_progress=prog,
                        )

                    if "[SEGMENT_SAVED]" in line:
                        saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                        group = path_to_group.get(saved_path)
                        if group:
                            seg_filename = Path(saved_path).name
                            generated_at = time.time()
                            for s in group["segments"]:
                                update_segment(s["id"], broadcast=True, audio_status="done", audio_file_path=seg_filename, audio_generated_at=generated_at)
                            w = path_to_weight.get(saved_path, 0)
                            completed_weight[0] += w
                            completed_count[0] += 1
                            j.completed_render_groups = completed_count[0]
                            j.active_render_group_index = 0
                            active_save_path[0] = None
                            prog = _progress_from_weight()
                            update_job(
                                jid,
                                progress=prog,
                                active_segment_id=None,
                                active_segment_progress=0.0,
                                completed_render_groups=completed_count[0],
                                render_group_count=total_groups,
                                active_render_group_index=0,
                                total_render_weight=total_weight,
                                completed_render_weight=completed_weight[0],
                                active_render_group_weight=0,
                                grouped_progress=prog,
                            )

                    if "[PROGRESS]" in line:
                        try:
                            p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                            segment_progress = float(p_str) / 100.0
                            prog = _progress_from_weight(segment_progress, active_save_path[0])
                            update_job(
                                jid,
                                force_broadcast=True,
                                progress=prog,
                                active_segment_progress=segment_progress,
                                completed_render_groups=completed_count[0],
                                render_group_count=total_groups,
                                total_render_weight=total_weight,
                                completed_render_weight=completed_weight[0],
                                active_render_group_weight=path_to_weight.get(active_save_path[0], 0) if active_save_path[0] else 0,
                                grouped_progress=prog,
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
                    update_job(jid, status="finalizing", progress=0.91,
                               completed_render_groups=total_groups, render_group_count=total_groups,
                               total_render_weight=total_weight, completed_render_weight=total_weight,
                               active_render_group_weight=0, grouped_progress=_RENDER_LIMIT)
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
        )
