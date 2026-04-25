import anyio
import logging
from pathlib import Path
from typing import Optional, List, Literal, Sequence, Mapping
from pydantic import BaseModel, Field
from fastapi import APIRouter, Form, File, UploadFile, Request, Depends, Body, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from ...domain.chapters.compatibility import (
    get_production_blocks_payload,
    save_production_blocks_payload,
    get_script_view_payload,
    save_script_assignments,
    get_resync_preview,
    compact_script_view,
    CompatibilityRevisionMismatch,
    export_chapter_audio,
)
from ...db import (
    list_chapters, reconcile_project_audio, create_chapter, update_chapter, 
    get_chapter, delete_chapter, reorder_chapters, get_chapter_segments, 
    update_segment, update_segments_status_bulk, update_segments_bulk, 
    sync_chapter_segments, reset_chapter_audio, get_connection
)
from ... import config
from ...config import SENT_CHAR_LIMIT, BASELINE_XTTS_CPS, find_existing_project_subdir
from ...textops import (
    compute_chapter_metrics, sanitize_for_xtts,
    safe_split_long_sentences, pack_text_to_limit
)
from ...jobs import cancel as cancel_job, get_jobs
from ...state import update_job, delete_jobs, get_settings
from ...constants import DEFAULT_VOICE_SENTINEL
from ..ws import broadcast_chapter_updated, broadcast_queue_update

# Compatibility for tests that monkeypatch these
CHAPTER_DIR = config.CHAPTER_DIR
XTTS_OUT_DIR = config.XTTS_OUT_DIR

logger = logging.getLogger(__name__)


def get_chapter_dir() -> Path:
    return CHAPTER_DIR


def get_xtts_out_dir() -> Path:
    return XTTS_OUT_DIR


def _named_file(base_dir: Path, filename: str, allowed_suffixes: Optional[tuple[str, ...]] = None) -> Optional[Path]:
    if not base_dir.exists():
        return None
    for entry in base_dir.iterdir():
        if not entry.is_file() or entry.name != filename:
            continue
        if allowed_suffixes and entry.suffix.lower() not in allowed_suffixes:
            continue
        return entry.resolve()
    return None


def _named_audio_file_map(base_dir: Optional[Path]) -> dict[str, Path]:
    if not base_dir or not base_dir.exists():
        return {}
    return {
        entry.name: entry.resolve()
        for entry in base_dir.iterdir()
        if entry.is_file() and entry.suffix.lower() in (".wav", ".mp3", ".m4a")
    }


class BulkStatusUpdate(BaseModel):
    segment_ids: List[str]
    status: Literal["unprocessed", "processing", "done", "failed", "cancelled", "error"]


class BulkSegmentsUpdate(BaseModel):
    segment_ids: List[str]
    updates: dict


class ProductionBlocksUpdate(BaseModel):
    blocks: list[dict]
    base_revision_id: Optional[str] = None


class AudioExportRequest(BaseModel):
    format: Literal["wav", "mp3"]


class ScriptSpan(BaseModel):
    id: str
    order_index: int
    text: str
    sanitized_text: str
    character_id: Optional[str] = None
    speaker_profile_name: Optional[str] = None
    status: str
    audio_file_path: Optional[str] = None
    audio_generated_at: Optional[float] = None
    char_count: int
    sanitized_char_count: int


class ScriptParagraph(BaseModel):
    id: str
    span_ids: List[str]


class ScriptRenderBatch(BaseModel):
    id: str
    span_ids: List[str]
    status: str
    estimated_work_weight: int


class ScriptViewResponse(BaseModel):
    chapter_id: str
    base_revision_id: str
    paragraphs: List[ScriptParagraph]
    spans: List[ScriptSpan]
    render_batches: List[ScriptRenderBatch]


class ScriptAssignment(BaseModel):
    span_ids: List[str]
    character_id: Optional[str] = None
    speaker_profile_name: Optional[str] = None


class ScriptRangeAssignment(BaseModel):
    start_span_id: str
    start_offset: int
    end_span_id: str
    end_offset: int
    character_id: Optional[str] = None
    speaker_profile_name: Optional[str] = None


class CompactionRequest(BaseModel):
    base_revision_id: Optional[str] = None


class ScriptAssignmentsUpdate(BaseModel):
    assignments: List[ScriptAssignment] = []
    range_assignments: List[ScriptRangeAssignment] = []
    base_revision_id: Optional[str] = None


class ResyncPreviewRequest(BaseModel):
    text_content: str


class ResyncPreviewResponse(BaseModel):
    total_segments_before: int
    total_segments_after: int
    preserved_assignments_count: int
    lost_assignments_count: int
    affected_character_names: List[str]
    is_destructive: bool


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


