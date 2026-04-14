import pytest
import os
import json
import time
from unittest.mock import patch
from app.db.core import init_db
from app.models import Job
from app.state import put_job, clear_all_jobs

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_queue.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()
    clear_all_jobs()

    from app.state import update_settings
    update_settings({"default_speaker_profile": "DefaultVoice"})

    yield
    clear_all_jobs()
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_queue_api(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid1 = create_chapter(pid, "C1", "T1")
    cid2 = create_chapter(pid, "C2", "T2")

    # Add to queue (from generation.py)
    with patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid1})
        assert response.status_code == 200
        qid1 = response.json()["queue_id"]

        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid2})
        assert response.status_code == 200
        qid2 = response.json()["queue_id"]

    # Get queue (from queue.py)
    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    queue_data = response.json()
    ids = [item["id"] for item in queue_data]
    assert ids.index(qid1) < ids.index(qid2)

    # Reorder queue
    response = client.put("/api/processing_queue/reorder", json={"queue_ids": [qid2, qid1]})
    assert response.status_code == 200

    response = client.get("/api/processing_queue")
    ids = [item["id"] for item in response.json()]
    assert ids.index(qid2) < ids.index(qid1)

    # Delete from queue
    response = client.delete(f"/api/processing_queue/{qid1}")
    assert response.status_code == 200
    response = client.get("/api/processing_queue")
    assert qid1 not in [item["id"] for item in response.json()]

    # Clear completed
    response = client.post("/api/processing_queue/clear_completed")
    assert response.status_code == 200


def test_processing_queue_recovers_memory_queue_when_live_queued_jobs_exist(clean_db, client):
    from app.db.queue import upsert_queue_row
    from app.jobs.core import job_queue, assembly_queue

    jid = "job-recover"
    put_job(Job(
        id=jid,
        engine="xtts",
        chapter_file="overview.txt",
        status="queued",
        created_at=1.0,
    ))
    upsert_queue_row(jid, status="queued", engine="xtts")

    while not job_queue.empty():
        job_queue.get_nowait()
    while not assembly_queue.empty():
        assembly_queue.get_nowait()

    with patch("app.jobs.sync_memory_queue") as mock_sync:
        response = client.get("/api/processing_queue")

    assert response.status_code == 200
    assert any(item["id"] == jid for item in response.json())
    mock_sync.assert_called_once()


def test_processing_queue_ensures_workers_before_recovery(clean_db, client):
    from app.db.queue import upsert_queue_row

    jid = "job-worker-recover"
    put_job(Job(
        id=jid,
        engine="xtts",
        chapter_file="overview.txt",
        status="queued",
        created_at=1.0,
    ))
    upsert_queue_row(jid, status="queued", engine="xtts")

    with patch("app.jobs.ensure_workers") as mock_ensure:
        response = client.get("/api/processing_queue")

    assert response.status_code == 200
    assert mock_ensure.call_count >= 1


