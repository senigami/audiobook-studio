import pytest
from fastapi.testclient import TestClient
from pathlib import Path

# Import the app from app.web
from app.web import app
from app.config import CHAPTER_DIR

client = TestClient(app)

@pytest.fixture
def temp_chapter():
    # Setup: Create a temporary chapter file
    test_file = "test_unit_api.txt"
    test_path = CHAPTER_DIR / test_file
    CHAPTER_DIR.mkdir(parents=True, exist_ok=True)
    test_path.write_text("Hello world", encoding="utf-8")
    yield test_file
    # Teardown: Remove the temporary file
    if test_path.exists():
        test_path.unlink()

def test_api_preview_raw(temp_chapter):
    response = client.get(f"/api/preview/{temp_chapter}")
    assert response.status_code == 200
    assert response.json()["text"] == "Hello world"

def test_api_preview_processed(temp_chapter):
    # This should trigger sanitization (adding period)
    response = client.get(f"/api/preview/{temp_chapter}?processed=true")
    assert response.status_code == 200
    # Processed output should have a period and may be padded
    assert response.json()["text"].strip() == "Hello world."

def test_api_jobs_list():
    response = client.get("/api/jobs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_api_audiobook_prepare_empty():
    # If no audio files, should return chapters list
    response = client.get("/api/audiobook/prepare")
    assert response.status_code == 200
    data = response.json()
    assert "chapters" in data
    assert isinstance(data["chapters"], list)

def test_api_active_job():
    response = client.get("/api/active_job")
    assert response.status_code == 200

def test_backfill_surgical_logic(temp_chapter, monkeypatch):
    from app.config import XTTS_OUT_DIR
    from app.state import put_job, get_jobs, delete_jobs
    from app.models import Job
    import time

    def mock_wav_to_mp3(wav_path, mp3_path):
        mp3_path.write_text("fake mp3 content")
        return 0

    monkeypatch.setattr("app.engines.wav_to_mp3", mock_wav_to_mp3)

    # 1. Force a job into state for our temp chapter
    jid = "test_backfill_jid"
    # Cleanup any previous test run
    delete_jobs([jid])

    job = Job(
        id=jid,
        engine="xtts",
        chapter_file=temp_chapter,
        status="done",
        make_mp3=True,
        created_at=time.time()
    )
    put_job(job)

    # 2. Create only the WAV file
    stem = Path(temp_chapter).stem
    wav_path = XTTS_OUT_DIR / f"{stem}.wav"
    mp3_path = XTTS_OUT_DIR / f"{stem}.mp3"
    XTTS_OUT_DIR.mkdir(parents=True, exist_ok=True)
    wav_path.write_text("fake wav content", encoding="utf-8")
    if mp3_path.exists(): mp3_path.unlink()

    # 3. Call backfill endpoint (now starts a background thread)
    response = client.post("/queue/backfill_mp3")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

    # 4. Wait for the background process to finish surgical backfill
    # Since it's in a thread, we poll until the job status becomes 'done'
    max_wait = 5.0
    start_wait = time.time()
    while time.time() - start_wait < max_wait:
        job = get_jobs().get(jid)
        if job and job.status == "done":
            break
        time.sleep(0.1)

    # 5. Check that the job status is indeed 'done'
    job = get_jobs().get(jid)
    assert job is not None
    assert job.status == "done"

    # Cleanup files
    if mp3_path.exists(): mp3_path.unlink()
    delete_jobs([jid])

def test_queue_uniqueness():
    """
    Verifies that a chapter cannot be added to the queue more than once concurrently.
    """
    from app.db import create_project, create_chapter, get_queue
    from app.state import clear_all_jobs
    import uuid

    # 1. Setup clean environment
    clear_all_jobs()

    # 2. Create mock project and chapter
    pid = create_project("Queue Uniqueness Test")
    cid = create_chapter(project_id=pid, title="Unique Chapter")

    # 3. Add to queue first time
    res1 = client.post("/api/processing_queue", data={
        "project_id": pid,
        "chapter_id": cid,
        "split_part": 0,
        "speaker_profile": "test_profile"
    })
    assert res1.status_code == 200

    # 4. Attempt to add to queue second time
    res2 = client.post("/api/processing_queue", data={
        "project_id": pid,
        "chapter_id": cid,
        "split_part": 0,
        "speaker_profile": "test_profile"
    })

    # Should succeed, but return the exact same queue_id instead of a new one
    assert res2.status_code == 200
    assert res1.json()["queue_id"] == res2.json()["queue_id"]

    # 5. Verify the actual queue only has 1 physical row
    q = get_queue()
    chapter_entries = [i for i in q if i["chapter_id"] == cid]
    assert len(chapter_entries) == 1

def test_clear_queue_preserves_running():
    """
    Verifies that clearing the queue does not remove jobs with status 'running'.
    """
    from app.db import create_project, create_chapter, add_to_queue, update_queue_item, get_queue
    from app.state import clear_all_jobs

    clear_all_jobs()
    pid = create_project("Clear Queue Test")

    # 1. Add two chapters to queue
    cid1 = create_chapter(project_id=pid, title="Running Chapter")
    cid2 = create_chapter(project_id=pid, title="Queued Chapter")

    qid1 = add_to_queue(pid, cid1)
    qid2 = add_to_queue(pid, cid2)

    # 2. Set one to 'running'
    update_queue_item(qid1, "running")

    # 3. Clear the queue
    response = client.delete("/api/processing_queue")
    assert response.status_code == 200
    assert response.json()["cleared"] >= 1

    # 4. Verify 'running' job remains, 'queued' job is gone
    queue = get_queue()
    remaining_ids = [item['id'] for item in queue]

    assert qid1 in remaining_ids
    assert qid2 not in remaining_ids

    # 5. Verify chapter status reset
    from app.db import get_chapter
    chap1 = get_chapter(cid1)
    chap2 = get_chapter(cid2)
    assert chap1['audio_status'] == 'processing' # Still running
    assert chap2['audio_status'] == 'unprocessed' # Reset from processing

def test_chapter_text_last_modified():
    from app.db import create_project, create_chapter, update_chapter, get_chapter
    import time

    pid = create_project("Test Modified")
    cid = create_chapter(project_id=pid, title="Original Title", text_content="Original text")

    chap1 = get_chapter(cid)
    original_time = chap1['text_last_modified']

    # Wait a tiny bit to ensure timestamp would be different if updated
    time.sleep(0.01)

    # 1. Update only the title
    update_chapter(cid, title="New Title")
    chap2 = get_chapter(cid)
    assert chap2['title'] == "New Title"
    assert chap2['text_last_modified'] == original_time # Should NOT have changed

    # Wait a tiny bit again
    time.sleep(0.01)

    # 2. Update the text content
    update_chapter(cid, text_content="New text")
    chap3 = get_chapter(cid)
    assert chap3['text_content'] == "New text"
    assert chap3['text_last_modified'] > original_time # SHOULD have changed

