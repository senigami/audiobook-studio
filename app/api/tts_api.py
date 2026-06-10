from __future__ import annotations

import os
import uuid
import logging
from typing import Any, Optional, Dict, List
from pathlib import Path

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.core.security import verify_api_key, rate_limit
from app.orchestration.tasks.api_synthesis import ApiSynthesisTask
from app.orchestration.scheduler.orchestrator import create_orchestrator
from app.db.state import get_settings, get_jobs
from app.core.config import TRANSIENT_DIR, VOICES_DIR

logger = logging.getLogger(__name__)

# Create the dedicated sub-app for the external TTS API.
# This allows us to have separate OpenAPI docs at /api/v1/tts/docs.
tts_app = FastAPI(
    title="Audiobook Studio TTS API",
    description="External gateway for Studio's TTS engines.",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi",
    dependencies=[Depends(verify_api_key), Depends(rate_limit)],
)

router = APIRouter()

# --- Models ---

class EngineSummary(BaseModel):
    engine_id: str
    display_name: str
    version: str
    status: str
    verified: bool
    local: bool
    cloud: bool
    languages: List[str]
    capabilities: List[str]

class EngineListResponse(BaseModel):
    engines: List[EngineSummary]

class SynthesisRequest(BaseModel):
    engine_id: str = Field(..., description="Target TTS engine identifier.")
    text: str = Field(..., description="Text to synthesize.")
    voice_ref: Optional[str] = Field(None, description="Optional reference audio path or profile name.")
    language: str = Field("en", description="BCP-47 language code.")
    output_format: str = Field("wav", description="Desired output format (wav, mp3, ogg).")
    settings: Dict[str, Any] = Field(default_factory=dict, description="Engine-specific overrides.")

class JobResponse(BaseModel):
    job_id: str
    status: str
    poll_url: str

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    message: Optional[str] = None
    progress: float = 0.0
    download_url: Optional[str] = None

# --- Voice ref validation ---

def _validate_voice_ref(voice_ref: str) -> str:
    """Validate and return a safe voice_ref value.

    If voice_ref contains a path separator it is treated as a path and must
    resolve inside VOICES_DIR or TRANSIENT_DIR.  Otherwise it is treated as a
    profile name and must be resolvable via the voice registry.

    Returns the validated value (unchanged) on success.
    Raises HTTPException(400) for unsafe paths, HTTPException(404) for unknown names.
    """
    if "/" in voice_ref or "\\" in voice_ref:
        # Caller supplied a path fragment — resolve and assert containment.
        try:
            resolved = Path(voice_ref).resolve()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid voice_ref path.")
        voices_dir_r = VOICES_DIR.resolve()
        transient_dir_r = TRANSIENT_DIR.resolve()
        if not (resolved.is_relative_to(voices_dir_r) or resolved.is_relative_to(transient_dir_r)):
            raise HTTPException(
                status_code=400,
                detail="voice_ref path is not within an allowed directory.",
            )
        return voice_ref

    # Treat as a profile name — look it up in the voice registry.
    from app.db.speakers import _resolve_existing_profile_name  # noqa: PLC0415
    resolved_name = _resolve_existing_profile_name(voice_ref)
    if not resolved_name:
        raise HTTPException(status_code=404, detail=f"Voice profile '{voice_ref}' not found.")
    return voice_ref


# --- Endpoints ---

@router.get("/engines", response_model=EngineListResponse)
async def list_engines():
    """List all available TTS engines and their current status."""
    from app.engines.errors import EngineUnavailableError
    from app.engines.bridge import create_voice_bridge
    bridge = create_voice_bridge()
    try:
        engines = bridge.describe_registry()
    except EngineUnavailableError:
        # If the managed TTS Server is still booting or unreachable, return
        # an empty list rather than crashing. Discovery will succeed on next poll.
        engines = []
    return {"engines": engines}

@router.get("/engines/{engine_id}")
async def get_engine(engine_id: str):
    """Get detailed metadata and settings schema for a specific engine."""
    from app.engines.bridge import create_voice_bridge
    bridge = create_voice_bridge()
    engines = bridge.describe_registry()
    engine = next((e for e in engines if e["engine_id"] == engine_id), None)
    if not engine:
        raise HTTPException(status_code=404, detail=f"Engine '{engine_id}' not found.")
    return engine

