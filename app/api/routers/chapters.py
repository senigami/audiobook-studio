import anyio
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Form, File, UploadFile, Request
from fastapi.responses import JSONResponse

from ...db import (
    list_chapters, reconcile_project_audio, create_chapter, update_chapter, 
    get_chapter, delete_chapter, reset_chapter_audio, get_connection,
    get_chapter_segments, update_segment, update_segments_status_bulk, update_segments_bulk, 
    sync_chapter_segments
)
from ... import config
from ...textops import compute_chapter_metrics
from ...jobs import cancel as cancel_job, get_jobs
from ...state import update_job
from ...constants import DEFAULT_VOICE_SENTINEL
from ..ws import broadcast_chapter_updated, broadcast_queue_update

# Sub-modules
from .chapters_models import BulkStatusUpdate, BulkSegmentsUpdate
from .chapters_production import router as production_router
from .chapters_assets import (
    router as assets_router,
    get_chapter_dir,
    get_xtts_out_dir,
    CHAPTER_DIR,
    XTTS_OUT_DIR,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api", tags=["chapters"])

# Include sub-routers
router.include_router(production_router)
router.include_router(assets_router)


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
async def api_update_chapter_details(
    chapter_id: str,
    request: Request,
    title: Optional[str] = Form(None),
    text_content: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
):
    form_data = await request.form()
    updates = {}
    if "title" in form_data:
        updates["title"] = title or ""
    if "text_content" in form_data:
        updates["text_content"] = text_content or ""
        metrics = compute_chapter_metrics(updates["text_content"])
        updates.update(metrics)
    if "speaker_profile_name" in form_data:
        normalized_profile_name = (speaker_profile_name.strip() or None) if speaker_profile_name else None
        if normalized_profile_name == DEFAULT_VOICE_SENTINEL:
            normalized_profile_name = None
        updates["speaker_profile_name"] = normalized_profile_name

    if updates:
        update_chapter(chapter_id, **updates)
        broadcast_chapter_updated(chapter_id)

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
    # 1. Cancel any active jobs for this chapter
    existing = get_jobs()
    for jid, j in existing.items():
        if getattr(j, 'chapter_id', None) == chapter_id or j.chapter_file == chapter_id:
            cancel_job(jid)
            update_job(jid, status="cancelled", log="Cancelled by chapter reset.")

    # 2. Reset in DB (and delete queue item)
    reset_chapter_audio(chapter_id)

    # 3. Notify UI
    broadcast_queue_update()

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


@router.post("/chapters/{chapter_id}/segments/bulk-status")
def api_bulk_update_segment_status(chapter_id: str, req: BulkStatusUpdate):
    update_segments_status_bulk(req.segment_ids, chapter_id, req.status)
    return JSONResponse({"status": "ok"})


@router.post("/segments/bulk-update")
async def api_bulk_update_segments(req: BulkSegmentsUpdate):
    await anyio.to_thread.run_sync(
        lambda: update_segments_bulk(req.segment_ids, **req.updates)
    )
    return JSONResponse({"status": "ok"})


@router.post("/chapters/{chapter_id}/sync-segments")
async def api_sync_segments(chapter_id: str, request: Request):
    data = await request.json()
    text = data.get("text")
    if text is not None:
        await anyio.to_thread.run_sync(sync_chapter_segments, chapter_id, text)
    return JSONResponse({"status": "ok"})
