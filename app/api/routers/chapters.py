import anyio
import logging
import os
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Form, File, UploadFile, Request, Depends
from fastapi.responses import JSONResponse, FileResponse
from ...db import (
    list_chapters, reconcile_project_audio, create_chapter, update_chapter, 
    get_chapter, delete_chapter, reorder_chapters, get_chapter_segments, 
    update_segment, update_segments_status_bulk, update_segments_bulk, 
    sync_chapter_segments, reset_chapter_audio, get_connection
)
from ... import config
from ...config import get_project_audio_dir, SENT_CHAR_LIMIT, BASELINE_XTTS_CPS
from ...textops import (
    compute_chapter_metrics, sanitize_for_xtts,
    safe_split_long_sentences, pack_text_to_limit
)
from ...jobs import cancel as cancel_job, get_jobs
from ...state import update_job, delete_jobs, get_settings

# Compatibility for tests that monkeypatch these
CHAPTER_DIR = config.CHAPTER_DIR
XTTS_OUT_DIR = config.XTTS_OUT_DIR

logger = logging.getLogger(__name__)


def get_chapter_dir() -> Path:
    return CHAPTER_DIR


def get_xtts_out_dir() -> Path:
    return XTTS_OUT_DIR

router = APIRouter(prefix="/api", tags=["chapters"])

@router.get("/projects/{project_id}/chapters")
def api_list_project_chapters(project_id: str):
    reconcile_project_audio(project_id)
    return JSONResponse(list_chapters(project_id))

@router.post("/projects/{project_id}/chapters")
async def api_create_chapter(
    project_id: str,
    title: str = Form(...),
    text_content: Optional[str] = Form(""),
    sort_order: int = Form(0),
    file: Optional[UploadFile] = File(None)
):
    text = text_content
    if file:
        content = await file.read()
        text = content.decode("utf-8", errors="replace")

    def process():
        metrics = compute_chapter_metrics(text)
        cid = create_chapter(project_id, title, text, sort_order, **metrics)
        return get_chapter(cid)

    chapter_data = await anyio.to_thread.run_sync(process)
    return JSONResponse({"status": "ok", "chapter": chapter_data})

@router.get("/chapters/{chapter_id}")
def api_get_chapter_details(chapter_id: str):
    c = get_chapter(chapter_id)
    if not c:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    return JSONResponse(c)

@router.put("/chapters/{chapter_id}")
def api_update_chapter_details(
    chapter_id: str,
    title: Optional[str] = Form(None),
    text_content: Optional[str] = Form(None)
):
    updates = {}
    if title is not None:
        updates["title"] = title
    if text_content is not None:
        updates["text_content"] = text_content
        metrics = compute_chapter_metrics(text_content)
        updates.update(metrics)

    if updates:
        update_chapter(chapter_id, **updates)

    return JSONResponse({"status": "ok", "chapter": get_chapter(chapter_id)})

@router.delete("/chapters/{chapter_id}")
def api_delete_chapter_route(chapter_id: str):
    success = delete_chapter(chapter_id)
    if success:
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)

@router.delete("/chapters/{chapter_id}/record")
def api_delete_chapter_record(chapter_id: str):
    reset_chapter_audio(chapter_id)
    return JSONResponse({"status": "ok"})

@router.post("/chapters/{chapter_id}/reset")
def api_reset_chapter_audio_route(chapter_id: str):
    reset_chapter_audio(chapter_id)
    return JSONResponse({"status": "ok"})

@router.post("/chapters/{chapter_id}/cancel")
def cancel_chapter_generation_route(chapter_id: str):
    """Cancels all active jobs (granular or full chapter) associated with this chapter id."""
    existing = get_jobs()
    cancelled_count = 0
    for jid, j in existing.items():
        if getattr(j, 'chapter_id', None) == chapter_id or j.chapter_file == chapter_id:
            cancel_job(jid)
            update_job(jid, status="cancelled", log="Cancelled by user via chapter editor.")
            cancelled_count += 1

    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE processing_queue SET status = 'cancelled' WHERE chapter_id = ? AND status IN ('queued', 'running')", (chapter_id,))
            cursor.execute("UPDATE chapters SET audio_status = 'unprocessed' WHERE id = ? AND audio_status = 'processing'", (chapter_id,))
            cursor.execute("UPDATE chapter_segments SET audio_status = 'unprocessed' WHERE chapter_id = ? AND audio_status = 'processing'", (chapter_id,))
            conn.commit()
    except Exception as e:
        logger.error(f"Error cancelling chapter {chapter_id} in DB: {e}")

    return JSONResponse({"status": "ok", "cancelled_count": cancelled_count})


