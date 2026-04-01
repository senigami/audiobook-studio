import pytest
import time
import json
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient
from app.web import app, _main_loop
from app.models import Job
from app.state import put_job, get_settings, get_jobs

client = TestClient(app)

@pytest.fixture(autouse=True)
def mock_state(tmp_path, monkeypatch):
    # Fix state file to a temp location
    test_state = tmp_path / "state.json"
    monkeypatch.setattr("app.state.STATE_FILE", test_state)
    monkeypatch.setattr("app.config.CHAPTER_DIR", tmp_path / "chapters")
    monkeypatch.setattr("app.config.XTTS_OUT_DIR", tmp_path / "xtts")
    monkeypatch.setattr("app.config.AUDIOBOOK_DIR", tmp_path / "audiobooks")
    monkeypatch.setattr("app.config.VOICES_DIR", tmp_path / "voices")
    monkeypatch.setattr("app.config.SAMPLES_DIR", tmp_path / "samples")

    monkeypatch.setattr("app.web.CHAPTER_DIR", tmp_path / "chapters")
    monkeypatch.setattr("app.web.XTTS_OUT_DIR", tmp_path / "xtts")
    monkeypatch.setattr("app.web.AUDIOBOOK_DIR", tmp_path / "audiobooks")
    monkeypatch.setattr("app.web.VOICES_DIR", tmp_path / "voices")
    monkeypatch.setattr("app.web.SAMPLES_DIR", tmp_path / "samples")

    monkeypatch.setattr("app.jobs.reconcile.CHAPTER_DIR", tmp_path / "chapters")
    monkeypatch.setattr("app.jobs.reconcile.XTTS_OUT_DIR", tmp_path / "xtts")
    monkeypatch.setattr("app.jobs.reconcile.AUDIOBOOK_DIR", tmp_path / "audiobooks")
    monkeypatch.setattr("app.jobs.speaker.VOICES_DIR", tmp_path / "voices")
    monkeypatch.setattr("app.jobs.worker.CHAPTER_DIR", tmp_path / "chapters")
    monkeypatch.setattr("app.jobs.worker.XTTS_OUT_DIR", tmp_path / "xtts")

    (tmp_path / "chapters").mkdir(parents=True, exist_ok=True)
    (tmp_path / "xtts").mkdir(parents=True, exist_ok=True)
    (tmp_path / "reports").mkdir(parents=True, exist_ok=True)
    (tmp_path / "audiobooks").mkdir(parents=True, exist_ok=True)
    (tmp_path / "voices").mkdir(parents=True, exist_ok=True)
    (tmp_path / "samples").mkdir(parents=True, exist_ok=True)
    (tmp_path / "voices" / "Default").mkdir(parents=True, exist_ok=True)
    return tmp_path

def test_web_startup_recovery(mock_state):
    from app.web import startup_event
    j = Job(id="rec_j", engine="xtts", chapter_file="c.txt", status="running", created_at=time.time())
    put_job(j)

    startup_event()
    # startup_event deletes queued/running jobs entirely (clean slate on restart)
    assert "rec_j" not in get_jobs()

def test_jobs_reconcile_logic(mock_state):
    from app.jobs import cleanup_and_reconcile, XTTS_OUT_DIR
    # Create the text file so it's not pruned as stale
    c_dir = mock_state / "chapters"
    c_dir.mkdir(parents=True, exist_ok=True)
    (c_dir / "m.txt").write_text("test")

    # Ensure XTTS_OUT_DIR is clean and exists
    XTTS_OUT_DIR.mkdir(parents=True, exist_ok=True)

    j = Job(id="missing_j", engine="xtts", chapter_file="m.txt", status="done", created_at=time.time())
    put_job(j)

    res = cleanup_and_reconcile()
    assert "missing_j" in res
    assert get_jobs()["missing_j"].status == "queued"

def test_speaker_wavs_listing(mock_state):
    from app.jobs import get_speaker_wavs
    v_dir = mock_state / "voices" / "v1"
    v_dir.mkdir()
    (v_dir / "voice.wav").write_text("data")
    (v_dir / "sample.wav").write_text("data")

    res = get_speaker_wavs("v1")
    assert "voice.wav" in res
    assert "sample.wav" not in res

def test_web_endpoints_misc(mock_state):
    # Settings (Fix: field is 'name', not 'profile_name')
    response = client.post("/api/settings/default-speaker", data={"name": "v1"})
    assert response.status_code == 200

    # Backfill
    response = client.post("/queue/backfill_mp3")
    assert response.status_code == 200

    # Audiobook list lives on its own endpoint now
    (mock_state / "audiobooks" / "book.m4b").write_text("data")
    res = client.get("/api/audiobooks")
    assert res.status_code == 200
    assert len(res.json()) > 0

def test_web_chapter_ops(mock_state):
    c_path = mock_state / "chapters" / "c1.txt"
    c_path.write_text("content")

    # Reset
    j = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="done", created_at=time.time())
    put_job(j)
    response = client.post("/api/chapter/reset", data={"chapter_file": "c1.txt"})
    assert response.status_code == 200
    assert get_jobs()["j1"].status == "cancelled"

    # Delete
    response = client.delete("/api/chapter/c1.txt")
    assert response.status_code == 200
    assert not c_path.exists()
