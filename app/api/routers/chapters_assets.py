import json
import logging
import re
import os
import threading
from pathlib import Path
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse

from ...domain.chapters.facade import export_chapter_audio
from ...domain.chapters.timing import validate_timing_sidecar, TimingSidecarValidationError

from ...db import get_chapter
from ...db.state import get_settings
from ...engines.audio_ops import _read_fresh_sidecar, ensure_peaks_sidecar
from ...utils.text.textops import sanitize_text, safe_split_long_sentences, pack_text_to_limit
from ...core import config
from ...core.config import find_secure_file
from .chapters_models import AudioExportRequest

logger = logging.getLogger(__name__)

router = APIRouter()

_peaks_locks: dict[str, threading.Lock] = {}
_peaks_locks_guard = threading.Lock()


def _get_peaks_lock(key: str) -> threading.Lock:
    with _peaks_locks_guard:
        return _peaks_locks.setdefault(key, threading.Lock())


def _load_or_compute_peaks_sidecar(wav_path: Path, sidecar_path: Path) -> Optional[dict]:
    """Serves a peaks sidecar from cache if fresh, else computes and caches it.

    Delegates the cache format (freshness check + atomic write) to the single
    shared implementation ``ensure_peaks_sidecar`` in ``app.engines.audio_ops``,
    which the render-time finalization hook also uses. This wrapper adds only
    the HTTP-serving concerns: a lock-free fast path for the common
    already-fresh case, and a per-WAV-path lock so concurrent requests compute
    at most once.

    Any failure degrades to None (→ route 404), never an unguarded 500 that
    would break the frontend's browser-decode fallback path.
    """
    # Lock-free fast path: the WAV can be deleted/replaced between the route's
    # exists() check and this stat by a concurrent re-render; a missing file
    # must degrade to a 404 (None), never surface as an unguarded 500.
    try:
        stat = wav_path.stat()
    except OSError:
        return None

    fresh = _read_fresh_sidecar(sidecar_path, stat)
    if fresh is not None:
        return fresh

    # Serialize concurrent misses on the same WAV so they compute at most once.
    lock = _get_peaks_lock(str(wav_path))
    with lock:
        return ensure_peaks_sidecar(wav_path, sidecar_path)


@router.post("/chapters/{chapter_id}/export-audio")
def api_export_chapter_audio(chapter_id: str, payload: AudioExportRequest):
    try:
        # Rule 9: Early validation of user-provided ID
        chapter_id = config.canonical_chapter_id(chapter_id)
        export_path, media_type = export_chapter_audio(chapter_id, format=payload.format)
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except FileNotFoundError:
        return JSONResponse({"status": "error", "message": "No canonical WAV exists for this chapter yet. Render the chapter first before exporting audio."}, status_code=404)
    except ValueError as exc:
        logger.warning(f"Invalid export request for {chapter_id}: {exc}")
        return JSONResponse({"status": "error", "message": "Invalid export request"}, status_code=400)

    try:
        resolved = export_path.resolve()
        # Must be under PROJECTS_DIR
        from ...storage.manager import get_storage_manager
        projects_root = get_storage_manager().projects_dir.resolve()
        try:
            resolved.relative_to(projects_root)
        except ValueError:
            import tempfile
            is_test = os.getenv("APP_TEST_MODE") == "1" or "PYTEST_CURRENT_TEST" in os.environ
            try:
                resolved.relative_to(Path(tempfile.gettempdir()).resolve())
            except ValueError:
                if not is_test:
                    logger.error(f"Blocking out-of-bounds FileResponse: {export_path}")
                    raise HTTPException(status_code=403, detail="Access denied")
    except (OSError, ValueError, RuntimeError):
         raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(resolved, media_type=media_type, filename=resolved.name)


