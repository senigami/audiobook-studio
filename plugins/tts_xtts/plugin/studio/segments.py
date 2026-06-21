from __future__ import annotations
import logging
import time
from pathlib import Path

try:
    from studio_plugin_sdk.errors import BridgeError  # alias registered by plugin_loader
except ImportError:
    from app.studio_plugin_sdk.errors import BridgeError  # fallback for test/direct import
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
        try:
            from studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        except ImportError:
            from app.studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        _ctx_instance = StudioPluginContext("xtts")
    return _ctx_instance


# ---------------------------------------------------------------------------
# Module-level patchable alias for generate_via_bridge.
# Tests patch ``plugins.tts_xtts.plugin.studio.segments.generate_via_bridge``.
# ---------------------------------------------------------------------------

def generate_via_bridge(*args, **kwargs):
    """Module-level alias for bridge_helpers.generate_via_bridge — patchable."""
    from app.jobs.handlers.bridge_helpers import generate_via_bridge as _fn  # noqa: PLC0415
    return _fn(*args, **kwargs)


# ---------------------------------------------------------------------------
# Module-level patchable aliases for DB helpers.
# ---------------------------------------------------------------------------

def get_chapter_segments(chapter_id: str):
    """Module-level alias for app.db.get_chapter_segments — patchable by tests."""
    from app.db import get_chapter_segments as _fn  # noqa: PLC0415
    return _fn(chapter_id)


def update_segment(segment_id: str, **kwargs):
    """Module-level alias for app.db.update_segment — patchable by tests."""
    from app.db import update_segment as _fn  # noqa: PLC0415
    return _fn(segment_id, **kwargs)


def safe_split_long_sentences(text: str, *, target: int) -> str:
    """Module-level alias for textops.safe_split_long_sentences — patchable by tests."""
    from app.utils.text.textops import safe_split_long_sentences as _fn  # noqa: PLC0415
    return _fn(text, target=target)


def get_project_lexicon(project_id: str) -> list:
    """Module-level alias for db.lexicon.get_lexicon — patchable by tests."""
    from app.db.lexicon import get_lexicon as _fn  # noqa: PLC0415
    return _fn(project_id)


def apply_project_lexicon(text: str, entries: list) -> str:
    """Module-level alias for utils.text.lexicon.apply_lexicon — patchable by tests."""
    from app.utils.text.lexicon import apply_lexicon as _fn  # noqa: PLC0415
    return _fn(text, entries)


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

    def gen_on_output(line):
        on_output(line)
        # A cancelled render must not write segment 'done' state: a chapter reset
        # clears segments to 'unprocessed', and a straggler [SEGMENT_SAVED] from the
        # not-yet-stopped engine would otherwise resurrect audio_status='done' and
        # make the next render reuse stale audio. (Mirrors the standard_handler
        # chapter_on_output guard / I17.)
        if "[SEGMENT_SAVED]" in line and not cancel_check():
            saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
            group = path_to_group.get(saved_path)
            if group:
                seg_filename = Path(saved_path).name
                for s in group:
                    _update_seg(s['id'], audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
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
                h.update_job(
                    jid,
                    progress=prog,
                    active_segment_id=None,
                    active_segment_progress=0.0,
                    **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, group_weights=requested_group_weights),
                    skip_studio_job_event=True,
                    skip_job_updated=True,
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
            h.update_job(
                jid,
                force_broadcast=True,
                progress=base_progress,
                active_segment_id=asid,
                active_segment_progress=0.0,
                **_group_display_updates(completed_groups[0], total_requested_groups, 0.0, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
                skip_studio_job_event=True,
                skip_job_updated=True,
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
                h.update_job(
                    jid,
                    force_broadcast=True,
                    progress=overall_progress,
                    active_segment_progress=segment_progress,
                    **_group_display_updates(completed_groups[0], total_requested_groups, segment_progress, limit=1.0, active_index=min(completed_groups[0] + 1, total_requested_groups), group_weights=requested_group_weights),
                    skip_studio_job_event=True,
                    skip_job_updated=True,
                )
            except Exception:
                logger.warning("Failed to parse [PROGRESS] line: %r", line, exc_info=True)

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
