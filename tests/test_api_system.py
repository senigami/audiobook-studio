import pytest
import os
import json
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_system.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_home_endpoint(clean_db, client):
    """GET /api/home — the main system info/home endpoint."""
    response = client.get("/api/home")
    assert response.status_code == 200
    data = response.json()
    assert {"chapters", "jobs", "settings", "speaker_profiles", "speakers"}.issubset(data.keys())
    assert isinstance(data["speaker_profiles"], list)

def test_settings_get_and_update(clean_db, client):
    response = client.post("/api/settings", json={
        "safe_mode": True,
        "make_mp3": False,
        "voxtral_enabled": True,
        "voxtral_model": "voxtral-mini-tts-2603",
        "mistral_api_key": "abc123",
    })
    assert response.status_code == 200
    data = response.json()["settings"]
    assert data["safe_mode"] is True
    assert data["make_mp3"] is False
    assert data["voxtral_enabled"] is True
    assert data["voxtral_model"] == "voxtral-mini-tts-2603"
    assert data["mistral_api_key"] == "abc123"

def test_settings_accept_form_encoded_voxtral_config(clean_db, client):
    response = client.post("/api/settings", data={"mistral_api_key": "form-key", "voxtral_model": "voxtral-custom", "voxtral_enabled": "true"})
    assert response.status_code == 200
    data = response.json()["settings"]
    assert data["mistral_api_key"] == "form-key"
    assert data["voxtral_model"] == "voxtral-custom"
    assert data["voxtral_enabled"] is True

def test_settings_upgrade_legacy_voxtral_model_name(clean_db, client):
    response = client.post("/api/settings", json={"voxtral_model": "voxtral-tts", "mistral_api_key": "abc123"})
    assert response.status_code == 200
    data = response.json()["settings"]
    assert data["voxtral_model"] == "voxtral-mini-tts-2603"

def test_settings_normalize_default_engine_when_voxtral_disabled(clean_db, client, monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    response = client.post("/api/settings", json={"default_engine": "voxtral", "mistral_api_key": "", "voxtral_enabled": True})
    assert response.status_code == 200
    data = response.json()["settings"]
    assert data["default_engine"] == "xtts"
    assert data["voxtral_enabled"] is False
    assert "mistral_api_key" not in data

def test_settings_backfill_voxtral_enabled_when_key_exists(clean_db, client):
    response = client.post("/api/settings", json={"mistral_api_key": "abc123"})
    assert response.status_code == 200
    data = response.json()["settings"]
    assert data["voxtral_enabled"] is True

def test_default_speaker_setting(clean_db, client, tmp_path, monkeypatch):
    # POST /api/settings/default-speaker
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    from app import config
    import app.web as web
    from app.api.routers import system as r_system, voices as r_voices
    monkeypatch.setenv("VOICES_DIR", str(voices_dir))
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(web, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(r_system, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(r_voices, "VOICES_DIR", voices_dir)

    response = client.post("/api/settings/default-speaker",
                           data={"name": "TestVoice"})
    assert response.status_code == 200
    home = client.get("/api/home").json()
    assert home["settings"]["default_speaker_profile"] == "TestVoice"

def test_audiobooks_list(clean_db, client, tmp_path, monkeypatch):
    audiobook_dir = tmp_path / "audiobooks"
    projects_dir = tmp_path / "projects"
    monkeypatch.setenv("AUDIOBOOK_DIR", str(audiobook_dir))
    monkeypatch.setenv("PROJECTS_DIR", str(projects_dir))
    from app import config
    import app.web as web
    monkeypatch.setattr(config, "AUDIOBOOK_DIR", audiobook_dir)
    monkeypatch.setattr(config, "PROJECTS_DIR", projects_dir)
    monkeypatch.setattr(web, "AUDIOBOOK_DIR", audiobook_dir)
    monkeypatch.setattr(web, "PROJECTS_DIR", projects_dir)
    audiobook_dir.mkdir()
    projects_dir.mkdir()
    response = client.get("/api/audiobooks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert response.json() == []

def test_system_integrations(clean_db, client):
    # Trigger backfill
    response = client.post("/api/trigger_backfill")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # Import legacy - needs some form data
    response = client.post("/api/system/import-legacy", data={"legacy_path": "/tmp/nonexistent"})
    # It might return 200 even if path doesn't exist depending on implementation
    assert response.status_code in (200, 400)