def test_processing_queue_reconciles_db_running_row_when_memory_job_is_done(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter, get_chapter
    from app.db.queue import add_to_queue, update_queue_item
    from app.db.core import get_connection

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    jid = add_to_queue(pid, cid)
    update_queue_item(jid, "running")

    put_job(Job(
        id=jid,
        project_id=pid,
        chapter_id=cid,
        chapter_file=f"{cid}_0.txt",
        status="done",
        created_at=1.0,
        engine="mixed",
        custom_title="C1: segment #5",
    ))

    response = client.get("/api/processing_queue")
    assert response.status_code == 200

    row = next(item for item in response.json() if item["id"] == jid)
    assert row["status"] == "done"

    with get_connection() as conn:
        db_row = conn.execute("SELECT status, completed_at FROM processing_queue WHERE id = ?", (jid,)).fetchone()
        assert db_row["status"] == "done"
        assert db_row["completed_at"] is not None

    assert get_chapter(cid)["audio_status"] == "unprocessed"


def test_processing_queue_keeps_old_done_voxtral_row_done_when_new_run_is_already_queued(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.core import get_connection
    from app.state import put_job

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    now = time.time()

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at, completed_at, engine)
            VALUES (?, ?, ?, 0, 'done', ?, ?, 'voxtral')
            """,
            ("job-old", pid, cid, now - 30, now - 2),
        )
        cursor.execute(
            """
            INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at, engine)
            VALUES (?, ?, ?, 0, 'queued', ?, 'voxtral')
            """,
            ("job-new", pid, cid, now),
        )
        cursor.execute(
            "UPDATE chapters SET audio_status = 'processing', audio_file_path = NULL WHERE id = ?",
            (cid,),
        )
        conn.commit()

    put_job(Job(
        id="job-new",
        project_id=pid,
        chapter_id=cid,
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=now,
        engine="voxtral",
    ))

    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    rows = {item["id"]: item for item in response.json()}
    assert rows["job-old"]["status"] == "done"
    assert rows["job-new"]["status"] == "queued"


def test_segment_scoped_queue_updates_do_not_mutate_chapter_audio_state(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter, get_chapter
    from app.db.queue import upsert_queue_row, update_queue_item

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    jid = "job-segment"

    put_job(Job(
        id=jid,
        project_id=pid,
        chapter_id=cid,
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        engine="mixed",
        segment_ids=["segment-1", "segment-2"],
        custom_title="C1: segment #3",
    ))
    upsert_queue_row(jid, project_id=pid, chapter_id=cid, status="queued", engine="mixed")

    update_queue_item(jid, "running")
    chapter = get_chapter(cid)
    assert chapter["audio_status"] == "unprocessed"
    assert chapter["audio_file_path"] is None

    update_queue_item(jid, "done", audio_length_seconds=12.3, output_file=f"{cid}.wav")
    chapter = get_chapter(cid)
    assert chapter["audio_status"] == "unprocessed"
    assert chapter["audio_file_path"] is None


def test_processing_queue_hydrates_running_progress_for_reload(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import upsert_queue_row, update_queue_item

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    jid = "job-reload-progress"
    start_time = time.time() - 10

    put_job(Job(
        id=jid,
        project_id=pid,
        chapter_id=cid,
        chapter_file=f"{cid}_0.txt",
        status="running",
        created_at=start_time - 5,
        started_at=start_time,
        eta_seconds=100,
        progress=0.0,
        engine="xtts",
    ))
    upsert_queue_row(jid, project_id=pid, chapter_id=cid, status="queued", engine="xtts")
    update_queue_item(jid, "running")

    response = client.get("/api/processing_queue")
    assert response.status_code == 200

    row = next(item for item in response.json() if item["id"] == jid)
    assert row["status"] == "running"
    assert row["started_at"] is not None
    assert row["eta_seconds"] == 100
    assert row["progress"] >= 0.09


def test_processing_queue_hydrates_running_progress_when_active_segment_is_set_but_idle(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import upsert_queue_row, update_queue_item

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    jid = "job-reload-segment-id"
    start_time = time.time() - 12

    put_job(Job(
        id=jid,
        project_id=pid,
        chapter_id=cid,
        chapter_file=f"{cid}_0.txt",
        status="running",
        created_at=start_time - 5,
        started_at=start_time,
        eta_seconds=120,
        progress=0.0,
        engine="xtts",
        active_segment_id="seg-1",
        active_segment_progress=0.0,
    ))
    upsert_queue_row(jid, project_id=pid, chapter_id=cid, status="queued", engine="xtts")
    update_queue_item(jid, "running")

    response = client.get("/api/processing_queue")
    assert response.status_code == 200

    row = next(item for item in response.json() if item["id"] == jid)
    assert row["status"] == "running"
    assert row["progress"] >= 0.09


def test_processing_queue_hydrates_preparing_progress_for_reload(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import upsert_queue_row, update_queue_item

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    jid = "job-reload-preparing"
    start_time = time.time() - 12

    put_job(Job(
        id=jid,
        project_id=pid,
        chapter_id=cid,
        chapter_file=f"{cid}_0.txt",
        status="preparing",
        created_at=start_time - 5,
        started_at=start_time,
        eta_seconds=120,
        progress=0.0,
        engine="xtts",
    ))
    upsert_queue_row(jid, project_id=pid, chapter_id=cid, status="queued", engine="xtts")
    update_queue_item(jid, "preparing")

    response = client.get("/api/processing_queue")
    assert response.status_code == 200

    row = next(item for item in response.json() if item["id"] == jid)
    assert row["status"] == "preparing"
    assert row["progress"] >= 0.09
