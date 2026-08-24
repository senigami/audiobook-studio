from __future__ import annotations
import logging
import time

from studio_plugin_sdk.errors import BridgeError
from studio_plugin_sdk.plugin_utils import make_segment_output_handler
from studio_plugin_sdk.text import apply_lexicon as _sdk_apply_lexicon
from .helpers import (
    _profile_inputs_for_segment,
    _segment_group_weight,
    _group_display_updates,
    _group_job_progress
)
from ._text_utils import join_group_text, build_segment_groups

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level SDK context accessor — delegates to the shared PL-1 factory
# (studio_plugin_sdk.get_plugin_ctx), which owns the per-engine-id
# lazy singleton cache. Kept as a local, patchable name because existing
# tests patch ``<this module>._get_ctx`` directly.
# ---------------------------------------------------------------------------

def _get_ctx():
    """Return the shared StudioPluginContext for the xtts engine."""
    from studio_plugin_sdk import get_plugin_ctx  # noqa: PLC0415
    return get_plugin_ctx("xtts")


# ---------------------------------------------------------------------------
# Module-level aliases for host services. Each one now routes through the SDK
# context rather than importing app.* (issue #200). The NAMES are kept exactly
# as they were, because tests patch these module attributes directly.
# ---------------------------------------------------------------------------

def generate_via_bridge(*args, **kwargs):
    """Module-level alias for ctx.generate_via_bridge — patchable by tests."""
    return _get_ctx().generate_via_bridge(*args, **kwargs)


def get_chapter_segments(chapter_id: str):
    """Module-level alias for ctx.get_chapter_segments — patchable by tests."""
    return _get_ctx().get_chapter_segments(chapter_id)


def update_segment(segment_id: str, **kwargs):
    """Module-level alias for ctx.update_segment — patchable by tests."""
    return _get_ctx().update_segment(segment_id, **kwargs)


def safe_split_long_sentences(text: str, *, target: int) -> str:
    """Module-level alias for ctx.split_long_sentences — patchable by tests."""
    return _get_ctx().split_long_sentences(text, target)


def get_project_lexicon(project_id: str) -> list:
    """Module-level alias for ctx.get_lexicon — patchable by tests."""
    return _get_ctx().get_lexicon(project_id)


def apply_project_lexicon(text: str, entries: list) -> str:
    """Module-level alias for the SDK's pure lexicon utility — patchable by tests."""
    return _sdk_apply_lexicon(text, entries)


# ---------------------------------------------------------------------------
# Lazy handler accessor — avoids circular import at module body level.
# ---------------------------------------------------------------------------

def _handler():
    from . import handler  # noqa: PLC0415
    return handler


def handle_xtts_segments(jid, j, start, on_output, cancel_check, default_sw, speed, pdir):
    ctx = _get_ctx()
    h = _handler()
    sent_char_limit = ctx.get_text_chunk_limit("xtts")
    _get_segs = get_chapter_segments
    _update_seg = update_segment
    _split = safe_split_long_sentences

    all_segs = _get_segs(j.chapter_id)
    requested_ids = set(j.segment_ids)
    segs_to_gen = [s for s in all_segs if s['id'] in requested_ids]
    if not segs_to_gen:
        h.update_job(jid, status="done", progress=1.0)
        return 0

    gen_groups = build_segment_groups(segs_to_gen, all_segs, sent_char_limit)

    # Load the project lexicon once for the whole render (zero-impact when empty).
    _lexicon_entries: list = []
    if j.project_id:
        try:
            _lexicon_entries = get_project_lexicon(j.project_id)
        except Exception:
            logger.warning("Failed to load lexicon for project %s; proceeding without substitution.", j.project_id, exc_info=True)

    full_script = []
    path_to_group = {}
    for group in gen_groups:
        char_profile = group[0].get('speaker_profile_name')
        sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
        combined_text = join_group_text(group)
        if j.safe_mode:
            combined_text = ctx.sanitize_text(combined_text)
            combined_text = _split(combined_text, target=sent_char_limit)
        if _lexicon_entries:
            try:
                combined_text = apply_project_lexicon(combined_text, _lexicon_entries)
            except Exception:
                logger.warning("Lexicon substitution failed for group %s; using original text.", group[0].get("id"), exc_info=True)
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
    h.update_job(
        jid,
        **_group_display_updates(0, total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights),
        skip_studio_job_event=True,
        skip_job_updated=True,
    )

    def _segments_progress_formula(completed, total, active_segment_progress, *, active_index):
        return {
            "progress": _group_job_progress(
                completed, total, active_segment_progress,
                limit=1.0, group_weights=requested_group_weights,
            ),
            **_group_display_updates(
                completed, total, active_segment_progress,
                limit=1.0, active_index=active_index, group_weights=requested_group_weights,
            ),
        }

    def _on_group_completed(new_completed):
        j.completed_render_groups = new_completed
        j.active_render_group_index = 0

    def _on_group_started(active_index):
        j.active_render_group_index = active_index

    gen_on_output = make_segment_output_handler(
        on_output=on_output,
        cancel_check=cancel_check,
        path_to_group=path_to_group,
        update_seg=_update_seg,
        completed_groups=completed_groups,
        total_groups=total_requested_groups,
        update_job_fn=h.update_job,
        jid=jid,
        progress_formula=_segments_progress_formula,
        on_group_completed=_on_group_completed,
        on_group_started=_on_group_started,
    )

    try:
        rc = generate_via_bridge(
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
        h.update_job(jid, status="done", progress=final_p, finished_at=time.time())
    except Exception:
        h.update_job(jid, status="done", progress=1.0, finished_at=time.time())
    return rc
