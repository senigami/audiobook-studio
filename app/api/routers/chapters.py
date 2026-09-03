import anyio
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Form, File, UploadFile, Request, HTTPException
from fastapi.responses import JSONResponse

from ...db import (
    list_chapters, reconcile_project_audio, create_chapter, update_chapter,
    get_chapter, delete_chapter, reset_chapter_audio, get_connection,
    get_chapter_segments, update_segment, update_segments_status_bulk, update_segments_bulk,
    sync_chapter_segments
)
from ...core import config
from ...utils.text.textops import compute_chapter_metrics
from ...db.state import get_jobs, get_settings
from ...db.state import update_job
from ...core.constants import DEFAULT_VOICE_SENTINEL
from ..ws import broadcast_chapter_updated, broadcast_queue_update
from ...domain.chunk_groups import rows_as_groups, load_chunk_segments

# Sub-modules
from .chapters_models import BulkStatusUpdate, BulkSegmentsUpdate
from .chapters_production import router as production_router
from .chapters_assets import (
    router as assets_router,
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
def api_get_chapter_details(chapter_id: str, project_id: Optional[str] = None):
    c = get_chapter(chapter_id, project_id=project_id)
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

    lost_assignments_count = 0
    if updates:
        result = update_chapter(chapter_id, **updates)
        if isinstance(result, dict):
            lost_assignments_count = result.get("lost_assignments_count", 0)
        broadcast_chapter_updated(chapter_id)

    # Task 6 (RC-1 fix): surface how many manual assignments an ordinary text save
    # actually lost, so the UI can warn -- previously only the explicit resync route's
    # preview showed this.
    return JSONResponse({
        "status": "ok",
        "chapter": get_chapter(chapter_id),
        "lost_assignments_count": lost_assignments_count,
    })


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
    from ...orchestration.scheduler.orchestrator import create_orchestrator
    orchestrator = create_orchestrator()
    for jid, j in existing.items():
        if getattr(j, 'chapter_id', None) == chapter_id or j.chapter_file == chapter_id:
            if not orchestrator.cancel(jid):
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
    from ...orchestration.scheduler.orchestrator import create_orchestrator
    orchestrator = create_orchestrator()
    for jid, j in existing.items():
        if getattr(j, 'chapter_id', None) == chapter_id or j.chapter_file == chapter_id:
            if not orchestrator.cancel(jid):
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


@router.get("/projects/{project_id}/chapters/{chapter_id}/render_groups")
def api_get_chapter_render_groups(project_id: str, chapter_id: str):
    chapter = get_chapter(chapter_id)
    if not chapter or chapter.get("project_id") != project_id:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)

    chapter_default = chapter.get("speaker_profile_name")
    settings_default = get_settings().get("default_speaker_profile")
    default_profile = chapter_default or settings_default or None

    segments = load_chunk_segments(chapter_id)
    groups = rows_as_groups(segments, default_profile)

    result = []
    for idx, group in enumerate(groups):
        result.append({
            "index": idx,
            "segment_ids": [seg["id"] for seg in group["segments"]],
            "engine": group["engine"],
            "char_count": group["text_length"],
        })

    return JSONResponse({"count": len(result), "groups": result})


@router.get("/chapters/{chapter_id}/segments")
def api_get_segments(chapter_id: str):
    # #232 Task 009: segment_order is a derived-on-write convenience column
    # (ordering authority is start_offset -- see 01-map.md's round-5
    # correction); it has zero frontend readers, so stop serving it over the
    # API here even though the DB column itself is untouched (internal
    # callers of get_chapter_segments() still receive it -- e.g.
    # tests/db/test_sync_chapter_segments_offsets.py sorts by it directly).
    segments = [
        {k: v for k, v in seg.items() if k != "segment_order"}
        for seg in get_chapter_segments(chapter_id)
    ]
    return JSONResponse({"segments": segments})


# Untrusted request bodies for PUT /segments/{id} are forwarded into
# `update_segment(segment_id, **updates)`, which builds `UPDATE chapter_segments
# SET {col} = ? ...` using request-supplied dict KEYS directly as column names
# (values are parameterized/safe, but column names are not). This is the complete
# set of fields real callers send today (mirrors `updateSegment`'s payload type in
# frontend/src/api/index.ts) — reject anything outside it rather than silently
# passing an arbitrary key through as a column name.
SEGMENT_UPDATE_ALLOWED_FIELDS = {"character_id", "speaker_profile_name", "audio_status", "text_content"}


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

    unknown_fields = set(updates) - SEGMENT_UPDATE_ALLOWED_FIELDS
    if unknown_fields:
        raise HTTPException(status_code=400, detail=f"Unsupported field(s): {', '.join(sorted(unknown_fields))}")

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
    # Same unvalidated-dict-as-SQL-columns hazard as PUT /segments/{segment_id}
    # above (`update_segments_bulk` builds `f"{k} = ?"` from these keys) — reuse
    # the same whitelist rather than duplicating it.
    unknown_fields = set(req.updates) - SEGMENT_UPDATE_ALLOWED_FIELDS
    if unknown_fields:
        raise HTTPException(status_code=400, detail=f"Unsupported field(s): {', '.join(sorted(unknown_fields))}")

    await anyio.to_thread.run_sync(
        lambda: update_segments_bulk(req.segment_ids, **req.updates)
    )
    return JSONResponse({"status": "ok"})


@router.post("/chapters/{chapter_id}/sync-segments")
async def api_sync_segments(chapter_id: str, request: Request):
    data = await request.json()
    text = data.get("text")
    lost_assignments_count = 0
    if text is not None:
        result = await anyio.to_thread.run_sync(sync_chapter_segments, chapter_id, text)
        if isinstance(result, dict):
            lost_assignments_count = result.get("lost_assignments_count", 0)
    return JSONResponse({"status": "ok", "lost_assignments_count": lost_assignments_count})
