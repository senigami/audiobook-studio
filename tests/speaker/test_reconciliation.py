import time
from app.state import put_job, get_jobs
from app.models import Job
from app.jobs.reconcile import cleanup_and_reconcile, _output_exists

def test_voice_output_exists_for_voice_engine():
    """_output_exists must return True for voice_build/voice_test to prevent reconcile loop."""
    # These should return True so reconcile does NOT re-queue done voice jobs
    assert _output_exists("voice_build", "")
    assert _output_exists("voice_test", "")
    # xtts with no file still returns False (existing behavior)
    assert not _output_exists("xtts", "")

def test_reconcile_does_not_requeue_voice_jobs(clean_db):
    """Done voice_build/voice_test jobs must NOT be reset to queued by reconcile."""
    jid = "build-test-reconcile"
    j = Job(
        id=jid,
        engine="voice_build",
        speaker_profile="TestVoice",
        chapter_file="",
        status="done",
        created_at=time.time(),
        finished_at=time.time()  # finished just now -> not stale yet
    )
    put_job(j)

    cleanup_and_reconcile()

    # Voice job should still be 'done', NOT reset to 'queued'
    result = get_jobs().get(jid)
    assert result is not None
    assert result.status == "done", f"Expected 'done' but got '{result.status}' — reconcile incorrectly requeued a voice job!"
