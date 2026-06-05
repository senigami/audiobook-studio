import pytest
from fastapi.testclient import TestClient
import os
from app.db.core import init_db
from app.api.web import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_chapters_assets.db"
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

def test_preview_processed_fails_with_no_engine(clean_db, client):
    # 1. Create a project and chapter
    res = client.post("/api/projects", data={"name": "P1"})
    pid = res.json()["project_id"]
    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "C1", "text_content": "Some text"})
    cid = res.json()["chapter"]["id"]

    # 2. Set default_engine in settings to empty
    from app.db.state import update_settings
    update_settings({"default_engine": ""})

    # 3. Call preview with processed=true, should return 400
    response = client.get(f"/api/chapters/{cid}/preview?processed=true")
    assert response.status_code == 400
    assert "No TTS engine" in response.json()["message"]