@router.post("/synthesize")
async def synthesize(request: SynthesisRequest, req_context: Request, background_tasks: BackgroundTasks):
    """Submit a synthesis request.

    Short text (< 500 chars) returns audio inline.
    Longer text enqueues a background job.
    """
    task_id = f"api_{uuid.uuid4().hex[:8]}"

    # Validate the requested output format against a fixed allowlist. The value
    # used downstream is the literal from the allowlist tuple selected by
    # comparison — never the user-supplied string — so no user input flows into
    # the filesystem path.
    requested_format = request.output_format.lower()
    output_format = None
    for fmt in ("wav", "mp3", "ogg", "flac"):
        if requested_format == fmt:
            output_format = fmt
            break
    if output_format is None:
        raise HTTPException(status_code=400, detail="Unsupported output format.")

    # Validate voice_ref at the API boundary — reject traversal attempts early.
    if request.voice_ref is not None:
        _validate_voice_ref(request.voice_ref)

    # Ensure output directory exists
    output_dir = (TRANSIENT_DIR / "api").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = (output_dir / f"{task_id}.{output_format}").resolve()
    # Defense in depth: the served file must stay inside the API output dir.
    if not output_path.is_relative_to(output_dir):
        raise HTTPException(status_code=400, detail="Invalid output path.")

    task = ApiSynthesisTask(
        task_id=task_id,
        engine_id=request.engine_id,
        text=request.text,
        output_path=str(output_path),
        voice_ref=request.voice_ref,
        request_settings=request.settings,
        language=request.language,
        caller_id=req_context.client.host if req_context.client else "unknown",
    )

    orchestrator = create_orchestrator()

    # Threshold for inline vs queued (default 500 chars)
    if len(request.text) < 500:
        try:
            # For short text, we run synchronously (the orchestrator blocks on dispatch)
            orchestrator.submit(task)
            if not output_path.exists():
                raise HTTPException(status_code=500, detail="Synthesis failed to produce output.")
            return FileResponse(
                output_path,
                media_type=f"audio/{output_format}",
                filename=f"tts_{task_id}.{output_format}"
            )
        except Exception:
            logger.exception("Inline synthesis failed")
            raise HTTPException(status_code=500, detail="Synthesis failed.")
    else:
        # For long text, we queue it and return a job ID.
        # We use a background task to avoid blocking the request while it reconciles/queues.
        background_tasks.add_task(orchestrator.submit, task)

        return {
            "job_id": task_id,
            "status": "queued",
            "poll_url": f"/api/v1/tts/jobs/{task_id}"
        }

@router.post("/preview")
async def preview(request: SynthesisRequest, req_context: Request, background_tasks: BackgroundTasks):
    """Quick preview synthesis for short text (always inline)."""
    if len(request.text) > 500:
        raise HTTPException(status_code=422, detail="Text exceeds preview limit (500 chars).")

    return await synthesize(request, req_context, background_tasks)

@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Check the status of a queued synthesis job."""
    jobs = get_jobs()
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    response = {
        "job_id": job_id,
        "status": job.status,
        "message": getattr(job, "message", None),
        "progress": getattr(job, "progress", 0.0),
    }

    if job.status == "completed":
        response["download_url"] = f"/api/v1/tts/jobs/{job_id}/audio"

    return response

@router.get("/jobs/{job_id}/audio")
async def get_job_audio(job_id: str):
    """Download the audio output of a completed job."""
    jobs = get_jobs()
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    if job.status != "completed":
        raise HTTPException(status_code=400, detail=f"Job is in state '{job.status}'.")

    # In ApiSynthesisTask, the output_path is stored in the payload
    payload = getattr(job, "payload", {})
    output_path_str = payload.get("output_path")
    if not output_path_str:
        raise HTTPException(status_code=500, detail="Job has no output path recorded.")

    output_path = Path(output_path_str).resolve()
    # Defense in depth: assert the stored output path is within the expected API output dir.
    api_output_dir = (TRANSIENT_DIR / "api").resolve()
    if not output_path.is_relative_to(api_output_dir):
        logger.error("Job %s output_path %s is outside api output dir — refusing to serve", job_id, output_path)
        raise HTTPException(status_code=500, detail="Job output path is invalid.")
    if not output_path.exists():
        raise HTTPException(status_code=410, detail="Audio file has expired or been removed.")

    return FileResponse(output_path, filename=output_path.name)

# Mount the router into the sub-app
tts_app.include_router(router)
