from __future__ import annotations

import os
import uuid
import logging
from typing import Any, Optional, Dict, List
from pathlib import Path

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.core.security import verify_api_key, rate_limit
from app.orchestration.tasks.api_synthesis import ApiSynthesisTask
from app.orchestration.scheduler.orchestrator import create_orchestrator
from app.db.state import get_settings, get_jobs
from app.core.config import TRANSIENT_DIR, VOICES_DIR
from app.utils.pathing import contained_path

logger = logging.getLogger(__name__)

# Create the dedicated sub-app for the external TTS API.
#
# NOTE: docs_url/openapi_url are intentionally left unset here. FastAPI's
# auto-generated docs/openapi/redoc routes are registered via `add_route()`
# (plain Starlette routing), which bypasses the FastAPI dependency-injection
# system entirely -- so `dependencies=[...]` passed to the constructor below
# does NOT protect them. Per design-docs/specs/api-conventions.md ("All
# routes require verify_api_key + rate_limit"), we instead serve the docs
# and OpenAPI schema ourselves below, as ordinary routes on `router`, so they
# inherit the same auth/rate-limit enforcement as every other endpoint.
tts_app = FastAPI(
    title="Audiobook Studio TTS API",
    description="External gateway for Studio's TTS engines.",
    version="1.0.0",
    docs_url=None,
    openapi_url=None,
    redoc_url=None,
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
    # Bound the text length at the API boundary — an unbounded body is a cheap
    # DoS vector (accepted onto the queue, then rendered). 100k chars comfortably
    # covers a long chapter while capping abuse; over-limit -> 422 automatically.
    text: str = Field(..., min_length=1, max_length=100_000, description="Text to synthesize.")
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

# --- Caller-safe messaging ---

def _public_job_message(job: Any) -> Optional[str]:
    """Return a caller-safe status message for a job.

    We must never surface raw engine/bridge exception text to an external caller:
    those strings can embed internal filesystem paths or the managed TTS server
    URL (see api-conventions.md — error messages MUST NOT leak internal paths or
    stack traces). Map to a small fixed vocabulary keyed only on terminal status.
    """
    if getattr(job, "status", None) in {"failed", "cancelled"}:
        return "Synthesis failed."
    return None


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
        # Caller supplied a path fragment. Reject pre-computed latent files outright:
        # the engine resolves latent.pth internally and never needs a caller-supplied
        # .pth, and accepting one would feed torch.load a caller-controlled file
        # (defense-in-depth alongside the weights_only=True hardening in the XTTS engine).
        if voice_ref.lower().endswith(".pth"):
            raise HTTPException(
                status_code=400,
                detail="voice_ref must not reference a pre-computed latent (.pth) file.",
            )
        # Assert containment using the repo's realpath-resolving barrier (safe_join),
        # which resolves symlinks and rejects traversal/escape — stronger than a
        # purely lexical normpath check.
        from app.utils.pathing import safe_join  # noqa: PLC0415
        contained = False
        for root in (VOICES_DIR, TRANSIENT_DIR):
            try:
                safe_join(root, voice_ref)
                contained = True
                break
            except ValueError:
                continue
        if not contained:
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

    # Validate the requested output format against a fixed allowlist. Extension
    # is taken from a literal dict keyed by the validated format so no
    # user-supplied string flows into the filesystem path.
    _FORMAT_EXTENSIONS: dict[str, str] = {"wav": ".wav", "mp3": ".mp3", "ogg": ".ogg", "flac": ".flac"}
    requested_format = request.output_format.lower()
    output_extension = _FORMAT_EXTENSIONS.get(requested_format)
    if output_extension is None:
        raise HTTPException(status_code=400, detail="Unsupported output format.")
    output_format = requested_format  # validated; only used for media_type and filename

    # Validate voice_ref at the API boundary — reject traversal attempts early.
    if request.voice_ref is not None:
        _validate_voice_ref(request.voice_ref)

    # Ensure output directory exists
    output_dir = (TRANSIENT_DIR / "api").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    # Build the output path via contained_path — the normpath+startswith
    # containment barrier recognized by static analysis (api-conventions.md).
    # task_id is server-generated and output_extension is a literal from the
    # allowlist, so no user input flows into the path; assert containment anyway.
    output_path = contained_path(output_dir, f"{task_id}{output_extension}")

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
            # orchestrator.submit() is fully blocking (admission loop with
            # time.sleep, HTTP dispatch, retries) — run it off the event loop
            # so it doesn't stall every other API request, /jobs poll, and
            # websocket broadcast for the duration of this request (PERF-2).
            await run_in_threadpool(orchestrator.submit, task)
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
    # Must match the inline threshold in synthesize() (< 500), otherwise a
    # 500-char preview would be queued and return a job envelope, contradicting
    # the "always inline" contract.
    if len(request.text) >= 500:
        raise HTTPException(status_code=422, detail="Preview text must be under 500 characters.")

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
        "message": _public_job_message(job),
        "progress": getattr(job, "progress", 0.0),
    }

    # Terminal success in the Job status vocabulary (app/db/models.py) is "done".
    if job.status == "done":
        response["download_url"] = f"/api/v1/tts/jobs/{job_id}/audio"

    return response

@router.get("/jobs/{job_id}/audio")
async def get_job_audio(job_id: str):
    """Download the audio output of a completed job."""
    jobs = get_jobs()
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Terminal success is "done" in the Job status vocabulary (app/db/models.py).
    if job.status != "done":
        raise HTTPException(status_code=400, detail=f"Job is in state '{job.status}'.")

    # The Job model does not persist the API output path, so reconstruct it the
    # same way POST /synthesize built it: TRANSIENT_DIR/api/<job_id><ext>, where
    # <ext> is one of the fixed output-format extensions. contained_path is the
    # normpath+startswith containment barrier — it rejects any traversal in the
    # (URL-supplied) job_id, and confining lookups to TRANSIENT_DIR/api means a
    # non-API job id can never be used to serve a Studio render's audio.
    api_output_dir = (TRANSIENT_DIR / "api").resolve()
    served_path: Optional[Path] = None
    for ext in (".wav", ".mp3", ".ogg", ".flac"):
        try:
            candidate = contained_path(api_output_dir, f"{job_id}{ext}")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid job id.")
        if candidate.is_file():
            served_path = candidate
            break

    if served_path is None:
        raise HTTPException(status_code=410, detail="Audio file has expired or been removed.")

    return FileResponse(served_path, filename=served_path.name)

@router.get("/openapi", include_in_schema=False)
async def get_openapi_schema():
    """Serve the OpenAPI schema behind the same auth/rate-limit gate as the rest of the API."""
    return JSONResponse(tts_app.openapi())

@router.get("/docs", include_in_schema=False)
async def get_docs(req_context: Request):
    """Serve the Swagger UI behind the same auth/rate-limit gate as the rest of the API."""
    root_path = req_context.scope.get("root_path", "").rstrip("/")
    return get_swagger_ui_html(
        openapi_url=f"{root_path}/openapi",
        title=f"{tts_app.title} - Swagger UI",
    )

# Mount the router into the sub-app
tts_app.include_router(router)
