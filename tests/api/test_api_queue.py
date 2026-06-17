import pytest
import os
import uuid
import json
import time
import importlib
from unittest.mock import patch
from app.db.models import Job
from app.db.state import put_job, clear_all_jobs

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / f"test_api_queue_{uuid.uuid4().hex}.db"
    os.environ["DB_PATH"] = os.fspath(db_path)
    import app.db.core
    core = importlib.reload(app.db.core)
    core.init_db()

    import app.db.state as state_module
    state_module.clear_all_jobs()

    from app.db.state import update_settings
    update_settings({"default_speaker_profile": "DefaultVoice"})

    yield
    state_module.clear_all_jobs()
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_queue_api(clean_db, voices_root, client):
    default_profile_dir = voices_root / "DefaultVoice" / "Default"
    default_profile_dir.mkdir(parents=True, exist_ok=True)
    (default_profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))
    (voices_root / "DefaultVoice" / "voice.json").write_text(json.dumps({"version": 2, "name": "DefaultVoice"}))

    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    prefix = uuid.uuid4().hex[:6]
    pid = create_project(f"P-{prefix}")
    cid1 = create_chapter(pid, f"C1-{prefix}", "T1")
    cid2 = create_chapter(pid, f"C2-{prefix}", "T2")

    # Add to queue (from generation.py)
    with patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid1})
        assert response.status_code == 200, f"Failed to add to queue: {response.json()}"
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


