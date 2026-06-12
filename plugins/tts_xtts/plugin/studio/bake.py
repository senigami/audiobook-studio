from __future__ import annotations
import logging
import time
import shutil
from pathlib import Path

from studio_plugin_sdk.errors import BridgeError
from .helpers import (
    _profile_inputs_for_segment,
    _segment_group_weight,
    _group_display_updates,
    _group_job_progress
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level SDK context factory (lazy singleton)
# ---------------------------------------------------------------------------

_ctx_instance = None


def _get_ctx():
    """Return the shared StudioPluginContext for the xtts engine."""
    global _ctx_instance  # noqa: PLW0603
    if _ctx_instance is None:
        from studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        _ctx_instance = StudioPluginContext("xtts")
    return _ctx_instance


def handle_xtts_bake(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav):
    ctx = _get_ctx()
    sent_char_limit = ctx.get_text_chunk_limit("xtts")

    on_output(f"Baking Chapter {j.chapter_id} starting...\n")
    segs = ctx.get_chapter_segments(j.chapter_id)

    def _group_needs_render(group: dict, _pdir: Path) -> bool:
        expected_name = f"{group['segments'][0]['id']}.wav"
        expected_path = _pdir / "segments" / expected_name
        if not expected_path.exists():
            return True
        for segment in group["segments"]:
            if segment.get("audio_status") != "done":
                return True
            if segment.get("audio_file_path") != expected_name:
                return True
        return False

    all_groups = ctx.build_chunk_groups(segs, char_limit=sent_char_limit)
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
                combined_text = ctx.sanitize_text(combined_text)
                combined_text = ctx.split_long_sentences(combined_text, sent_char_limit)
            sid = group["segments"][0]['id']
            seg_out = pdir / "segments" / f"{sid}.wav"
            seg_out.parent.mkdir(parents=True, exist_ok=True)
            save_path_str = str(seg_out.absolute())
            script_entry = {"text": combined_text, "speaker_wav": sw, "save_path": save_path_str, "id": sid}
            if voice_profile_dir:
                script_entry["voice_profile_dir"] = voice_profile_dir
            full_script.append(script_entry)
            path_to_group[save_path_str] = group["segments"]

        completed_groups = [offset]
        j.render_group_count = total_missing_groups
        j.completed_render_groups = offset
        j.active_render_group_index = offset
        ctx.update_job_fields(
            jid,
            broadcast=False,
            **_group_display_updates(offset, total_missing_groups, 0.0, limit=0.9, active_index=offset, group_weights=missing_group_weights),
        )

        def bake_on_output(line):
            on_output(line)
            if "[SEGMENT_SAVED]" in line:
                saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                group_segs = path_to_group.get(saved_path)
                if group_segs:
                    seg_filename = Path(saved_path).name
                    for s in group_segs:
                        ctx.update_segment(s['id'], audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
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
                    ctx.update_job_fields(
                        jid,
                        broadcast=False,
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
                ctx.update_job_fields(
                    jid,
                    broadcast=True,
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
                    ctx.update_job_fields(
                        jid,
                        broadcast=True,
                        progress=overall_progress,
                        active_segment_progress=segment_progress,
                        **_group_display_updates(completed_groups[0], total_missing_groups, segment_progress, limit=0.9, active_index=min(completed_groups[0] + 1, total_missing_groups), group_weights=missing_group_weights),
                    )
                except Exception:
                    logger.warning("Failed to parse [PROGRESS] line: %r", line, exc_info=True)

        scratch_wav = pdir / f"output_{j.id}.wav"
        try:
            rc = ctx.generate_via_bridge(
                engine="xtts",
                text="",
                out_wav=scratch_wav,
                profile_name=j.speaker_profile,
                on_output=bake_on_output,
                cancel_check=cancel_check,
                speed=speed,
                script=full_script,
                task_id=jid,
            )
        except BridgeError as exc:
            logger.error("Bridge synthesis failed in xtts_bake: %s", exc)
            return 1
        finally:
            if scratch_wav.exists(): scratch_wav.unlink()

    # Final Stitch
    if cancel_check(): return
    ctx.update_job_fields(
        jid,
        broadcast=False,
        status="running",
        progress=0.91,
        **_group_display_updates(total_missing_groups, total_missing_groups, 0.0, limit=0.9, group_weights=missing_group_weights if missing_groups else []),
    )
    fresh_segs = ctx.get_chapter_segments(j.chapter_id)
    segment_paths = []
    last_path = None
    for s in fresh_segs:
        if s['audio_status'] == 'done' and s['audio_file_path']:
            spath = pdir / "segments" / s['audio_file_path']
            if spath.exists() and spath != last_path:
                segment_paths.append(spath)
                last_path = spath

    if not segment_paths:
        ctx.update_job_progress(jid, status="failed", error="No valid audio segments found to stitch.")
        return

    rc = ctx.stitch_segments(
        [str(p) for p in segment_paths],
        str(out_wav),
        on_output=on_output,
        cancel_check=cancel_check,
    )
    if (rc != 0 or not out_wav.exists()) and len(segment_paths) == 1 and segment_paths[0].exists():
        try:
            shutil.copy2(segment_paths[0], out_wav)
            rc = 0
        except Exception:
            pass

    if rc == 0 and out_wav.exists():
        duration = ctx.get_audio_duration(str(out_wav))
        ctx.update_queue_item(jid, status="done", audio_length_seconds=duration, output_file=out_wav.name)
        return 0
    else:
        ctx.update_job_progress(jid, status="failed", error=f"Stitching failed (rc={rc})")
        return rc
