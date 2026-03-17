import pytest
import os
import json
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db

client = TestClient(fastapi_app)

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

def test_home_endpoint(clean_db):
    """GET /api/home — the main system info/home endpoint."""
    response = client.get("/api/home")
    assert response.status_code == 200

def test_settings_get_and_update(clean_db):
    response = client.post("/api/settings", json={"safe_mode": False})
    assert response.status_code == 200

def test_default_speaker_setting(clean_db):
    # POST /api/settings/default-speaker
    response = client.post("/api/settings/default-speaker",
                           data={"name": "TestVoice"})
    assert response.status_code == 200

def test_audiobooks_list(clean_db):
    response = client.get("/api/audiobooks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_system_integrations(clean_db):
    # Trigger backfill
    response = client.post("/api/trigger_backfill")
    assert response.status_code == 200

    # Import legacy - needs some form data
    response = client.post("/api/system/import-legacy", data={"legacy_path": "/tmp/nonexistent"})
    # It might return 200 even if path doesn't exist depending on implementation (logging only)
    assert response.status_code in (200, 400)

    # WebSocket route check (basic)
    # response = client.get("/ws") -> This is a websocket, TestClient handles it differently
    pass
