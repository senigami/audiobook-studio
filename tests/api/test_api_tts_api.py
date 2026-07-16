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
