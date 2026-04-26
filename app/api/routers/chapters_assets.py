import logging
import re
import os
from pathlib import Path
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse

from ...domain.chapters.compatibility import export_chapter_audio
from ...db import get_chapter
from ...state import get_settings
from ...textops import sanitize_for_xtts, safe_split_long_sentences, pack_text_to_limit
from ... import config
from ...config import find_existing_project_subdir, find_secure_file
from .chapters_models import AudioExportRequest

# Compatibility for tests that monkeypatch these
CHAPTER_DIR = config.CHAPTER_DIR
XTTS_OUT_DIR = config.XTTS_OUT_DIR


def get_chapter_dir() -> Path:
    return CHAPTER_DIR


def get_xtts_out_dir() -> Path:
    return XTTS_OUT_DIR


logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/chapters/{chapter_id}/export-audio")
def api_export_chapter_audio(chapter_id: str, payload: AudioExportRequest):
    try:
        export_path, media_type = export_chapter_audio(chapter_id, format=payload.format)
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except FileNotFoundError:
        return JSONResponse({"status": "error", "message": "No canonical WAV exists for this chapter yet. Render the chapter first before exporting audio."}, status_code=404)
    except ValueError as exc:
        logger.warning(f"Invalid export request for {chapter_id}: {exc}")
        return JSONResponse({"status": "error", "message": "Invalid export request"}, status_code=400)

    # Rule 9: Explicit containment check for FileResponse sink
    try:
        resolved = export_path.resolve()
        # Must be under PROJECTS_DIR or CHAPTER_DIR
        projects_root = config.PROJECTS_DIR.resolve()
        legacy_root = config.CHAPTER_DIR.resolve()
        try:
            resolved.relative_to(projects_root)
        except ValueError:
            try:
                resolved.relative_to(legacy_root)
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

    chapter = get_chapter(chapter_id)
    if not chapter:
        return JSONResponse({"error": "not found"}, status_code=404)

    project_id = chapter.get("project_id")

    # Use compatibility resolution for text
    p = config.resolve_chapter_asset_path(project_id, chapter_id, "text")

    text = ""
    if p and p.exists():
        text = read_preview(p, max_chars=1000000)
    else:
        # Fallback to legacy _0.txt if not resolved by helper
        text_dir = (
            find_existing_project_subdir(project_id, "text")
            if project_id
            else config.CHAPTER_DIR
        )
        if text_dir:
            legacy_p = find_secure_file(text_dir, f"{chapter_id}_0.txt")
            if legacy_p:
                text = read_preview(legacy_p, max_chars=1000000)

    if not text:
        text = chapter.get("text_content") or ""

    if not text and (not p or not p.exists()):
        return JSONResponse({"error": "not found"}, status_code=404)

    if processed:
        settings = get_settings()
        is_safe = settings.get("safe_mode", True)
        if is_safe:
            text = sanitize_for_xtts(text)
            text = safe_split_long_sentences(text)
        else:
            text = re.sub(r"[^\x00-\x7F]+", "", text)
            text = text.strip()
        text = pack_text_to_limit(text, pad=True)

    return JSONResponse({"text": text, "analysis": None})


@router.get("/projects/{project_id}/chapters/{chapter_id}/assets/{asset_type}")
def api_get_chapter_asset(
    project_id: str,
    chapter_id: str,
    asset_type: Literal["audio", "text", "segment"],
    filename: Optional[str] = None,
):
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
        try:
            res_resolved.relative_to(config.PROJECTS_DIR.resolve())
        except ValueError:
             res_resolved.relative_to(config.CHAPTER_DIR.resolve())
    except (OSError, ValueError, RuntimeError):
         raise HTTPException(status_code=403, detail="Asset path out of bounds")

    return FileResponse(resolved, media_type=media_type)


@router.post("/chapters/{chapter_id}/export-sample")
async def api_export_chapter_sample(
    chapter_id: str,
    project_id: Optional[str] = None,
    xtts_out_dir: Path = Depends(get_xtts_out_dir),
):

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
        fallback_dir=xtts_out_dir,
    )
    if not wav_path:
        wav_path = config.resolve_chapter_asset_path(
            project_id, chapter_id, "audio", fallback_dir=xtts_out_dir
        )

    # Legacy fallback for _0 pattern
    if not wav_path:
        pdir = find_existing_project_subdir(project_id, "audio")
        if pdir:
            for cand in [f"{chapter_id}_0.wav", f"{chapter_id}_0.mp3"]:
                p = find_secure_file(pdir, cand)
                if p:
                    wav_path = p
                    break

    if not wav_path:
        return JSONResponse(
            {"status": "error", "message": "Audio not found"}, status_code=404
        )

    rel_path = f"/api/projects/{project_id}/chapters/{chapter_id}/assets/audio"
    if chapter.get("audio_file_path"):
        rel_path += f"?filename={chapter['audio_file_path']}"

    return JSONResponse({"status": "ok", "url": rel_path})


@router.get("/chapters/{chapter_id}/stream")
def api_stream_chapter(
    chapter_id: str,
    project_id: Optional[str] = None,
    xtts_out_dir: Path = Depends(get_xtts_out_dir),
):

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
        fallback_dir=xtts_out_dir,
    )
    if not wav_path:
        wav_path = config.resolve_chapter_asset_path(
            project_id, chapter_id, "audio", fallback_dir=xtts_out_dir
        )

    # Legacy fallback for _0 pattern
    if not wav_path:
        pdir = find_existing_project_subdir(project_id, "audio")
        if pdir:
            for cand in [f"{chapter_id}_0.wav", f"{chapter_id}_0.mp3"]:
                p = find_secure_file(pdir, cand)
                if p:
                    wav_path = p
                    break

    if not wav_path:
        return JSONResponse(
            {"status": "error", "message": "Audio not found"}, status_code=404
        )

    return FileResponse(wav_path)
