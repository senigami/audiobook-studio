from __future__ import annotations
import logging
import shutil
from pathlib import Path

try:
    from studio_plugin_sdk.errors import BridgeError  # alias registered by plugin_loader
    from studio_plugin_sdk.plugin_utils import make_segment_output_handler
except ImportError:
    from app.studio_plugin_sdk.errors import BridgeError  # fallback for test/direct import
    from app.studio_plugin_sdk.plugin_utils import make_segment_output_handler
from .helpers import (
    _profile_inputs_for_segment,
    _segment_group_weight,
    _group_display_updates,
    _group_job_progress
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level SDK context accessor — delegates to the shared PL-1 factory
# (app.studio_plugin_sdk.get_plugin_ctx), which owns the per-engine-id
# lazy singleton cache. Kept as a local, patchable name because existing
# tests patch ``<this module>._get_ctx`` directly.
# ---------------------------------------------------------------------------

def _get_ctx():
    """Return the shared StudioPluginContext for the xtts engine."""
    try:
        from studio_plugin_sdk import get_plugin_ctx  # noqa: PLC0415
    except ImportError:
        from app.studio_plugin_sdk import get_plugin_ctx  # noqa: PLC0415
    return get_plugin_ctx("xtts")


# ---------------------------------------------------------------------------
# Module-level patchable name for generate_via_bridge.
# Tests patch ``plugins.tts_xtts.plugin.studio.bake.generate_via_bridge``.
# The function itself lives in app.jobs.handlers.bridge_helpers but we keep a
# module-level alias here so existing test patches work without modification.
# ---------------------------------------------------------------------------

def generate_via_bridge(*args, **kwargs):
    """Module-level alias for bridge_helpers.generate_via_bridge — patchable."""
    from app.jobs.handlers.bridge_helpers import generate_via_bridge as _fn  # noqa: PLC0415
    return _fn(*args, **kwargs)


# ---------------------------------------------------------------------------
# Module-level patchable aliases for DB helpers (replaces late function-body
# imports so tests can patch at the plugin module boundary instead of app.*).
# ---------------------------------------------------------------------------

def get_chapter_segments(chapter_id: str):
    """Module-level alias for app.db.get_chapter_segments — patchable by tests."""
    from app.db import get_chapter_segments as _fn  # noqa: PLC0415
    return _fn(chapter_id)


def update_segment(segment_id: str, **kwargs):
    """Module-level alias for app.db.update_segment — patchable by tests."""
    from app.db import update_segment as _fn  # noqa: PLC0415
    return _fn(segment_id, **kwargs)


def update_queue_item(job_id: str, status: str, **kwargs):
    """Module-level alias — patchable by tests.

    Preserves the positional (job_id, status) call signature used in handler code.
    """
    from app.db import update_queue_item as _fn  # noqa: PLC0415
    return _fn(job_id, status, **kwargs)


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
# handler.py imports bake.py; bake imports handler lazily at call time.
# ---------------------------------------------------------------------------

def _handler():
    from . import handler  # noqa: PLC0415
    return handler


def handle_xtts_bake(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav):
    ctx = _get_ctx()
    h = _handler()
    sent_char_limit = ctx.get_text_chunk_limit("xtts")
    _get_segs = get_chapter_segments
    _update_seg = update_segment
    _split = safe_split_long_sentences

    on_output(f"Baking Chapter {j.chapter_id} starting...\n")
    segs = _get_segs(j.chapter_id)

    all_groups = ctx.build_chunk_groups(segs, default_profile=j.speaker_profile)
    missing_groups = [
        group for group in all_groups
        if ctx.group_needs_render(group, pdir, force_rerender=getattr(j, "force_rerender", False))
    ]

    total_missing_groups = len(all_groups)
    offset = total_missing_groups - len(missing_groups)
    missing_group_weights = [_segment_group_weight(group["segments"]) for group in all_groups]

    if missing_groups:
        # Load the project lexicon once for the whole render (zero-impact when empty).
        _lexicon_entries: list = []
        if j.project_id:
            try:
                _lexicon_entries = get_project_lexicon(j.project_id)
            except Exception:
                logger.warning("Failed to load lexicon for project %s; proceeding without substitution.", j.project_id, exc_info=True)

        full_script = []
        path_to_group = {}
        for group in missing_groups:
            char_profile = group["profile_name"]
            sw, voice_profile_dir = _profile_inputs_for_segment(char_profile, j.speaker_profile, default_sw)
            combined_text = " ".join([s['text_content'] for s in group["segments"]])
            if j.safe_mode:
                combined_text = ctx.sanitize_text(combined_text)
                combined_text = _split(combined_text, target=sent_char_limit)
            if _lexicon_entries:
                try:
                    combined_text = apply_project_lexicon(combined_text, _lexicon_entries)
                except Exception:
                    logger.warning("Lexicon substitution failed for group %s; using original text.", group["segments"][0].get("id"), exc_info=True)
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
        h.update_job(
            jid,
            **_group_display_updates(offset, total_missing_groups, 0.0, limit=0.9, active_index=offset, group_weights=missing_group_weights),
            skip_studio_job_event=True,
            skip_job_updated=True,
        )

        def _bake_progress_formula(completed, total, active_segment_progress, *, active_index):
            return {
                "progress": _group_job_progress(
                    completed, total, active_segment_progress,
                    limit=0.9, group_weights=missing_group_weights,
                ),
                **_group_display_updates(
                    completed, total, active_segment_progress,
                    limit=0.9, active_index=active_index, group_weights=missing_group_weights,
                ),
            }

        def _on_group_completed(new_completed):
            j.completed_render_groups = new_completed
            j.active_render_group_index = 0

        def _on_group_started(active_index):
            j.active_render_group_index = active_index

        bake_on_output = make_segment_output_handler(
            on_output=on_output,
            cancel_check=cancel_check,
            path_to_group=path_to_group,
            update_seg=_update_seg,
            completed_groups=completed_groups,
            total_groups=total_missing_groups,
            update_job_fn=h.update_job,
            jid=jid,
            progress_formula=_bake_progress_formula,
            on_group_completed=_on_group_completed,
            on_group_started=_on_group_started,
        )

        scratch_wav = pdir / f"output_{j.id}.wav"
        try:
            rc = generate_via_bridge(
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
    h.update_job(
        jid,
        status="running",
        progress=0.91,
        **_group_display_updates(total_missing_groups, total_missing_groups, 0.0, limit=0.9, group_weights=missing_group_weights if missing_groups else []),
        skip_studio_job_event=True,
        skip_job_updated=True,
    )
    fresh_segs = _get_segs(j.chapter_id)
    segment_paths = []
    last_path = None
    for s in fresh_segs:
        if s['audio_status'] == 'done' and s['audio_file_path']:
            spath = pdir / "segments" / s['audio_file_path']
            if spath.exists() and spath != last_path:
                segment_paths.append(spath)
                last_path = spath

    if not segment_paths:
        h.update_job(jid, status="failed", error="No valid audio segments found to stitch.")
        return

    rc = h.stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
    if (rc != 0 or not out_wav.exists()) and len(segment_paths) == 1 and segment_paths[0].exists():
        try:
            shutil.copy2(segment_paths[0], out_wav)
            rc = 0
        except Exception:
            pass

    if rc == 0 and out_wav.exists():
        duration = h.get_audio_duration(out_wav)
        update_queue_item(jid, "done", audio_length_seconds=duration, output_file=out_wav.name)
        return 0
    else:
        h.update_job(jid, status="failed", error=f"Stitching failed (rc={rc})")
        return rc
