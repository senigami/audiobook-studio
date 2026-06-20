import pytest
import os
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_analysis.db"
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

def test_analyze_chapter(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.state import update_settings
    update_settings({"default_engine": "xtts"})
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "This is a test sentence. Another one here.")

    # Sync segments so analyze has real data
    response = client.post(f"/api/chapters/{cid}/sync-segments",
                           json={"text": "This is a test sentence. Another one here."})
    assert response.status_code == 200

    # Analyze the chapter
    response = client.get(f"/api/chapters/{cid}/analyze")
    assert response.status_code == 200
    data = response.json()
    assert "char_count" in data

def test_analyze_text(clean_db, client):
    from app.db.state import update_settings
    update_settings({"default_engine": "xtts"})
    payload = {"text_content": "Hello world. This is a sample sentence for testing."}
    response = client.post("/api/analyze_text", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "char_count" in data
    assert "word_count" in data
    assert "safe_text" in data

def test_report_not_found(clean_db, tmp_path, client):
    from app.api.web import app as fastapi_app
    from app.api.routers.analysis import get_report_dir
    fastapi_app.dependency_overrides[get_report_dir] = lambda: tmp_path
    response = client.get("/api/report/nonexistent")
    assert response.status_code == 404
    fastapi_app.dependency_overrides = {}


def test_analyze_chapter_fails_when_no_engine(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from unittest.mock import patch
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "This is a test sentence. Another one here.")

    # Sync segments so analyze has real data
    response = client.post(f"/api/chapters/{cid}/sync-segments",
                           json={"text": "This is a test sentence. Another one here."})
    assert response.status_code == 200

    # Mock both settings (no default_engine) and the registry (no installed engines).
    # list_tts_engines is the registry boundary — legitimate to mock here.
    with patch("app.api.routers.analysis.state.get_settings", return_value={}), \
         patch("app.api.routers.analysis.list_tts_engines", return_value=[]):
        # Analyze the chapter
        response = client.get(f"/api/chapters/{cid}/analyze")
        assert response.status_code == 400
        assert "engine" in response.json()["message"].lower()


def test_analyze_text_fails_when_no_engine(clean_db, client):
    from unittest.mock import patch
    payload = {"text_content": "Hello world. This is a sample sentence for testing."}

    # Mock both settings (no default_engine) and the registry (no installed engines).
    # list_tts_engines is the registry boundary — legitimate to mock here.
    with patch("app.api.routers.analysis.state.get_settings", return_value={}), \
         patch("app.api.routers.analysis.list_tts_engines", return_value=[]):
        response = client.post("/api/analyze_text", json=payload)
        assert response.status_code == 400
        assert "engine" in response.json()["message"].lower()


def test_analyze_text_falls_back_to_installed_engine_when_default_engine_empty(clean_db, client):
    """R1 revert-check target: empty default_engine falls back to first installed engine → 200."""
    from app.db.state import update_settings
    # Explicitly set default_engine to empty string (mirrors app/state.json ship default).
    update_settings({"default_engine": ""})
    payload = {"text_content": "Hello world. This is a sample sentence for testing."}
    response = client.post("/api/analyze_text", json=payload)
    assert response.status_code == 200, response.json()
    data = response.json()
    assert "char_count" in data
    assert "threshold" in data


def test_analyze_chapter_falls_back_to_installed_engine_when_default_engine_empty(clean_db, client):
    """R1 revert-check target: empty default_engine falls back to first installed engine → 200."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.state import update_settings
    # Explicitly set default_engine to empty string.
    update_settings({"default_engine": ""})
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "This is a test sentence. Another one here.")

    response = client.post(f"/api/chapters/{cid}/sync-segments",
                           json={"text": "This is a test sentence. Another one here."})
    assert response.status_code == 200

    response = client.get(f"/api/chapters/{cid}/analyze")
    assert response.status_code == 200, response.json()
    data = response.json()
    assert "char_count" in data
    assert "threshold" in data
