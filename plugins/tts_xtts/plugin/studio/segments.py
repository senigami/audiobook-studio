from __future__ import annotations
import logging
import time
from pathlib import Path

from studio_plugin_sdk.errors import BridgeError
from .helpers import (
    _profile_inputs_for_segment,
    _segment_group_weight,
    _group_display_updates,
    _group_job_progress
)
from ._text_utils import join_group_text, build_segment_groups

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


_SKIP_LIVE_BROADCASTS = {
    "broadcast": False,
}


def handle_xtts_segments(jid, j, start, on_output, cancel_check, default_sw, speed, pdir):
    ctx = _get_ctx()
    sent_char_limit = ctx.get_text_chunk_limit("xtts")

    all_segs = ctx.get_chapter_segments(j.chapter_id)
    requested_ids = set(j.segment_ids)
    segs_to_gen = [s for s in all_segs if s['id'] in requested_ids]
    if not segs_to_gen:
        ctx.update_job_progress(jid, status="done", progress=1.0)
        return 0

    gen_groups = build_segment_groups(segs_to_gen, all_segs, sent_char_limit)

    full_script = []
    path_to_group = {}
    for group in gen_groups:
        char_profile = group[0].get('speaker_profile_name')
        sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
        combined_text = join_group_text(group)
        if j.safe_mode:
            combined_text = ctx.sanitize_text(combined_text)
            combined_text = ctx.split_long_sentences(combined_text, sent_char_limit)
        first_sid = group[0]['id']
        seg_out = pdir / "segments" / f"{first_sid}.wav"
        seg_out.parent.mkdir(parents=True, exist_ok=True)
        save_path_str = str(seg_out.absolute())
        script_entry = {"text": combined_text, "speaker_wav": sw, "save_path": save_path_str, "id": group[0]['id']}
        if voice_profile_dir:
            script_entry["voice_profile_dir"] = voice_profile_dir
        full_script.append(script_entry)
        path_to_group[save_path_str] = group

    completed_groups = [0]
    total_requested_groups = len(gen_groups)
    requested_group_weights = [_segment_group_weight(group) for group in gen_groups]
    j.render_group_count = total_requested_groups
    j.completed_render_groups = 0
    j.active_render_group_index = 0
    ctx.update_job_progress(
        jid,
        **_group_display_updates(0, total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights),
        **_SKIP_LIVE_BROADCASTS,
    )

    def gen_on_output(line):
        on_output(line)
        if "[SEGMENT_SAVED]" in line:
            saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
            group = path_to_group.get(saved_path)
            if group:
                seg_filename = Path(saved_path).name
                for s in group:
                    ctx.update_segment(s['id'], broadcast=True, audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
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
                ctx.update_job_progress(
                    jid,
                    progress=prog,
                    active_segment_id=None,
                    active_segment_progress=0.0,
                    **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights),
                    **_SKIP_LIVE_BROADCASTS,
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
            ctx.update_job_progress(
                jid,
                broadcast=True,
                progress=base_progress,
                active_segment_id=asid,
                active_segment_progress=0.0,
                **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
                **_SKIP_LIVE_BROADCASTS,
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
                ctx.update_job_progress(
                    jid,
                    broadcast=True,
                    progress=overall_progress,
                    active_segment_progress=segment_progress,
                    **_group_display_updates(completed_groups[0], total_requested_groups, segment_progress, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
                    **_SKIP_LIVE_BROADCASTS,
                )
            except Exception:
                logger.warning("Failed to parse [PROGRESS] line: %r", line, exc_info=True)

    try:
        rc = ctx.generate_via_bridge(
            engine="xtts",
            text="",
            out_wav=pdir / f"output_{j.id}.wav",
            profile_name=j.speaker_profile,
            on_output=gen_on_output,
            cancel_check=cancel_check,
            speed=speed,
            script=full_script,
            task_id=jid,
        )
    except BridgeError as exc:
        logger.error("Bridge synthesis failed in xtts_segments: %s", exc)
        return 1
    finally:
        scratch = pdir / f"output_{j.id}.wav"
        if scratch.exists(): scratch.unlink()

        try:
            ctx.broadcast_segments_updated(j.chapter_id)
        except Exception:
            pass

    # Accurate Resumption: Update progress based on total segments
    try:
        done_c, total_c = ctx.get_chapter_segments_counts(j.chapter_id)
        final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
        ctx.update_job_progress(jid, status="done", progress=final_p, finished_at=time.time())
    except Exception:
        ctx.update_job_progress(jid, status="done", progress=1.0, finished_at=time.time())
    return rc
