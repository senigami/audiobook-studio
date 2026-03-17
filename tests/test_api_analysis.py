import pytest
import os
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.web import app as fastapi_app
from app.db.core import init_db

client = TestClient(fastapi_app)

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

def test_analyze_chapter(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
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

def test_analyze_text(clean_db):
    payload = {"text_content": "Hello world. This is a sample sentence for testing."}
    response = client.post("/api/analyze_text", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "char_count" in data
    assert "word_count" in data
    assert "safe_text" in data

def test_report_not_found(clean_db, tmp_path):
    from app.api.routers.analysis import get_report_dir
    fastapi_app.dependency_overrides[get_report_dir] = lambda: tmp_path
    response = client.get("/api/report/nonexistent")
    assert response.status_code == 404
    fastapi_app.dependency_overrides = {}
