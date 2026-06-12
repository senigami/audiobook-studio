from __future__ import annotations
import logging
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
# Tests patch ``plugins.tts_voxtral.plugin.studio.segments.generate_via_bridge``.
# ---------------------------------------------------------------------------

def generate_via_bridge(**kwargs):
    """Module-level alias for bridge_helpers.generate_via_bridge — patchable."""
    from app.jobs.handlers.bridge_helpers import generate_via_bridge as _fn  # noqa: PLC0415
    return _fn(**kwargs)


# ---------------------------------------------------------------------------
# Lazy handler accessor — avoids circular import at module body level.
# ---------------------------------------------------------------------------

def _handler():
    from . import handler  # noqa: PLC0415
    return handler


def handle_voxtral_segments(jid, j, start, on_output, cancel_check, pdir, voice_profile_dir, spk):
    """Render only the targeted segment groups (j.segment_ids), emit markers."""
    ctx = _get_ctx()
    h = _handler()

    sent_char_limit = ctx.get_text_chunk_limit("voxtral")
    sanitize_cats = ctx.get_sanitize_categories("voxtral")

    # Late imports so tests patching app.db.* intercept these calls.
    from app.db import get_chapter_segments as _get_segs, update_segment as _update_seg  # noqa: PLC0415

    all_segs = _get_segs(j.chapter_id)
    requested_ids = set(j.segment_ids)

    all_groups = ctx.build_chunk_groups(all_segs, default_profile=j.speaker_profile)
    gen_groups = [
        group for group in all_groups
        if any(s["id"] in requested_ids for s in group["segments"])
    ]

    if not gen_groups:
        h.update_job(jid, status="done", progress=1.0)
        return 0

    full_script = []
    path_to_group = {}

    for group in gen_groups:
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
        # Voxtral-specific settings
        if spk.get("voice_asset_id"):
            script_entry["voice_asset_id"] = spk["voice_asset_id"]
        if spk.get("model"):
            script_entry["model"] = spk["model"]
        if spk.get("reference_sample"):
            script_entry["reference_sample"] = spk["reference_sample"]

        full_script.append(script_entry)
        path_to_group[save_path_str] = group["segments"]

    total_groups = len(gen_groups)
    completed_groups = [0]

    def seg_on_output(line):
        on_output(line)
        if "[SEGMENT_SAVED]" in line:
            saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
            group_segs = path_to_group.get(saved_path)
            if group_segs:
                seg_filename = Path(saved_path).name
                for s in group_segs:
                    _update_seg(s["id"], audio_status="done", audio_file_path=seg_filename, audio_generated_at=time.time())
                completed_groups[0] += 1

        if "[START_SEGMENT]" in line:
            asid = line.split("[START_SEGMENT]")[1].strip()
            prog = round(completed_groups[0] / total_groups, 2) if total_groups else 1.0
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
                base = completed_groups[0] / total_groups if total_groups else 1.0
                overall = base + segment_progress / total_groups if total_groups else 1.0
                h.update_job(
                    jid,
                    force_broadcast=True,
                    progress=round(min(overall, 1.0), 2),
                    active_segment_progress=segment_progress,
                    skip_studio_job_event=True,
                    skip_job_updated=True,
                )
            except Exception:
                logger.warning("Failed to parse [PROGRESS] line: %r", line, exc_info=True)

    try:
        rc = generate_via_bridge(
            engine="voxtral",
            text="",
            out_wav=pdir / f"output_{j.id}.wav",
            profile_name=j.speaker_profile,
            on_output=seg_on_output,
            cancel_check=cancel_check,
            voice_profile_dir=str(voice_profile_dir) if voice_profile_dir else None,
            script=full_script,
            task_id=jid,
            voice_asset_id=spk.get("voice_asset_id"),
            model=spk.get("model"),
            reference_sample=spk.get("reference_sample"),
        )
    except BridgeError as exc:
        logger.error("Bridge synthesis failed in voxtral_segments: %s", exc)
        return 1
    finally:
        scratch = pdir / f"output_{j.id}.wav"
        if scratch.exists():
            scratch.unlink()
        try:
            ctx.broadcast_segments_updated(j.chapter_id)
        except Exception:
            pass

    try:
        done_c, total_c = ctx.get_chapter_segments_counts(j.chapter_id)
        final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
        h.update_job(jid, status="done", progress=final_p, finished_at=time.time())
    except Exception:
        h.update_job(jid, status="done", progress=1.0, finished_at=time.time())
    return rc