@router.get("/chapters/{chapter_id}/segments")
def api_get_segments(chapter_id: str):
    return JSONResponse({"segments": get_chapter_segments(chapter_id)})

@router.put("/segments/{segment_id}")
async def api_update_segment_route(segment_id: str, request: Request):
    updates = {}
    try:
        # 1. Try JSON
        updates = await request.json()
    except Exception:
        # 2. Fallback to Form
        form = await request.form()
        updates = {k: v for k, v in form.items()}

    # Normalize: empty strings for IDs/Profiles should be None
    for k in ["speaker_profile_name", "character_id"]:
        if k in updates and updates[k] == "":
            updates[k] = None

    success = await anyio.to_thread.run_sync(
        lambda: update_segment(segment_id, **updates)
    )
    return JSONResponse({"status": "ok" if success else "error"})

@router.put("/segments")
async def api_legacy_bulk_update_segments_put(request: Request):
    form = await request.form()
    sids = form.get("segment_ids", "").split(",")
    updates = {k: v for k, v in form.items() if k != "segment_ids"}
    await anyio.to_thread.run_sync(
        lambda: update_segments_bulk(sids, **updates)
    )
    return JSONResponse({"status": "ok"})

@router.post("/chapters/{chapter_id}/segments/bulk-status")
def api_bulk_update_segment_status(chapter_id: str, segment_ids: List[str], status: str):
    update_segments_status_bulk(segment_ids, chapter_id, status)
    return JSONResponse({"status": "ok"})

@router.post("/segments/bulk-update")
async def api_bulk_update_segments(segment_ids: List[str], updates: dict):
    await anyio.to_thread.run_sync(
        lambda: update_segments_bulk(segment_ids, **updates)
    )
    return JSONResponse({"status": "ok"})

@router.post("/chapters/{chapter_id}/sync-segments")
async def api_sync_segments(chapter_id: str, request: Request):
    data = await request.json()
    text = data.get("text")
    if text is not None:
        await anyio.to_thread.run_sync(sync_chapter_segments, chapter_id, text)
    return JSONResponse({"status": "ok"})

@router.post("/chapters/{chapter_id}/reset")
def api_reset_chapter_id(chapter_id: str):
    from ...db import reset_chapter_audio
    reset_chapter_audio(chapter_id)
    return JSONResponse({"status": "ok"})

