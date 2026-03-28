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


def test_bake_chapter_mixed_engines_use_mixed_worker(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    client.post("/api/settings", data={"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.get_chapter_segments", return_value=[
        {"speaker_profile_name": "XTTS Voice", "audio_status": "done", "audio_file_path": "seg_1.wav"},
        {"speaker_profile_name": "Voxtral Voice", "audio_status": "unprocessed", "audio_file_path": None},
    ]), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"), \
         patch("app.jobs.speaker.get_speaker_settings", side_effect=lambda name: {"engine": "voxtral" if "Voxtral" in (name or "") else "xtts"}):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"
        assert job.project_id == pid
        assert job.chapter_file == f"{cid}_0.txt"


def test_bake_chapter_voxtral_uses_mixed_worker(clean_db, client):
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
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_bake_chapter_rejects_voxtral_without_api_key(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    with patch("app.jobs.speaker.get_speaker_settings", return_value={"engine": "voxtral"}), \
         patch("app.api.routers.generation.get_settings", return_value={"default_speaker_profile": "Voice1", "default_engine": "xtts"}):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 400
        assert "Mistral API key" in response.json()["message"]

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


def test_generate_segments_pure_xtts_use_mixed_worker(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"), \
         patch("app.jobs.speaker.get_speaker_settings", return_value={"engine": "xtts"}):
        response = client.post("/api/segments/generate", data={"segment_ids": f"{segs[0]['id']},{segs[1]['id']}"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


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


def test_get_chapter_segments_treats_done_without_audio_path_as_unprocessed(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.core import get_connection

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE chapter_segments SET audio_status = 'done', audio_file_path = NULL WHERE chapter_id = ?", (cid,))
        conn.commit()

    refreshed = get_chapter_segments(cid)
    assert refreshed[0]["audio_status"] == "unprocessed"
    assert refreshed[0]["audio_file_path"] is None


def test_get_chapter_segments_treats_other_segment_audio_paths_as_unprocessed(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.core import get_connection

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    expected_name = f"seg_{segs[1]['id']}.wav"
    (audio_dir / expected_name).write_bytes(b"fake wav")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE chapter_segments
            SET audio_status = 'done',
                audio_file_path = ?
            WHERE chapter_id = ?
            """,
            (expected_name, cid),
        )
        conn.commit()

    with patch("app.config.get_project_audio_dir", return_value=audio_dir):
        refreshed = get_chapter_segments(cid)

    assert refreshed[0]["audio_status"] == "unprocessed"
    assert refreshed[0]["audio_file_path"] is None
    assert refreshed[1]["audio_status"] == "done"
    assert refreshed[1]["audio_file_path"] == expected_name


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


def test_queue_chapter_mixed_engines_use_mixed_worker(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")

    client.post("/api/settings", data={"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.get_chapter_segments", return_value=[
        {"speaker_profile_name": "XTTS Voice", "audio_status": "unprocessed", "audio_file_path": None},
        {"speaker_profile_name": "Voxtral Voice", "audio_status": "unprocessed", "audio_file_path": None},
    ]), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"), \
         patch("app.jobs.speaker.get_speaker_settings", side_effect=lambda name: {"engine": "voxtral" if "Voxtral" in (name or "") else "xtts"}):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "XTTS Voice"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


def test_queue_chapter_detects_mixed_engines_from_character_voice_assignments(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
    from app.db.characters import create_character

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Narration. Dialogue.")
    sync_chapter_segments(cid, "Narration. Dialogue.")
    segs = get_chapter_segments(cid)
    char_id = create_character(pid, "Dracula", "XTTS Voice")
    update_segment(segs[1]["id"], character_id=char_id)
    client.post("/api/settings", data={"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"), \
         patch("app.jobs.speaker.get_speaker_settings", side_effect=lambda name: {"engine": "voxtral" if name == "Narrator Voxtral" else "xtts"}):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid, "speaker_profile": "Narrator Voxtral"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


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
        assert job.engine == "mixed"


def test_generate_segments_mixed_engines_use_mixed_worker(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)
    client.post("/api/settings", data={"mistral_api_key": "abc123"})

    with patch("app.api.routers.generation.get_chapter_segments", return_value=[
        {**segs[0], "speaker_profile_name": "XTTS Voice"},
        {**segs[1], "speaker_profile_name": "Voxtral Voice"},
    ]), \
         patch("app.api.routers.generation.put_job") as mock_put_job, \
         patch("app.api.routers.generation.enqueue"), \
         patch("app.jobs.speaker.get_speaker_settings", side_effect=lambda name: {"engine": "voxtral" if "Voxtral" in (name or "") else "xtts"}):
        response = client.post("/api/segments/generate", data={"segment_ids": f"{segs[0]['id']},{segs[1]['id']}"})
        assert response.status_code == 200
        job = mock_put_job.call_args.args[0]
        assert job.engine == "mixed"


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
