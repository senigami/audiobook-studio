import pytest
import time
from fastapi.testclient import TestClient
from app.api.web import app
from app.db.models import Job
from app.db.state import put_job, get_jobs, update_job
from pathlib import Path

client = TestClient(app)

@pytest.fixture(autouse=True)
def mock_state(tmp_path, monkeypatch):
    test_state = tmp_path / "state.json"
    monkeypatch.setattr("app.db.state.STATE_FILE", test_state)
    monkeypatch.setattr("app.db.legacy_migration.CHAPTER_DIR", tmp_path / "chapters")
    monkeypatch.setattr("app.db.legacy_migration.AUDIO_OUT_DIR", tmp_path / "audio_out")

    (tmp_path / "chapters").mkdir(parents=True, exist_ok=True)
    (tmp_path / "reports").mkdir(parents=True, exist_ok=True)
    (tmp_path / "audio_out").mkdir(parents=True, exist_ok=True)
    return tmp_path

def test_analysis_router_endpoints(mock_state):
    # Test analyze_text endpoint (POST)
    response = client.post("/api/analyze_text", json={"text_content": "This is a short sentence. This is another one."})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["char_count"] > 0
    assert "safe_text" in data

    # Test report endpoint (GET) - 404 case
    response = client.get("/api/report/nonexistent")
    assert response.status_code == 404

def test_db_characters_coverage(mock_state):
    from app.db.characters import get_characters, create_character, update_character, delete_character

    project_id = "test-project"

    # Create character
    char_id = create_character(project_id, name="Alice", color="#ff0000")
    assert char_id is not None

    # Get characters
    chars = get_characters(project_id)
    assert len(chars) == 1
    assert chars[0]["name"] == "Alice"

    # Update character
    update_character(char_id, name="Alicia")
    chars = get_characters(project_id)
    assert chars[0]["name"] == "Alicia"

    # Delete character
    delete_character(char_id)
    chars = get_characters(project_id)
    assert len(chars) == 0

def test_jobs_state_update_coverage(mock_state):
    # Instead of fail_job, we use update_job from state
    job = Job(id="fail_me", engine="xtts", chapter_file="c.txt", status="running", created_at=time.time())
    put_job(job)

    update_job("fail_me", status="failed", error="System Error")

    jobs = get_jobs()
    assert jobs["fail_me"].status == "failed"
    assert jobs["fail_me"].error == "System Error"

def test_web_additional_endpoints(mock_state):
    # Trigger more paths in web.py or routers
    res = client.get("/api/home")
    assert res.status_code == 200

    res = client.get("/api/projects")
    assert res.status_code == 200

def test_migration_coverage(mock_state):
    from app.db.legacy_migration import import_legacy_filesystem_data

    # Create a dummy chapter file
    (mock_state / "chapters").mkdir(parents=True, exist_ok=True)
    (mock_state / "chapters" / "legacy.txt").write_text("Legacy content")

    # Create matching audio
    (mock_state / "audio_out").mkdir(parents=True, exist_ok=True)
    (mock_state / "audio_out" / "legacy.mp3").write_text("audio data")

    res = import_legacy_filesystem_data()
    assert res["status"] == "success"
    assert "legacy" in res["message"] or "1" in res["message"]