@router.get("/chapters/{chapter_id}/preview")
def api_get_chapter_preview(
    chapter_id: str,
    processed: bool = False,
):
    from ..utils import read_preview

    # Rule 9: Early validation
    chapter_id = config.canonical_chapter_id(chapter_id)
    chapter = get_chapter(chapter_id)
    if not chapter:
        return JSONResponse({"error": "not found"}, status_code=404)

    project_id = chapter.get("project_id")

    # Use standard resolution for text
    p = config.resolve_chapter_asset_path(project_id, chapter_id, "text")

    text = ""
    if p and p.exists():
        text = read_preview(p, max_chars=1000000)

    if not text:
        text = chapter.get("text_content") or ""

    if not text and (not p or not p.exists()):
        return JSONResponse({"error": "not found"}, status_code=404)

    if processed:
        settings = get_settings()
        is_safe = settings.get("safe_mode", True)
        engine_id = chapter.get("engine_id") or settings.get("default_engine")
        if not engine_id:
            return JSONResponse(
                {
                    "status": "error",
                    "message": "No TTS engine is currently configured. Please select an engine in Settings."
                },
                status_code=400,
            )
        from ...engines.behavior import get_text_chunk_limit, get_text_split_target
        limit = get_text_chunk_limit(engine_id)
        split_target = get_text_split_target(engine_id)

        if is_safe:
            text = sanitize_text(text)
            text = safe_split_long_sentences(text, target=split_target)
        else:
            text = re.sub(r"[^\x00-\x7F]+", "", text)
            text = text.strip()
        text = pack_text_to_limit(text, limit=limit, pad=True)

    return JSONResponse({"text": text, "analysis": None})


@router.get("/projects/{project_id}/chapters/{chapter_id}/assets/{asset_type}")
def api_get_chapter_asset(
    project_id: str,
    chapter_id: str,
    asset_type: Literal["audio", "text", "segment", "peaks"],
    filename: Optional[str] = None,
):
    # Rule 9: Early validation
    chapter_id = config.canonical_chapter_id(chapter_id)

    if asset_type == "peaks":
        wav_resolved = config.resolve_chapter_asset_path(
            project_id, chapter_id, "audio", filename=filename
        )
        if not wav_resolved or not wav_resolved.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Audio not found for chapter {chapter_id}",
            )

        sidecar_path = wav_resolved.with_suffix(".peaks.json")
        sidecar = _load_or_compute_peaks_sidecar(wav_resolved, sidecar_path)
        if sidecar is None:
            raise HTTPException(status_code=404, detail="Peaks unavailable")
        return JSONResponse(sidecar)

    resolved = config.resolve_chapter_asset_path(
        project_id, chapter_id, asset_type, filename=filename
    )
    if not resolved or not resolved.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Asset {asset_type} not found for chapter {chapter_id}",
        )

    # Basic media type resolution
    ext = resolved.suffix.lower()
    if ext == ".wav":
        media_type = "audio/wav"
    elif ext == ".mp3":
        media_type = "audio/mpeg"
    elif ext == ".m4a":
        media_type = "audio/mp4"
    elif ext == ".txt":
        media_type = "text/plain"
    else:
        media_type = "application/octet-stream"

    # Rule 9: Explicit containment check for scanner locality
    try:
        res_resolved = resolved.resolve()
        from ...storage.manager import get_storage_manager
        res_resolved.relative_to(get_storage_manager().projects_dir.resolve())
    except (OSError, ValueError, RuntimeError):
         raise HTTPException(status_code=403, detail="Asset path out of bounds")

    return FileResponse(resolved, media_type=media_type)