@router.get("/chapters/{chapter_id}/production-blocks")
def api_get_production_blocks(chapter_id: str):
    try:
        return JSONResponse(get_production_blocks_payload(chapter_id))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)


@router.get("/chapters/{chapter_id}/script-view")
def api_get_script_view(chapter_id: str):
    try:
        return JSONResponse(get_script_view_payload(chapter_id))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Script view payload failed for {chapter_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@router.post("/chapters/{chapter_id}/source-text/preview", response_model=ResyncPreviewResponse)
def api_get_resync_preview(chapter_id: str, payload: ResyncPreviewRequest):
    try:
        return JSONResponse(get_resync_preview(chapter_id, payload.text_content))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Error generating resync preview: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@router.put("/chapters/{chapter_id}/production-blocks")
def api_save_production_blocks(chapter_id: str, payload: ProductionBlocksUpdate):
    try:
        return JSONResponse(
            save_production_blocks_payload(
                chapter_id,
                blocks=payload.blocks,
                base_revision_id=payload.base_revision_id,
            )
        )
    except CompatibilityRevisionMismatch as exc:
        return JSONResponse(
            {
                "status": "error",
                "message": "Chapter production blocks were updated by someone else. Reload before saving again.",
                "expected_base_revision_id": exc.expected_revision_id,
                "base_revision_id": exc.actual_revision_id,
            },
            status_code=409,
        )
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)


@router.put("/chapters/{chapter_id}/script-view/assignments", response_model=ScriptViewResponse)
def api_save_script_assignments(chapter_id: str, payload: ScriptAssignmentsUpdate):
    try:
        data = save_script_assignments(
            chapter_id,
            assignments=[a.model_dump() for a in payload.assignments],
            range_assignments=[a.model_dump() for a in payload.range_assignments],
            base_revision_id=payload.base_revision_id
        )
        return JSONResponse(data)
    except CompatibilityRevisionMismatch as exc:
        return JSONResponse(
            {
                "status": "error",
                "message": "Chapter script view was updated by someone else. Reload before saving again.",
                "expected_base_revision_id": exc.expected_revision_id,
                "base_revision_id": exc.actual_revision_id,
            },
            status_code=409,
        )
    except KeyError as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=404)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@router.post("/chapters/{chapter_id}/script-view/compact", response_model=ScriptViewResponse)
def api_compact_script_view(chapter_id: str, payload: CompactionRequest):
    try:
        data = compact_script_view(
            chapter_id,
            base_revision_id=payload.base_revision_id
        )
        return JSONResponse(data)
    except CompatibilityRevisionMismatch as exc:
        return JSONResponse(
            {
                "status": "error",
                "message": "Chapter script view was updated by someone else. Reload before compacting.",
                "expected_base_revision_id": exc.expected_revision_id,
                "base_revision_id": exc.actual_revision_id,
            },
            status_code=409,
        )
    except KeyError as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=404)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@router.post("/chapters/{chapter_id}/export-audio")
def api_export_chapter_audio(chapter_id: str, payload: AudioExportRequest):
    try:
        export_path, media_type = export_chapter_audio(chapter_id, format=payload.format)
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except FileNotFoundError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=404)
    except ValueError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=400)

    return FileResponse(export_path, media_type=media_type, filename=export_path.name)

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
@router.get("/chapters/{chapter_id}/preview")
def api_get_chapter_preview(
    chapter_id: str,
    processed: bool = False,
):
    from ..utils import read_preview
    import re

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
            legacy_p = text_dir / f"{chapter_id}_0.txt"
            if legacy_p.exists():
                text = read_preview(legacy_p, max_chars=1000000)

    if not text:
        text = chapter.get("text_content") or ""

    if not text and (not p or not p.exists()):
        return JSONResponse({"error": "not found"}, status_code=404)
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


@router.get("/projects/{project_id}/chapters/{chapter_id}/assets/{asset_type}")
def api_get_chapter_asset(
    project_id: str,
    chapter_id: str,
    asset_type: Literal["audio", "text", "segment"],
    filename: Optional[str] = None,
):
    """
    Layout-agnostic chapter asset endpoint.
    Resolves assets by checking the new nested folder first, then the legacy flat folders.
    """
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
                if (pdir / cand).exists():
                    wav_path = pdir / cand
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
                if (pdir / cand).exists():
                    wav_path = pdir / cand
                    break

    if not wav_path:
        return JSONResponse(
            {"status": "error", "message": "Audio not found"}, status_code=404
        )

    return FileResponse(wav_path)
