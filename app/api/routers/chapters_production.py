import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ...domain.chapters.compatibility import (
    get_production_blocks_payload,
    save_production_blocks_payload,
    get_script_view_payload,
    save_script_assignments,
    get_resync_preview,
    compact_script_view,
    CompatibilityRevisionMismatch,
)
from .chapters_models import (
    ResyncPreviewResponse, ResyncPreviewRequest,
    ProductionBlocksUpdate, ScriptAssignmentsUpdate,
    ScriptViewResponse, CompactionRequest
)

logger = logging.getLogger(__name__)

router = APIRouter()


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
        return JSONResponse({"status": "error", "message": "Internal server error during script view fetch"}, status_code=500)


@router.post("/chapters/{chapter_id}/source-text/preview", response_model=ResyncPreviewResponse)
def api_get_resync_preview(chapter_id: str, payload: ResyncPreviewRequest):
    try:
        return JSONResponse(get_resync_preview(chapter_id, payload.text_content))
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Error generating resync preview: {e}")
        return JSONResponse({"status": "error", "message": "Internal server error during resync preview"}, status_code=500)


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
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Failed to save script view for chapter {chapter_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during script save"}, status_code=500)


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
    except KeyError:
        return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Failed to compact script view for chapter {chapter_id}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during compaction"}, status_code=500)