@router.post("/chapter/reset")
def reset_chapter_legacy(
    chapter_file: str = Form(...),
    xtts_out_dir: Path = Depends(get_xtts_out_dir)
):
    try:
        existing = get_jobs()
        # Construct and resolve path
        safe_base = os.path.basename(chapter_file)
        # Cancel any active jobs for this chapter file
        for jid, j in existing.items():
            if j.chapter_file == safe_base:
                cancel_job(jid)
                update_job(jid, status="cancelled", log="Cancelled by chapter reset.")

        # However, for reset we check both Chapter existence and Output existence
        # Check output stem
        stem = Path(safe_base).stem

        # Security: ensure we aren't leaking out
        for ext in [".wav", ".mp3", ".m4a"]:
            f = (xtts_out_dir / f"{stem}{ext}").resolve()
            if not f.is_relative_to(xtts_out_dir.resolve()):
                logger.warning(f"Blocking reset traversal attempt: {chapter_file}")
                return JSONResponse({"status": "error", "message": "Invalid chapter file"}, status_code=403)

        count = 0
        for ext in [".wav", ".mp3", ".m4a"]:
            f = xtts_out_dir / f"{stem}{ext}"
            if f.exists():
                f.unlink()
                count += 1
        return JSONResponse({
            "status": "ok",
            "message": f"Reset {safe_base}, deleted {count} files"
        })
    except Exception as e:
        logger.error(f"Error resetting chapter {chapter_file}: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.delete("/chapter/{filename}")
def api_delete_legacy_chapter(
    filename: str,
    chapter_dir: Path = Depends(get_chapter_dir),
    xtts_out_dir: Path = Depends(get_xtts_out_dir)
):
    try:
        safe_filename = os.path.basename(filename)
        path = (chapter_dir / safe_filename).resolve()

        if not path.is_relative_to(chapter_dir.resolve()):
            logger.warning(f"Blocking delete traversal attempt: {filename}")
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

        stem = path.stem
        for ext in [".wav", ".mp3"]:
            f = (xtts_out_dir / f"{stem}{ext}").resolve()
            if f.is_relative_to(xtts_out_dir.resolve()) and f.exists():
                f.unlink()

        existing = get_jobs()
        to_del = []
        for jid, j in existing.items():
            if j.chapter_file == safe_filename:
                cancel_job(jid)
                to_del.append(jid)

        if to_del:
            delete_jobs(to_del)

        if path.exists():
            path.unlink()
            return JSONResponse({
                "status": "ok",
                "message": f"Deleted chapter {safe_filename}"
            })

    except Exception as e:
        logger.error(f"Error deleting chapter {filename}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)

    return JSONResponse(
        {"status": "error", "message": "Chapter not found"},
        status_code=404
    )

@router.get("/preview/{chapter_file}")
def api_preview(
    chapter_file: str,
    processed: bool = False,
    chapter_dir: Path = Depends(get_chapter_dir)
):
    from ..utils import read_preview
    import re

    try:
        safe_filename = os.path.basename(chapter_file)
        p = (chapter_dir / safe_filename).resolve()

        if not p.is_relative_to(chapter_dir.resolve()):
            logger.warning(f"Blocking preview traversal attempt: {chapter_file}")
            return JSONResponse({"error": "invalid path"}, status_code=403)

        if not p.exists():
            return JSONResponse({"error": "not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Error resolving preview path {chapter_file}: {e}")
        return JSONResponse({"error": "invalid path"}, status_code=403)

    text = read_preview(p, max_chars=1000000)
    analysis = None

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

    return JSONResponse({"text": text, "analysis": analysis})
@router.post("/chapter/{chapter_id}/export-sample")
async def api_export_chapter_sample(
    chapter_id: str,
    project_id: Optional[str] = None,
    xtts_out_dir: Path = Depends(get_xtts_out_dir)
):
    chapter = get_chapter(chapter_id)
    pdir = (
        get_project_audio_dir(project_id) if project_id else xtts_out_dir
    )

    wav_path = None
    if chapter and chapter.get("audio_file_path"):
        wav_path = pdir / chapter["audio_file_path"]

    if not wav_path or not wav_path.exists():
        # Fallbacks
        wav_path = pdir / f"{chapter_id}.wav"
        if not wav_path.exists():
            wav_path = pdir / f"{chapter_id}.mp3"
        if not wav_path.exists():
            wav_path = pdir / f"{chapter_id}_0.wav"
        if not wav_path.exists():
            wav_path = pdir / f"{chapter_id}_0.mp3"

    if not wav_path or not wav_path.exists():
        return JSONResponse({"status": "error", "message": "Audio not found"}, status_code=404)

    rel_path = f"/api/chapters/{chapter_id}/stream"
    if project_id:
        rel_path += f"?project_id={project_id}"

    return JSONResponse({"status": "ok", "url": rel_path})

@router.get("/chapters/{chapter_id}/stream")
def api_stream_chapter(
    chapter_id: str,
    project_id: Optional[str] = None,
    xtts_out_dir: Path = Depends(get_xtts_out_dir)
):
    chapter = get_chapter(chapter_id)
    pdir = (
        get_project_audio_dir(project_id) if project_id else xtts_out_dir
    )

    wav_path = None
    if chapter and chapter.get("audio_file_path"):
        wav_path = pdir / chapter["audio_file_path"]

    if not wav_path or not wav_path.exists():
        # Fallbacks
        wav_path = pdir / f"{chapter_id}.wav"
        if not wav_path.exists():
            wav_path = pdir / f"{chapter_id}.mp3"
        if not wav_path.exists():
            wav_path = pdir / f"{chapter_id}_0.wav"
        if not wav_path.exists():
            wav_path = pdir / f"{chapter_id}_0.mp3"

    if not wav_path or not wav_path.exists():
         return JSONResponse({"status": "error", "message": "Audio not found"}, status_code=404)

    return FileResponse(wav_path)