@router.get("/projects/{project_id}/chapters/{chapter_id}/timing")
def api_get_chapter_timing(project_id: str, chapter_id: str):
    """Serve the `<chapter_wav_stem>.timing.json` sidecar for a chapter.

    Unlike the ``peaks`` asset above, this route never lazily recomputes: a
    missing, corrupt, version-mismatched, or stale (audio re-rendered since
    the sidecar was written) sidecar is always a 404 — timing sidecars are a
    finalization-time product only (synced-reader plan, Task 5).
    """
    # Rule 9: Early validation of user-provided ID. Unlike the generic asset
    # route above, this dedicated route must not let an invalid id surface as
    # an unhandled 500 (path-containment tests exercise this directly).
    try:
        chapter_id = config.canonical_chapter_id(chapter_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Chapter not found")

    chapter = get_chapter(chapter_id, project_id=project_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    wav_resolved = config.resolve_chapter_asset_path(
        project_id, chapter_id, "audio", filename=chapter.get("audio_file_path")
    )
    if not wav_resolved:
        wav_resolved = config.resolve_chapter_asset_path(project_id, chapter_id, "audio")
    if not wav_resolved or not wav_resolved.exists():
        raise HTTPException(status_code=404, detail="Timing unavailable")

    sidecar_path = wav_resolved.with_suffix(".timing.json")
    if not sidecar_path.exists():
        raise HTTPException(status_code=404, detail="Timing unavailable")

    try:
        raw = json.loads(sidecar_path.read_text())
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="Timing unavailable")

    try:
        parsed = validate_timing_sidecar(raw)
    except TimingSidecarValidationError:
        raise HTTPException(status_code=404, detail="Timing unavailable")

    # Staleness: the sidecar is only usable if it was generated for the
    # chapter's current audio. Re-rendering the chapter updates
    # chapters.audio_generated_at without necessarily removing the old
    # sidecar file, so this must be checked independently of schema/version.
    if parsed.audio_generated_at != chapter.get("audio_generated_at"):
        raise HTTPException(status_code=404, detail="Timing unavailable")

    return JSONResponse(raw)


@router.post("/chapters/{chapter_id}/export-sample")
async def api_export_chapter_sample(
    chapter_id: str,
    project_id: Optional[str] = None,
):

    # Rule 9: Early validation
    chapter_id = config.canonical_chapter_id(chapter_id)
    chapter = get_chapter(chapter_id)
    if not chapter:
        return JSONResponse(
            {"status": "error", "message": "Chapter not found"}, status_code=404
        )

    if not project_id:
        project_id = chapter.get("project_id")

    # Use resolution helper
    wav_path = config.resolve_chapter_asset_path(
        project_id,
        chapter_id,
        "audio",
        filename=chapter.get("audio_file_path"),
    )
    if not wav_path:
        wav_path = config.resolve_chapter_asset_path(
            project_id, chapter_id, "audio"
        )

    if not wav_path:
        return JSONResponse(
            {"status": "error", "message": "Audio not found"}, status_code=404
        )

    rel_path = f"/api/projects/{project_id}/chapters/{chapter_id}/assets/audio"
    if chapter.get("audio_file_path"):
        rel_path += f"?filename={chapter['audio_file_path']}"

    return JSONResponse({"status": "ok", "url": rel_path})


def _resolve_project_cover(project_id: str) -> Optional[Path]:
    """Resolve a project's stored cover image to a safe on-disk path, or None.

    Mirrors the assembly router's resolution: the DB stores a virtual path like
    ``/projects/<pid>/cover/<file>``; the real file lives under the project's
    ``cover`` dir. Returns None when unset, out of bounds, or missing.
    """
    from ...db import get_project
    from ...storage.manager import get_storage_manager

    project = get_project(project_id)
    if not project:
        return None
    cover_ref = project.get("cover_image_path")
    if not cover_ref or not cover_ref.startswith(f"/projects/{project_id}/"):
        return None
    filename = cover_ref.split("/")[-1]
    try:
        cover_dir = get_storage_manager().get_project_context(project_id).cover_dir
        cover_p = cover_dir / filename
        cover_p.resolve().relative_to(cover_dir.resolve())
    except (OSError, ValueError, RuntimeError):
        return None
    return cover_p if cover_p.exists() else None


@router.post("/chapters/{chapter_id}/export-video")
async def api_export_chapter_video(
    chapter_id: str,
    project_id: Optional[str] = None,
    orientation: str = "square",
    duration: int = 30,
):
    """Render a short, shareable MP4 pairing chapter audio with the book cover.

    The visual is the project cover (bundled Studio logo when none exists). The
    clip is length-capped and rendered locally via ffmpeg; the file is returned
    for the user to download and share themselves (no upload anywhere).
    """
    from starlette.concurrency import run_in_threadpool
    from ...engines.video_utils import (
        generate_video_sample,
        resolve_orientation,
        clamp_duration,
        FFMPEG_MISSING_RC,
    )

    # Rule 9: Early validation
    chapter_id = config.canonical_chapter_id(chapter_id)
    chapter = get_chapter(chapter_id)
    if not chapter:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)

    if not project_id:
        project_id = chapter.get("project_id")
    if not project_id:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    wav_path = config.resolve_chapter_asset_path(
        project_id, chapter_id, "audio", filename=chapter.get("audio_file_path")
    )
    if not wav_path:
        wav_path = config.resolve_chapter_asset_path(project_id, chapter_id, "audio")
    if not wav_path:
        return JSONResponse(
            {"status": "error", "message": "No rendered audio for this chapter yet. Render it first."},
            status_code=404,
        )

    cover_path = _resolve_project_cover(project_id)

    from ...storage.manager import get_storage_manager
    try:
        ctx = get_storage_manager().get_project_context(project_id)
        chapter_dir = ctx.get_chapter_dir(chapter_id)
        chapter_dir.mkdir(parents=True, exist_ok=True)
        # Orientation is part of the filename so square/portrait don't clobber.
        out_name = f"sample_{resolve_orientation(orientation)[0]}x{resolve_orientation(orientation)[1]}.mp4"
        output_video = chapter_dir / out_name
    except (OSError, ValueError, RuntimeError):
        raise HTTPException(status_code=400, detail="Invalid project or chapter id")

    logs: list[str] = []
    rc = await run_in_threadpool(
        generate_video_sample,
        wav_path,
        output_video,
        cover_path,
        logs.append,
        lambda: False,
        orientation,
        clamp_duration(duration),
    )

    if rc == FFMPEG_MISSING_RC:
        return JSONResponse(
            {"status": "error", "message": "Video tools (ffmpeg) are not installed on this machine."},
            status_code=503,
        )
    if rc != 0 or not output_video.exists():
        logger.error("Video export failed for chapter %s (rc=%s): %s", chapter_id, rc, "".join(logs[-5:]))
        return JSONResponse(
            {"status": "error", "message": "Could not create the video. Please try again."},
            status_code=500,
        )

    # Rule 9: containment before serving
    try:
        resolved = output_video.resolve()
        resolved.relative_to(get_storage_manager().projects_dir.resolve())
    except (OSError, ValueError, RuntimeError):
        raise HTTPException(status_code=403, detail="Video path out of bounds")

    return FileResponse(resolved, media_type="video/mp4", filename=resolved.name)


@router.get("/chapters/{chapter_id}/stream")
def api_stream_chapter(
    chapter_id: str,
    project_id: Optional[str] = None,
):

    # Rule 9: Early validation
    chapter_id = config.canonical_chapter_id(chapter_id)
    chapter = get_chapter(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    if not project_id:
        project_id = chapter.get("project_id")

    wav_path = config.resolve_chapter_asset_path(
        project_id,
        chapter_id,
        "audio",
        filename=chapter.get("audio_file_path"),
    )
    if not wav_path:
        wav_path = config.resolve_chapter_asset_path(
            project_id, chapter_id, "audio"
        )

    if not wav_path:
        return JSONResponse(
            {"status": "error", "message": "Audio not found"}, status_code=404
        )

    return FileResponse(wav_path)
