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
    response = client.post("/api/settings", json={"safe_mode": True, "make_mp3": False})
    assert response.status_code == 200
    data = response.json()["settings"]
    assert data["safe_mode"] is True
    assert data["make_mp3"] is False

def test_default_speaker_setting(clean_db, client):
    # POST /api/settings/default-speaker
    response = client.post("/api/settings/default-speaker",
                           data={"name": "TestVoice"})
    assert response.status_code == 200
    home = client.get("/api/home").json()
    assert home["settings"]["default_speaker_profile"] == "TestVoice"

def test_audiobooks_list(clean_db, client, tmp_path, monkeypatch):
    from app.api import utils as api_utils
    monkeypatch.setattr(api_utils.config, "AUDIOBOOK_DIR", tmp_path / "audiobooks")
    monkeypatch.setattr(api_utils.config, "PROJECTS_DIR", tmp_path / "projects")
    api_utils.config.AUDIOBOOK_DIR.mkdir()
    api_utils.config.PROJECTS_DIR.mkdir()
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