def test_failed_queue_items_expose_error_reason(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import add_to_queue, update_queue_item

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    qid = add_to_queue(pid, cid)

    update_queue_item(qid, "running")
    update_queue_item(qid, "failed", error="Stitching failed (rc=1)")

    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    row = next(item for item in response.json() if item["id"] == qid)
    assert row["status"] == "failed"
    assert row["error"] == "Stitching failed (rc=1)"








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
    from app.db.state import put_job

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

    update_queue_item(jid, "running", chapter_scoped=False)
    chapter = get_chapter(cid)
    assert chapter["audio_status"] == "unprocessed"
    assert chapter["audio_file_path"] is None

    update_queue_item(jid, "done", audio_length_seconds=12.3, output_file=f"{cid}.wav", chapter_scoped=False)
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
    assert row["progress"] == 0.0


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
    assert row["progress"] == 0.0


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
    assert row["progress"] == 0.0


def test_processing_queue_returns_completed_output_metadata_without_duplicate_rows(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.performance import record_render_sample
    from app.db.queue import upsert_queue_row, update_queue_item

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    jid = "job-output-metadata"
    completed_at = time.time()

    upsert_queue_row(jid, project_id=pid, chapter_id=cid, status="queued", engine="mixed")
    update_queue_item(jid, "running")
    record_render_sample(
        engine="mixed",
        chars=100,
        word_count=20,
        segment_count=2,
        duration_seconds=4.0,
        audio_duration_seconds=10.0,
        job_id=jid,
        project_id=pid,
        chapter_id=cid,
        completed_at=completed_at - 5,
        synthesis_duration_seconds=3.5,
    )
    record_render_sample(
        engine="mixed",
        chars=1234,
        word_count=250,
        segment_count=5,
        duration_seconds=8.0,
        audio_duration_seconds=75.4,
        job_id=jid,
        project_id=pid,
        chapter_id=cid,
        completed_at=completed_at,
        synthesis_duration_seconds=7.0,
    )
    update_queue_item(jid, "done", audio_length_seconds=75.4, output_file=f"{cid}.wav")


    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    rows = [item for item in response.json() if item["id"] == jid]

    assert len(rows) == 1
    row = rows[0]
    assert row["status"] == "done"
    assert row["audio_length_seconds"] == 75.4
    assert row["produced_audio_length"] == 75.4
    assert row["produced_chars"] == 1234
    assert row["produced_word_count"] == 250
    assert row["produced_segment_count"] == 5


def test_queue_never_returns_simulated_finalizing(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.core import get_connection
    import time

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
            ("job-test-finalizing", pid, cid, now - 5, now - 2),
        )
        conn.commit()

    # Even if engine is voxtral (which declares simulated_finalizing), and completed within 12 seconds
    # and has no audio, it must NOT return status "finalizing".
    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    rows = {item["id"]: item for item in response.json()}
    assert rows["job-test-finalizing"]["status"] == "done"


def test_processing_queue_hydrates_classification(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import upsert_queue_row, update_queue_item

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    jid = "job-classification-test"

    put_job(Job(
        id=jid,
        project_id=pid,
        chapter_id=cid,
        chapter_file=f"{cid}_0.txt",
        status="running",
        created_at=time.time(),
        engine="xtts",
    ))
    upsert_queue_row(jid, project_id=pid, chapter_id=cid, status="queued", engine="xtts")
    update_queue_item(jid, "running")

    response = client.get("/api/processing_queue")
    assert response.status_code == 200

    row = next(item for item in response.json() if item["id"] == jid)
    assert row["classification"] == "chapter"


# ---------------------------------------------------------------------------
# Fallback-chain tests: chapter default and project/book default voices
# ---------------------------------------------------------------------------

@pytest.fixture
def clean_db_no_default(tmp_path):
    """Like clean_db but does NOT set a global default_speaker_profile."""
    db_path = tmp_path / f"test_api_queue_nodefault_{uuid.uuid4().hex}.db"
    os.environ["DB_PATH"] = os.fspath(db_path)
    import app.db.core
    core = importlib.reload(app.db.core)
    core.init_db()

    import app.db.state as state_module
    state_module.clear_all_jobs()

    from app.db.state import update_settings
    update_settings({"default_speaker_profile": ""})

    yield
    state_module.clear_all_jobs()
    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture
def client_no_default(clean_db_no_default):
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)


def _make_voice(voices_root, voice_name: str):
    """Create a minimal on-disk voice structure under voices_root."""
    profile_dir = voices_root / voice_name / "Default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(
        json.dumps({"variant_name": "Default", "engine": "xtts"})
    )
    (voices_root / voice_name / "voice.json").write_text(
        json.dumps({"version": 2, "name": voice_name})
    )


def test_add_to_queue_uses_chapter_default_voice(clean_db_no_default, voices_root, client_no_default):
    """Case A: chapter.speaker_profile_name set, no global default → queue proceeds (not 400)."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter, update_chapter

    _make_voice(voices_root, "ChapterVoice")

    pid = create_project("proj-chapter-default")
    cid = create_chapter(pid, "ch-chapter-default", "Some text")
    update_chapter(cid, speaker_profile_name="ChapterVoice")

    with patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client_no_default.post(
            "/api/processing_queue",
            data={"project_id": pid, "chapter_id": cid},
        )

    assert response.status_code != 400 or "No voice available" not in response.json().get("message", ""), (
        f"Expected queue to proceed via chapter default voice, got {response.status_code}: {response.json()}"
    )


def test_add_to_queue_uses_project_default_voice(clean_db_no_default, voices_root, client_no_default):
    """Case B: project.speaker_profile_name set, no global default, chapter has none → queue proceeds."""
    from app.db.projects import create_project, update_project
    from app.db.chapters import create_chapter

    _make_voice(voices_root, "ProjectVoice")

    pid = create_project("proj-project-default")
    update_project(pid, speaker_profile_name="ProjectVoice")
    cid = create_chapter(pid, "ch-project-default", "Some text")

    with patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client_no_default.post(
            "/api/processing_queue",
            data={"project_id": pid, "chapter_id": cid},
        )

    assert response.status_code != 400 or "No voice available" not in response.json().get("message", ""), (
        f"Expected queue to proceed via project default voice, got {response.status_code}: {response.json()}"
    )


def test_add_to_queue_blocks_when_no_voice_anywhere(clean_db_no_default, voices_root, client_no_default):
    """Guard: no voice anywhere → still returns 400 with the expected message."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter

    pid = create_project("proj-no-voice")
    cid = create_chapter(pid, "ch-no-voice", "Some text")

    with patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client_no_default.post(
            "/api/processing_queue",
            data={"project_id": pid, "chapter_id": cid},
        )

    assert response.status_code == 400
    assert "No voice available" in response.json().get("message", "")


def test_add_to_queue_uses_character_voice_when_segment_has_no_direct_profile(
    clean_db_no_default, voices_root, client_no_default
):
    """Character-voice resolution: segment.speaker_profile_name is empty, but the
    segment's character has a voice → queue must proceed (not 400).
    Also guards the true-empty case: if the character has no voice either, it still blocks."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.characters import create_character
    from app.db.segments import sync_chapter_segments, update_segment
    from app.db.core import get_connection

    _make_voice(voices_root, "CharacterVoice")

    pid = create_project("proj-char-voice")

    # Create character WITH a speaker_profile_name
    char_id = create_character(pid, "Narrator", speaker_profile_name="CharacterVoice")

    # Create chapter with text (sync_chapter_segments will create the segment rows)
    cid = create_chapter(pid, "ch-char-voice", "Some text here.")
    sync_chapter_segments(cid, "Some text here.")

    # Assign the segment to the character; leave speaker_profile_name empty
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (cid,))
        seg_row = cursor.fetchone()
        seg_id = seg_row["id"]

    update_segment(seg_id, character_id=char_id, speaker_profile_name=None, broadcast=False)

    # Confirm: segment has no direct profile, but character has one
    from app.domain.chunk_groups import load_chunk_segments, resolve_segment_profile_name
    segments = load_chunk_segments(cid)
    assert segments, "Expected at least one segment"
    seg = segments[0]
    assert not seg.get("speaker_profile_name"), "segment should have no direct profile"
    assert seg.get("character_speaker_profile_name") == "CharacterVoice", (
        "character voice should be exposed via JOIN"
    )
    assert resolve_segment_profile_name(seg, None) == "CharacterVoice"

    # Case 1: character has voice → queue must NOT return "No voice available" 400
    with patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response = client_no_default.post(
            "/api/processing_queue",
            data={"project_id": pid, "chapter_id": cid},
        )

    assert response.status_code != 400 or "No voice available" not in response.json().get("message", ""), (
        f"Expected queue to proceed via character voice, got {response.status_code}: {response.json()}"
    )

    # Case 2 (guard): character with NO voice, segment with no profile → still 400
    pid2 = create_project("proj-char-novoice")
    char_id2 = create_character(pid2, "Silent", speaker_profile_name=None)
    cid2 = create_chapter(pid2, "ch-char-novoice", "Some text here.")
    sync_chapter_segments(cid2, "Some text here.")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (cid2,))
        seg_row2 = cursor.fetchone()
        seg_id2 = seg_row2["id"]

    update_segment(seg_id2, character_id=char_id2, speaker_profile_name=None, broadcast=False)

    with patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
        response2 = client_no_default.post(
            "/api/processing_queue",
            data={"project_id": pid2, "chapter_id": cid2},
        )

    assert response2.status_code == 400
    assert "No voice available" in response2.json().get("message", ""), (
        f"Guard case should block when character also has no voice: {response2.json()}"
    )
