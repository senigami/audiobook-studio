from __future__ import annotations
import logging
import time
import shutil
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

    def _group_needs_render(group: dict, _pdir: Path) -> bool:
        # force_rerender: a rebuild requires full re-synthesis; never reuse cached
        # segment audio even if the segment is marked done on disk. Mirrors the
        # standard path's _group_is_done guard so the bake path can't silently reuse.
        if getattr(j, "force_rerender", False):
            return True
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

    all_groups = ctx.build_chunk_groups(segs, default_profile=j.speaker_profile)
    missing_groups = [group for group in all_groups if _group_needs_render(group, pdir)]

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

        def bake_on_output(line):
            on_output(line)
            # A cancelled render must not write segment 'done' state: a chapter
            # reset clears segments to 'unprocessed', and a straggler [SEGMENT_SAVED]
            # from the not-yet-stopped engine would otherwise resurrect
            # audio_status='done' and make the next render reuse stale audio.
            # (Mirrors the standard_handler chapter_on_output guard / I17.)
            if "[SEGMENT_SAVED]" in line and not cancel_check():
                saved_path = line.split("[SEGMENT_SAVED]")[1].strip()
                group_segs = path_to_group.get(saved_path)
                if group_segs:
                    seg_filename = Path(saved_path).name
                    for s in group_segs:
                        _update_seg(s['id'], audio_status='done', audio_file_path=seg_filename, audio_generated_at=time.time())
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
                    h.update_job(
                        jid,
                        progress=prog,
                        active_segment_id=None,
                        active_segment_progress=0.0,
                        **_group_display_updates(completed_groups[0], total_missing_groups, 0.0, limit=0.9, group_weights=missing_group_weights),
                        skip_studio_job_event=True,
                        skip_job_updated=True,
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
                h.update_job(
                    jid,
                    force_broadcast=True,
                    progress=base_progress,
                    active_segment_id=asid,
                    active_segment_progress=0.0,
                    **_group_display_updates(completed_groups[0], total_missing_groups, 0.0, limit=0.9, active_index=min(completed_groups[0] + 1, total_missing_groups), group_weights=missing_group_weights),
                    skip_studio_job_event=True,
                    skip_job_updated=True,
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
                    h.update_job(
                        jid,
                        force_broadcast=True,
                        progress=overall_progress,
                        active_segment_progress=segment_progress,
                        **_group_display_updates(completed_groups[0], total_missing_groups, segment_progress, limit=0.9, active_index=min(completed_groups[0] + 1, total_missing_groups), group_weights=missing_group_weights),
                        skip_studio_job_event=True,
                        skip_job_updated=True,
                    )
                except Exception:
                    logger.warning("Failed to parse [PROGRESS] line: %r", line, exc_info=True)

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
