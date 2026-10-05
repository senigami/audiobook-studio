import pytest
import os
import time
from pathlib import Path
from fastapi.testclient import TestClient
from app.api.web import app
from app.db.state import update_settings

@pytest.fixture
def client():
    # Use TestClient with a fake host to test LAN protection
    return TestClient(app, base_url="http://localhost")

@pytest.fixture
def auth_client():
    # Setup a client with an API key
    update_settings({
        "tts_api_enabled": True,
        "tts_api_key": "testkey",
        "lan_binding_enabled": False
    })
    client = TestClient(app, base_url="http://localhost")
    client.headers = {"Authorization": "Bearer testkey"}
    return client

def test_tts_api_disabled(client):
    """Should return 403 when API is disabled in settings."""
    update_settings({"tts_api_enabled": False})
    response = client.get("/api/v1/tts/engines")
    assert response.status_code == 403
    assert "disabled" in response.json()["detail"].lower()

def test_tts_api_unauthorized(client):
    """Should return 401 when API key is required but missing/invalid."""
    update_settings({
        "tts_api_enabled": True, 
        "tts_api_key": "secret"
    })
    # Missing key
    response = client.get("/api/v1/tts/engines")
    assert response.status_code == 401

    # Invalid key
    response = client.get("/api/v1/tts/engines", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401


def test_list_engines(auth_client):
    """GET /engines should return available engines."""
    response = auth_client.get("/api/v1/tts/engines")
    assert response.status_code == 200
    data = response.json()
    assert "engines" in data
    assert isinstance(data["engines"], list)

def test_synthesize_inline(auth_client, monkeypatch, tmp_path):
    """POST /synthesize with short text should return inline audio (mocked)."""
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator
    import app.api.tts_api as tts_api
    from app.core.config import TRANSIENT_DIR

    # Use a temp directory for TRANSIENT_DIR
    out_dir = tmp_path / "transient"
    out_dir.mkdir()
    monkeypatch.setattr(tts_api, "TRANSIENT_DIR", out_dir)

    # Mock orchestrator.submit to create a dummy file
    def mock_submit(self, task):
        # Use the task.output_path which was built using the monkeypatched TRANSIENT_DIR
        out_file = Path(task.output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_file, "wb") as f:
            f.write(b"fake wav data")
        return task.task_id

    monkeypatch.setattr(TaskOrchestrator, "submit", mock_submit)

    response = auth_client.post("/api/v1/tts/synthesize", json={
        "engine_id": "xtts",
        "text": "Short text",
        "output_format": "wav"
    })

    # Check if there was an error detail
    if response.status_code != 200:
        print(f"DEBUG: Response body: {response.json()}")

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"fake wav data"


def test_synthesize_inline_offloads_submit_to_threadpool(auth_client, monkeypatch, tmp_path):
    """PERF-2: the inline /synthesize path must run orchestrator.submit() (a
    fully blocking call — admission loop with time.sleep, HTTP dispatch,
    retries) off the asyncio event loop via run_in_threadpool, not directly
    on the async handler. Otherwise it freezes the whole event loop for the
    request's duration, stalling every other API request, /jobs poll, and
    websocket broadcast.

    Revert-check (R1): pre-fix, the handler called `orchestrator.submit(task)`
    directly — `tts_api.run_in_threadpool` is never invoked, so the
    `threadpool_calls == 1` assertion below fails (0 calls) on that code.
    """
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator
    import app.api.tts_api as tts_api

    out_dir = tmp_path / "transient"
    out_dir.mkdir()
    monkeypatch.setattr(tts_api, "TRANSIENT_DIR", out_dir)

    def mock_submit(self, task):
        out_file = Path(task.output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_bytes(b"fake wav data")
        return task.task_id

    monkeypatch.setattr(TaskOrchestrator, "submit", mock_submit)

    threadpool_calls = []
    original_run_in_threadpool = tts_api.run_in_threadpool

    async def spy_run_in_threadpool(func, *args, **kwargs):
        threadpool_calls.append(func)
        return await original_run_in_threadpool(func, *args, **kwargs)

    # raising=False: on pre-fix code the handler never references this name at
    # all, so the attribute still needs to exist for the spy to attach to.
    monkeypatch.setattr(tts_api, "run_in_threadpool", spy_run_in_threadpool, raising=False)

    response = auth_client.post("/api/v1/tts/synthesize", json={
        "engine_id": "xtts",
        "text": "Short text",
        "output_format": "wav",
    })

    assert response.status_code == 200
    assert response.content == b"fake wav data"
    assert len(threadpool_calls) == 1, (
        "inline /synthesize must call orchestrator.submit() via run_in_threadpool "
        f"exactly once (off the event loop); got {len(threadpool_calls)} call(s)"
    )


def test_synthesize_queued(auth_client, monkeypatch):
    """POST /synthesize with long text should return a job ID."""
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator

    # Mock submit to do nothing (simulating async/background)
    monkeypatch.setattr(TaskOrchestrator, "submit", lambda s, t: t.task_id)

    long_text = "A" * 600
    response = auth_client.post("/api/v1/tts/synthesize", json={
        "engine_id": "xtts",
        "text": long_text
    })

    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "queued"
    assert "poll_url" in data

def test_rate_limiting(auth_client, monkeypatch):
    """Should return 429 after exceeding limit."""
    from app.core.security import _limiter
    # Lower the limit for testing
    _limiter.requests_per_minute = 2
    _limiter._history = {} # Reset

    # Request 1
    assert auth_client.get("/api/v1/tts/engines").status_code == 200
    # Request 2
    assert auth_client.get("/api/v1/tts/engines").status_code == 200
    # Request 3 - should fail
    response = auth_client.get("/api/v1/tts/engines")
    assert response.status_code == 429
    assert "too many requests" in response.json()["detail"].lower()

    # Reset limit
    _limiter.requests_per_minute = 30

# --- S4: voice_ref security tests ---

def test_voice_ref_path_traversal_rejected(auth_client):
    """voice_ref with path traversal (../../etc/passwd) should return 400."""
    response = auth_client.post("/api/v1/tts/synthesize", json={
        "engine_id": "xtts",
        "text": "Short text",
        "voice_ref": "../../etc/passwd",
    })
    assert response.status_code == 400, response.json()


def test_voice_ref_absolute_outside_voices_dir_rejected(auth_client):
    """voice_ref pointing outside VOICES_DIR/TRANSIENT_DIR should return 400."""
    response = auth_client.post("/api/v1/tts/synthesize", json={
        "engine_id": "xtts",
        "text": "Short text",
        "voice_ref": "/tmp/evil_voice.wav",
    })
    assert response.status_code == 400, response.json()


def test_voice_ref_unknown_plain_name_returns_404(auth_client, monkeypatch):
    """voice_ref with a plain unknown profile name should return 404."""
    import app.db.speakers as speakers
    monkeypatch.setattr(speakers, "_resolve_existing_profile_name", lambda _name: None)

    response = auth_client.post("/api/v1/tts/synthesize", json={
        "engine_id": "xtts",
        "text": "Short text",
        "voice_ref": "NonExistentVoiceProfile",
    })
    assert response.status_code == 404, response.json()


def test_voice_ref_valid_profile_name_passes(auth_client, monkeypatch, tmp_path):
    """voice_ref with a known profile name should pass validation and synthesize."""
    import app.db.speakers as speakers
    import app.api.tts_api as tts_api
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator

    # Make the profile lookup succeed
    monkeypatch.setattr(speakers, "_resolve_existing_profile_name", lambda _name: "MyVoice")

    # Use a temp dir for output
    out_dir = tmp_path / "transient"
    out_dir.mkdir()
    monkeypatch.setattr(tts_api, "TRANSIENT_DIR", out_dir)

    def mock_submit(self, task):
        out_file = Path(task.output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_bytes(b"fake wav")
        return task.task_id

    monkeypatch.setattr(TaskOrchestrator, "submit", mock_submit)

    response = auth_client.post("/api/v1/tts/synthesize", json={
        "engine_id": "xtts",
        "text": "Hello world",
        "voice_ref": "MyVoice",
    })
    assert response.status_code == 200, response.json()


# --- Auth coverage on the docs/OpenAPI routes ---
#
# FastAPI's auto-generated docs/openapi/redoc routes (docs_url/openapi_url on
# the FastAPI() constructor) are registered via add_route(), which bypasses
# the dependency-injection system entirely -- so `dependencies=[...]` passed
# to the constructor does NOT protect them. tts_api.py serves its own
# /docs and /openapi routes on `router` instead so they inherit the same
# verify_api_key + rate_limit enforcement as every other endpoint. These
# tests guard against that regressing.

def test_docs_requires_auth(client):
    """GET /docs must require the API key like every other route."""
    update_settings({"tts_api_enabled": True, "tts_api_key": "secret"})
    response = client.get("/api/v1/tts/docs")
    assert response.status_code == 401

def test_openapi_requires_auth(client):
    """GET /openapi must require the API key like every other route."""
    update_settings({"tts_api_enabled": True, "tts_api_key": "secret"})
    response = client.get("/api/v1/tts/openapi")
    assert response.status_code == 401

def test_docs_rejected_when_api_disabled(client):
    """GET /docs must respect tts_api_enabled like every other route."""
    update_settings({"tts_api_enabled": False})
    response = client.get("/api/v1/tts/docs")
    assert response.status_code == 403

def test_docs_and_openapi_accessible_with_valid_key(auth_client):
    """With a valid key, /docs and /openapi should still work normally."""
    docs_response = auth_client.get("/api/v1/tts/docs")
    assert docs_response.status_code == 200
    assert "swagger" in docs_response.text.lower()

    openapi_response = auth_client.get("/api/v1/tts/openapi")
    assert openapi_response.status_code == 200
    schema = openapi_response.json()
    assert "paths" in schema
    assert "/engines" in schema["paths"]


def test_get_job_status(auth_client, monkeypatch):
    """GET /jobs/{id} should return status from state.json."""
    from app.db.state import put_job, Job

    job_id = "test_job_status"
    put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=time.time(),
        progress=0.5
    ))

    response = auth_client.get(f"/api/v1/tts/jobs/{job_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == job_id
    assert data["status"] == "running"
    assert data["progress"] == 0.5


def test_voice_ref_pth_extension_rejected():
    """SEC-3: a caller-supplied .pth voice_ref must be rejected even when it
    resolves inside VOICES_DIR — it would otherwise feed torch.load a
    caller-controlled latent file. Revert-check: pre-fix this path was accepted."""
    from fastapi import HTTPException
    from app.api.tts_api import _validate_voice_ref, VOICES_DIR

    # A .pth path that IS contained under VOICES_DIR (so it fails ONLY on the
    # .pth rule, not on containment).
    ref = str(Path(VOICES_DIR) / "someprofile" / "latent.pth")
    with pytest.raises(HTTPException) as exc:
        _validate_voice_ref(ref)
    assert exc.value.status_code == 400
    assert ".pth" in str(exc.value.detail).lower()


# --- R1: queued-job completion + download flow ---

def test_get_job_completed_download(auth_client, monkeypatch, tmp_path):
    """A finished job must expose a download_url and serve its audio.

    Revert-check (R1): pre-fix, both endpoints compared against ``"completed"``
    (never a real Status — terminal success is ``"done"``) and read
    ``job.payload`` (no such field on Job). So the status response carried no
    download_url and ``/audio`` returned 400 ("Job is in state 'done'.") or 500.
    This test fails on that code.
    """
    import app.api.tts_api as tts_api
    from app.db.state import put_job, Job

    transient = tmp_path / "transient"
    api_dir = transient / "api"
    api_dir.mkdir(parents=True)
    monkeypatch.setattr(tts_api, "TRANSIENT_DIR", transient)

    job_id = "api_deadbeef"
    (api_dir / f"{job_id}.wav").write_bytes(b"RIFFxxxxWAVEdata")
    put_job(Job(id=job_id, engine="xtts", status="done", created_at=time.time(), progress=1.0))

    status = auth_client.get(f"/api/v1/tts/jobs/{job_id}")
    assert status.status_code == 200
    body = status.json()
    assert body["status"] == "done"
    assert body["download_url"] == f"/api/v1/tts/jobs/{job_id}/audio"

    audio = auth_client.get(f"/api/v1/tts/jobs/{job_id}/audio")
    assert audio.status_code == 200
    assert audio.content == b"RIFFxxxxWAVEdata"


def test_get_job_audio_rejected_when_not_done(auth_client):
    """/audio must refuse a job that has not reached terminal success."""
    from app.db.state import put_job, Job

    job_id = "api_running_job"
    put_job(Job(id=job_id, engine="xtts", status="running", created_at=time.time()))
    resp = auth_client.get(f"/api/v1/tts/jobs/{job_id}/audio")
    assert resp.status_code == 400


def test_get_job_audio_missing_file_returns_410(auth_client, monkeypatch, tmp_path):
    """A done job whose audio file is gone returns 410, not 500."""
    import app.api.tts_api as tts_api
    from app.db.state import put_job, Job

    transient = tmp_path / "transient"
    (transient / "api").mkdir(parents=True)
    monkeypatch.setattr(tts_api, "TRANSIENT_DIR", transient)

    job_id = "api_expired"
    put_job(Job(id=job_id, engine="xtts", status="done", created_at=time.time(), progress=1.0))
    resp = auth_client.get(f"/api/v1/tts/jobs/{job_id}/audio")
    assert resp.status_code == 410


def test_job_status_message_is_sanitized(auth_client):
    """A failed job must not leak internal error text (paths/URLs) to the caller.

    Revert-check (R2): pre-fix the endpoint returned ``getattr(job, "message",
    None)`` — currently always None only because Job has no ``message`` field,
    an accidental defense. This asserts the message is a fixed generic string and
    that the raw ``job.error`` (which CAN carry a filesystem path) never appears
    in the response body.
    """
    from app.db.state import put_job, Job

    job_id = "api_failed_job"
    put_job(Job(
        id=job_id, engine="xtts", status="failed", created_at=time.time(),
        error="/Users/secret/internal/voices/latent.pth failed to load",
    ))
    resp = auth_client.get(f"/api/v1/tts/jobs/{job_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "failed"
    assert body["message"] == "Synthesis failed."
    assert "secret" not in resp.text
    assert "internal/voices" not in resp.text


# --- R7a: /preview off-by-one ---

def test_preview_rejects_exactly_500_chars(auth_client, monkeypatch):
    """/preview must reject >= 500 chars so it is *always* inline.

    Revert-check (R7a): pre-fix it rejected only ``> 500``, so a 500-char body
    was delegated to synthesize, hit the ``< 500`` inline threshold as false,
    got queued, and returned 200 with a job envelope — contradicting the
    "always inline" contract.
    """
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator
    monkeypatch.setattr(TaskOrchestrator, "submit", lambda s, t: t.task_id)

    resp = auth_client.post("/api/v1/tts/preview", json={"engine_id": "xtts", "text": "A" * 500})
    assert resp.status_code == 422, resp.json()


# --- R7b: unbounded text length ---

def test_synthesize_text_too_long_rejected(auth_client):
    """Text over the max_length cap must be rejected at the boundary (422).

    Revert-check (R7b): pre-fix ``SynthesisRequest.text`` had no max_length, so
    an arbitrarily large body was accepted onto the queue (a cheap DoS vector).
    """
    resp = auth_client.post("/api/v1/tts/synthesize", json={"engine_id": "xtts", "text": "A" * 100_001})
    assert resp.status_code == 422


def test_synthesize_empty_text_rejected(auth_client):
    """Empty text must be rejected (min_length=1)."""
    resp = auth_client.post("/api/v1/tts/synthesize", json={"engine_id": "xtts", "text": ""})
    assert resp.status_code == 422


def test_voice_ref_symlink_escape_rejected(tmp_path, monkeypatch):
    """SEC-3: safe_join resolves symlinks, so a symlink inside VOICES_DIR that
    points outside the root must be rejected (the old lexical normpath check
    would have passed it)."""
    from fastapi import HTTPException
    import app.api.tts_api as tts_api_mod

    voices = tmp_path / "voices"
    voices.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.wav").write_bytes(b"x")
    link = voices / "escape"
    link.symlink_to(outside)  # voices/escape -> outside

    monkeypatch.setattr(tts_api_mod, "VOICES_DIR", voices)
    ref = str(link / "secret.wav")  # lexically under voices/, really outside
    with pytest.raises(HTTPException) as exc:
        tts_api_mod._validate_voice_ref(ref)
    assert exc.value.status_code == 400
