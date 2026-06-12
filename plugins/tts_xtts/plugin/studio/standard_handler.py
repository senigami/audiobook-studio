from __future__ import annotations
import logging
import time
import shutil
from pathlib import Path

try:
    from studio_plugin_sdk.errors import BridgeError  # alias registered by plugin_loader
except ImportError:
    from app.studio_plugin_sdk.errors import BridgeError  # fallback for test/direct import
from .helpers import _segment_group_weight

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
# Tests patch ``plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge``.
# ---------------------------------------------------------------------------

def generate_via_bridge(*args, **kwargs):
    """Module-level alias for bridge_helpers.generate_via_bridge — patchable."""
    from app.jobs.handlers.bridge_helpers import generate_via_bridge as _fn  # noqa: PLC0415
    return _fn(*args, **kwargs)


# ---------------------------------------------------------------------------
# Lazy handler accessor — avoids circular import at module body level.
# ---------------------------------------------------------------------------

def _handler():
    from . import handler  # noqa: PLC0415
    return handler


def handle_xtts_standard(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, text=None):
    ctx = _get_ctx()
    h = _handler()
    sent_char_limit = ctx.get_text_chunk_limit("xtts")
    # Late imports from app.db / textops so tests patching those modules intercept the calls.
    from app.db import update_segment as _update_seg  # noqa: PLC0415
    from app.utils.text.textops import safe_split_long_sentences as _split  # noqa: PLC0415

    if j.chapter_id:
        raw_segments = h.load_chunk_segments(j.chapter_id)
        groups = ctx.build_chunk_groups(raw_segments, default_profile=j.speaker_profile)
        if groups:
            def _group_weight(g: dict) -> int:
                return _segment_group_weight(g["segments"])

            def _group_is_done(g: dict) -> bool:
                all_segs_done = all(
                    s.get("audio_status") == "done" and s.get("audio_file_path")
                    for s in g["segments"]
                )
                if not all_segs_done:
                    return False

                first = g["segments"][0]
                chunk_path = pdir / "segments" / f"{first['id']}.wav"
                if chunk_path.exists():
                    return True

                logger.warning("RESUME: Group %s claims done but %s is missing. Healing to unprocessed.", first["id"], chunk_path)
                for s in g["segments"]:
                    ctx.update_segment(
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
            path_to_group = {}
            path_to_weight = {}
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
                try:
                    sw = h.get_speaker_wavs(profile_name) if profile_name else default_sw
                except Exception:
                    sw = default_sw
                voice_profile_dir = None
                if profile_name:
                    try:
                        voice_profile_dir = str(h.get_voice_profile_dir(profile_name))
                    except Exception:
                        voice_profile_dir = None
                processed = " ".join(group["text_parts"]).strip()
                if j.safe_mode:
                    sanitize_cats = ctx.get_sanitize_categories("xtts")
                    processed = ctx.sanitize_text(processed, sanitize_cats)
                    processed = _split(processed, target=sent_char_limit)

                seg_out = pdir / "segments" / f"{first['id']}.wav"
                seg_out.parent.mkdir(parents=True, exist_ok=True)

                save_path_str = str(seg_out.absolute())
                script_entry = {"text": processed, "speaker_wav": sw, "id": first["id"], "save_path": save_path_str}
                if voice_profile_dir:
                    script_entry["voice_profile_dir"] = voice_profile_dir
                script.append(script_entry)
                path_to_group[save_path_str] = group
                path_to_weight[save_path_str] = w

            completed_weight = [done_weight]
            completed_count = [done_count]
            _RENDER_LIMIT = 0.9

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
            h.update_job(
                jid,
                completed_render_groups=done_count,
                render_group_count=total_groups,
                active_render_group_index=done_count,
                total_render_weight=total_weight,
                completed_render_weight=done_weight,
                active_render_group_weight=0,
                grouped_progress=_progress_from_weight(),
                skip_studio_job_event=True,
                skip_job_updated=True,
            )

            active_save_path = [None]

            def chapter_on_output(line):
                on_output(line)
                if "[START_SEGMENT]" in line:
                    asid = line.split("[START_SEGMENT]")[1].strip()
                    matched_path = next(
                        (p for p, g in path_to_group.items() if g["segments"][0]["id"] == asid),
                        None,
                    )
                    active_save_path[0] = matched_path
                    j.active_render_group_index = min(completed_count[0] + 1, total_groups)
                    prog = _progress_from_weight(0.0)
                    h.update_job(
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
                        skip_studio_job_event=True,
                        skip_job_updated=True,
                    )

                if "[SEGMENT_SAVED]" in line:
                    saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                    group = path_to_group.get(saved_path)
                    if group:
                        seg_filename = Path(saved_path).name
                        generated_at = time.time()
                        for s in group["segments"]:
                            _update_seg(s["id"], audio_status="done", audio_file_path=seg_filename, audio_generated_at=generated_at)
                        w = path_to_weight.get(saved_path, 0)
                        completed_weight[0] += w
                        completed_count[0] += 1
                        j.completed_render_groups = completed_count[0]
                        j.active_render_group_index = 0
                        active_save_path[0] = None
                        prog = _progress_from_weight()
                        h.update_job(
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
                            skip_studio_job_event=True,
                            skip_job_updated=True,
                        )

                if "[PROGRESS]" in line:
                    try:
                        p_str = line.split("[PROGRESS]")[1].split("%")[0].strip()
                        segment_progress = float(p_str) / 100.0
                        prog = _progress_from_weight(segment_progress, active_save_path[0])
                        active_progress = segment_progress if active_save_path[0] else 0.0
                        h.update_job(
                            jid,
                            force_broadcast=True,
                            progress=prog,
                            active_segment_progress=active_progress,
                            completed_render_groups=completed_count[0],
                            render_group_count=total_groups,
                            total_render_weight=total_weight,
                            completed_render_weight=completed_weight[0],
                            active_render_group_weight=path_to_weight.get(active_save_path[0], 0) if active_save_path[0] else 0,
                            grouped_progress=prog,
                            skip_studio_job_event=True,
                            skip_job_updated=True,
                        )
                    except Exception:
                        pass

            scratch_wav = pdir / f"output_{j.id}.wav"
            try:
                rc = generate_via_bridge(
                    engine="xtts",
                    text=text or "",
                    out_wav=scratch_wav,
                    profile_name=j.speaker_profile,
                    on_output=chapter_on_output,
                    cancel_check=cancel_check,
                    speed=speed,
                    script=script,
                    task_id=jid,
                )
            except BridgeError as exc:
                logger.error("Bridge synthesis failed in xtts_standard: %s", exc)
                return 1
            finally:
                if scratch_wav.exists():
                    scratch_wav.unlink()

            if rc == 0:
                h.update_job(
                    jid,
                    status="running",
                    progress=0.91,
                    completed_render_groups=total_groups,
                    render_group_count=total_groups,
                    total_render_weight=total_weight,
                    completed_render_weight=total_weight,
                    active_render_group_weight=0,
                    grouped_progress=_RENDER_LIMIT,
                    skip_studio_job_event=True,
                    skip_job_updated=True,
                )
                fresh_segs = h.load_chunk_segments(j.chapter_id)
                fresh_groups = ctx.build_chunk_groups(fresh_segs, default_profile=j.speaker_profile)
                segment_paths = []
                last_path = None
                for group in fresh_groups:
                    group_path = pdir / "segments" / f"{group['segments'][0]['id']}.wav"
                    if group_path.exists() and group_path != last_path:
                        segment_paths.append(group_path)
                        last_path = group_path
                if not segment_paths:
                    h.update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="No valid segment audio was available to stitch.")
                    return 1
                rc = h.stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
                if (rc != 0 or not out_wav.exists()) and len(segment_paths) == 1 and segment_paths[0].exists():
                    try:
                        shutil.copy2(segment_paths[0], out_wav)
                        rc = 0
                    except Exception:
                        pass
                return rc
            return rc
        else:
            return generate_via_bridge(
                engine="xtts",
                text=text or "",
                out_wav=out_wav,
                profile_name=j.speaker_profile,
                on_output=on_output,
                cancel_check=cancel_check,
                speed=speed,
                safe_mode=j.safe_mode,
                task_id=jid,
            )
    else:
        return generate_via_bridge(
            engine="xtts",
            text=text or "",
            out_wav=out_wav,
            profile_name=j.speaker_profile,
            on_output=on_output,
            cancel_check=cancel_check,
            speed=speed,
            safe_mode=j.safe_mode,
            task_id=jid,
        )
