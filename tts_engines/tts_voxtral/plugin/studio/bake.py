from __future__ import annotations
import logging
import shutil

from studio_plugin_sdk.errors import BridgeError
from studio_plugin_sdk.plugin_utils import make_segment_output_handler

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level SDK context accessor — delegates to the shared PL-1 factory
# (studio_plugin_sdk.get_plugin_ctx), which owns the per-engine-id
# lazy singleton cache. Kept as a local, patchable name because existing
# tests patch ``<this module>._get_ctx`` directly.
# ---------------------------------------------------------------------------

def _get_ctx():
    """Return the shared StudioPluginContext for the voxtral engine."""
    from studio_plugin_sdk import get_plugin_ctx  # noqa: PLC0415
    return get_plugin_ctx("voxtral")


# ---------------------------------------------------------------------------
# Module-level patchable alias for generate_via_bridge.
# Tests patch ``plugins.tts_voxtral.plugin.studio.bake.generate_via_bridge``.
# ---------------------------------------------------------------------------

def generate_via_bridge(**kwargs):
    """Module-level alias for bridge_helpers.generate_via_bridge — patchable."""
    from app.jobs.handlers.bridge_helpers import generate_via_bridge as _fn  # noqa: PLC0415
    return _fn(**kwargs)


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


def update_queue_item(job_id: str, status: str, **kwargs):
    """Module-level alias — patchable by tests.

    Preserves positional (job_id, status) call signature.
    """
    from app.db import update_queue_item as _fn  # noqa: PLC0415
    return _fn(job_id, status, **kwargs)


def stitch_segments(*args, **kwargs):
    """Module-level alias for audio_ops.stitch_segments — patchable by tests."""
    from app.engines.audio_ops import stitch_segments as _fn  # noqa: PLC0415
    return _fn(*args, **kwargs)


def get_audio_duration(path):
    """Module-level alias for audio_ops.get_audio_duration — patchable by tests."""
    from app.engines.audio_ops import get_audio_duration as _fn  # noqa: PLC0415
    return _fn(path)


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


def handle_voxtral_bake(jid, j, start, on_output, cancel_check, pdir, out_wav, voice_profile_dir, spk):
    """Bake a chapter: render only missing/stale groups, then stitch into out_wav."""
    ctx = _get_ctx()
    h = _handler()

    sanitize_cats = ctx.get_sanitize_categories("voxtral")

    _get_segs = get_chapter_segments
    _update_seg = update_segment

    on_output(f"Baking Chapter {j.chapter_id} starting...\n")
    segs = _get_segs(j.chapter_id)

    all_groups = ctx.build_chunk_groups(segs, default_profile=j.speaker_profile)
    missing_groups = [
        group for group in all_groups
        if ctx.group_needs_render(group, pdir, force_rerender=getattr(j, "force_rerender", False))
    ]

    total_groups = len(all_groups)
    offset = total_groups - len(missing_groups)

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
            combined_text = " ".join((s.get("text_content") or "").strip() for s in group["segments"])
            if j.safe_mode:
                combined_text = ctx.sanitize_text(combined_text, sanitize_cats)
            if _lexicon_entries:
                try:
                    combined_text = apply_project_lexicon(combined_text, _lexicon_entries)
                except Exception:
                    logger.warning("Lexicon substitution failed for group %s; using original text.", group["segments"][0].get("id"), exc_info=True)

            sid = group["segments"][0]["id"]
            seg_out = pdir / "segments" / f"{sid}.wav"
            seg_out.parent.mkdir(parents=True, exist_ok=True)
            save_path_str = str(seg_out.absolute())

            script_entry = {
                "text": combined_text,
                "save_path": save_path_str,
                "id": sid,
                "profile_name": group.get("profile_name") or j.speaker_profile,
            }
            if voice_profile_dir:
                script_entry["voice_profile_dir"] = str(voice_profile_dir)
            if spk.get("voice_asset_id"):
                script_entry["voice_asset_id"] = spk["voice_asset_id"]
            if spk.get("model"):
                script_entry["model"] = spk["model"]
            if spk.get("reference_sample"):
                script_entry["reference_sample"] = spk["reference_sample"]

            full_script.append(script_entry)
            path_to_group[save_path_str] = group["segments"]

        completed_groups = [offset]

        def _bake_progress_formula(completed, total, active_segment_progress, *, active_index):
            # Linear (unweighted) curve, distinct from xtts's weighted formula.
            # NOTE: the [SEGMENT_SAVED] call site historically had a
            # zero-groups fallback of 0.9 while [START_SEGMENT]/[PROGRESS]
            # fell back to 0.0 — both are unreachable in practice (a
            # zero-group bake never enters the `if missing_groups:` block
            # that constructs this closure), so a single formula covers all
            # three call sites without changing observable behavior.
            base = completed / total * 0.9 if total else 0.0
            frac = active_segment_progress / total * 0.9 if total else 0.0
            return {"progress": round(min(base + frac, 0.9), 2)}

        bake_on_output = make_segment_output_handler(
            on_output=on_output,
            cancel_check=cancel_check,
            path_to_group=path_to_group,
            update_seg=_update_seg,
            completed_groups=completed_groups,
            total_groups=total_groups,
            update_job_fn=h.update_job,
            jid=jid,
            progress_formula=_bake_progress_formula,
        )

        scratch_wav = pdir / f"output_{j.id}.wav"
        try:
            rc = generate_via_bridge(
                engine="voxtral",
                text="",
                out_wav=scratch_wav,
                profile_name=j.speaker_profile,
                on_output=bake_on_output,
                cancel_check=cancel_check,
                voice_profile_dir=str(voice_profile_dir) if voice_profile_dir else None,
                script=full_script,
                task_id=jid,
                voice_asset_id=spk.get("voice_asset_id"),
                model=spk.get("model"),
                reference_sample=spk.get("reference_sample"),
            )
        except BridgeError as exc:
            logger.error("Bridge synthesis failed in voxtral_bake: %s", exc)
            return 1
        finally:
            if scratch_wav.exists():
                scratch_wav.unlink()

        if rc != 0:
            h.update_job(jid, status="failed", error=f"Bake synthesis failed (rc={rc})")
            return rc

    # Final stitch
    if cancel_check():
        return 1

    h.update_job(
        jid,
        status="running",
        progress=0.91,
        skip_studio_job_event=True,
        skip_job_updated=True,
    )

    fresh_segs = _get_segs(j.chapter_id)
    segment_paths = []
    last_path = None
    for s in fresh_segs:
        if s["audio_status"] == "done" and s.get("audio_file_path"):
            spath = pdir / "segments" / s["audio_file_path"]
            if spath.exists() and spath != last_path:
                segment_paths.append(spath)
                last_path = spath

    if not segment_paths:
        h.update_job(jid, status="failed", error="No valid audio segments found to stitch.")
        return 1

    rc = stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
    if (rc != 0 or not out_wav.exists()) and len(segment_paths) == 1 and segment_paths[0].exists():
        try:
            shutil.copy2(segment_paths[0], out_wav)
            rc = 0
        except Exception:
            pass

    if rc == 0 and out_wav.exists():
        duration = get_audio_duration(out_wav)
        update_queue_item(jid, "done", audio_length_seconds=duration, output_file=out_wav.name)
        return 0
    else:
        h.update_job(jid, status="failed", error=f"Stitching failed (rc={rc})")
        return rc
