from __future__ import annotations
import logging
import shutil
import time
from pathlib import Path

try:
    from studio_plugin_sdk.errors import BridgeError  # alias registered by plugin_loader
except ImportError:
    from app.studio_plugin_sdk.errors import BridgeError  # fallback for test/direct import

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level SDK context factory (lazy singleton)
# ---------------------------------------------------------------------------

_ctx_instance = None


def _get_ctx():
    """Return the shared StudioPluginContext for the voxtral engine."""
    global _ctx_instance  # noqa: PLW0603
    if _ctx_instance is None:
        try:
            from studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        except ImportError:
            from app.studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        _ctx_instance = StudioPluginContext("voxtral")
    return _ctx_instance


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


# ---------------------------------------------------------------------------
# Lazy handler accessor — avoids circular import at module body level.
# ---------------------------------------------------------------------------

def _handler():
    from . import handler  # noqa: PLC0415
    return handler


def _group_needs_render(group: dict, pdir: Path) -> bool:
    """Return True if the group's segment audio is missing or stale."""
    expected_name = f"{group['segments'][0]['id']}.wav"
    expected_path = pdir / "segments" / expected_name
    if not expected_path.exists():
        return True
    for segment in group["segments"]:
        if segment.get("audio_status") != "done":
            return True
        if segment.get("audio_file_path") != expected_name:
            return True
    return False


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
    missing_groups = [group for group in all_groups if _group_needs_render(group, pdir)]

    total_groups = len(all_groups)
    offset = total_groups - len(missing_groups)

    if missing_groups:
        full_script = []
        path_to_group = {}

        for group in missing_groups:
            combined_text = " ".join((s.get("text_content") or "").strip() for s in group["segments"])
            if j.safe_mode:
                combined_text = ctx.sanitize_text(combined_text, sanitize_cats)

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

        def bake_on_output(line):
            on_output(line)
            if "[SEGMENT_SAVED]" in line:
                saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                group_segs = path_to_group.get(saved_path)
                if group_segs:
                    seg_filename = Path(saved_path).name
                    for s in group_segs:
                        _update_seg(s["id"], audio_status="done", audio_file_path=seg_filename, audio_generated_at=time.time())
                    completed_groups[0] += 1
                    prog = round(min(completed_groups[0] / total_groups * 0.9, 0.9), 2) if total_groups else 0.9
                    h.update_job(
                        jid,
                        progress=prog,
                        active_segment_id=None,
                        active_segment_progress=0.0,
                        skip_studio_job_event=True,
                        skip_job_updated=True,
                    )

            if "[START_SEGMENT]" in line:
                asid = line.split("[START_SEGMENT]")[1].strip()
                prog = round(min(completed_groups[0] / total_groups * 0.9, 0.9), 2) if total_groups else 0.0
                h.update_job(
                    jid,
                    force_broadcast=True,
                    progress=prog,
                    active_segment_id=asid,
                    active_segment_progress=0.0,
                    skip_studio_job_event=True,
                    skip_job_updated=True,
                )

            if "[PROGRESS]" in line:
                try:
                    p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                    segment_progress = float(p_str) / 100.0
                    base = completed_groups[0] / total_groups * 0.9 if total_groups else 0.0
                    frac = segment_progress / total_groups * 0.9 if total_groups else 0.0
                    h.update_job(
                        jid,
                        force_broadcast=True,
                        progress=round(min(base + frac, 0.9), 2),
                        active_segment_progress=segment_progress,
                        skip_studio_job_event=True,
                        skip_job_updated=True,
                    )
                except Exception:
                    logger.warning("Failed to parse [PROGRESS] line: %r", line, exc_info=True)

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
