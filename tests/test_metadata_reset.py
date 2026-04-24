from fastapi.testclient import TestClient
from app.web import app
from app.state import put_job, get_jobs, update_job
from app.models import Job
import time

from app.config import CHAPTER_DIR

client = TestClient(app)

def test_metadata_clearing_on_requeue():
    # Setup mock chapter file
    test_file = "test_reset_unit.txt"
    test_path = CHAPTER_DIR / test_file
    CHAPTER_DIR.mkdir(parents=True, exist_ok=True)
    test_path.write_text("dummy", encoding="utf-8")

    jid = "test_reset_job"
    # 1. Create a job that looks like it was run before
    job = Job(
        id=jid,
        engine="xtts",
        chapter_file=test_file,
        status="done",
        progress=1.0,
        log="Previous logs...",
        started_at=time.time() - 100,
        finished_at=time.time() - 50,
        warning_count=5,
        created_at=time.time() - 200
    )
    put_job(job)

    # 2. Re-queue it (e.g. by starting queue which reconciles or just calling start_xtts)
    # We'll call /queue/start_xtts which should trigger reset_metadata for existing queued jobs
    # but first let's set it to 'queued' to simulate a restart where it was saved as done but we want to re-run
    update_job(jid, status="queued")

    from app.jobs import requeue
    requeue(jid)

    # 3. Verify it's reset
    j = get_jobs().get(jid)
    assert j.progress == 0.0 or j.status == "running"
    # Old log "Previous logs..." should be gone
    assert "Previous logs..." not in j.log
    # Old warning count should be reset
    assert j.warning_count == 0
    assert j.status in ["queued", "running"]

    # Cleanup
    if test_path.exists(): test_path.unlink()
    from app.state import delete_jobs
    delete_jobs([jid])
