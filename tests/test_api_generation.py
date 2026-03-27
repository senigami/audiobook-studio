import pytest
import os
import importlib
from unittest.mock import patch, MagicMock

@pytest.fixture
def client(clean_db):
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_api_gen.db"
    os.environ["DB_PATH"] = str(db_path)
    import app.db.core
    importlib.reload(app.db.core)
    app.db.core.init_db()

    from app.state import update_settings
    update_settings({"default_speaker_profile": "Voice1"})

    yield

def test_queue_and_bake(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    # Add to queue
    with patch("app.api.routers.generation.put_job"), patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        assert "queue_id" in response.json()

    # Bake
    with patch("app.api.routers.generation.put_job"), patch("app.api.routers.generation.enqueue"):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 200
        assert "job_id" in response.json()

def test_pause_resume(clean_db, client):
    response = client.post("/api/generation/pause")
    assert response.status_code == 200

    response = client.post("/api/generation/resume")
    assert response.status_code == 200

def test_generate_segments(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    sid = segs[0]['id']

    with patch("app.api.routers.generation.put_job"), patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/segments/generate", data={"segment_ids": sid})
        assert response.status_code == 200
        assert "job_id" in response.json()


def test_queue_chapter_without_bakeable_segments_uses_standard_xtts(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    with patch("app.api.routers.generation.put_job") as mock_put_job, patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.is_bake is False


def test_queue_chapter_preserves_rendered_segment_history(clean_db, client, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Another line.")
    sync_chapter_segments(cid, "Hello world. Another line.")
    segs = get_chapter_segments(cid)

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    rendered_name = f"seg_{segs[0]['id']}.wav"
    (audio_dir / rendered_name).write_bytes(b"fake wav")
    update_segment(segs[0]["id"], audio_status="done", audio_file_path=rendered_name)
    update_segment(segs[1]["id"], audio_status="unprocessed", audio_file_path=None)

    with patch("app.api.routers.generation.find_existing_project_dir", return_value=tmp_path), \
         patch("app.api.routers.generation.find_existing_project_subdir", side_effect=lambda _project_id, dirname: audio_dir if dirname == "audio" else None), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.is_bake is True
        refreshed = get_chapter_segments(cid)
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == rendered_name
        assert refreshed[1]["audio_status"] == "unprocessed"


def test_queue_chapter_resolves_voxtral_engine_from_profile(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    client.post("/api/settings", data={"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"), \
         patch("app.jobs.speaker.get_speaker_settings", return_value={"engine": "voxtral"}):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "voxtral"


def test_queue_chapter_rejects_mixed_engines(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")

    with patch("app.api.routers.generation.get_chapter_segments", return_value=[
        {"speaker_profile_name": "XTTS Voice", "audio_status": "unprocessed", "audio_file_path": None},
        {"speaker_profile_name": "Voxtral Voice", "audio_status": "unprocessed", "audio_file_path": None},
    ]), \
         patch("app.jobs.speaker.get_speaker_settings", side_effect=lambda name: {"engine": "voxtral" if "Voxtral" in (name or "") else "xtts"}):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "XTTS Voice"})
        assert response.status_code == 409


def test_generate_segments_resolves_voxtral_engine(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    sid = segs[0]['id']
    client.post("/api/settings", data={"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"), \
         patch("app.jobs.speaker.get_speaker_settings", return_value={"engine": "voxtral"}):
        response = client.post("/api/segments/generate", data={"segment_ids": sid})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "voxtral"


def test_queue_chapter_rejects_voxtral_without_api_key(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    with patch("app.jobs.speaker.get_speaker_settings", return_value={"engine": "voxtral"}), \
         patch("app.api.routers.generation.get_settings", return_value={"safe_mode": True, "make_mp3": False, "default_engine": "xtts"}):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Voice1"})
        assert response.status_code == 400
        assert "Mistral API key" in response.json()["message"]
