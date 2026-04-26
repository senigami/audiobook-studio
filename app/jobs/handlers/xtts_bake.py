from __future__ import annotations
import json
import time
from pathlib import Path

from ...config import SENT_CHAR_LIMIT
from ...chunk_groups import build_chunk_groups
from ...state import update_job
from ...engines import xtts_generate_script, stitch_segments, get_audio_duration
from ...textops import sanitize_for_xtts, safe_split_long_sentences
from .xtts_helpers import (
    _profile_inputs_for_segment, 
    _segment_group_weight, 
    _group_display_updates,
    _group_job_progress
)


def handle_xtts_bake(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav):
    from ...db import update_segment, get_chapter_segments

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
            # Note: storage_version logic is handled by the caller or passed in if needed.
            # Assuming storage_version 1 for legacy compatibility in this extraction, 
            # but usually it's passed. Let's assume it's available on j or passed.
            storage_version = getattr(j, "storage_version", 1)
            if storage_version >= 2:
                seg_out = pdir / "segments" / f"{sid}.wav"
                seg_out.parent.mkdir(parents=True, exist_ok=True)
            else:
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
        return 0
    else:
        update_job(jid, status="failed", error=f"Stitching failed (rc={rc})")
        return rc
