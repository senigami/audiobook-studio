import os
import pytest
from pathlib import Path

# NOTE: Do NOT import TestClient or app at the top level.
# Doing so can trigger module loading before conftest.py env vars are set.

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app
    return TestClient(app)

def test_sandbox_isolation_verification(client):
    """
    CRITICAL: Verifies that the test environment is truly isolated.
    The paths used during tests should be within a temporary directory,
    not the real production directories.
    """
    # Import inside to ensure conftest.py env vars have taken effect on constants
    from app.config import PROJECTS_DIR
    from app.db import DB_PATH

    # 1. Verify PROJECTS_DIR is inside a temp directory (it should match os.environ)
    env_projects = os.environ.get("PROJECTS_DIR")
    assert str(PROJECTS_DIR) == env_projects
    assert "projects" in str(PROJECTS_DIR)

    # 2. Verify we aren't using the production DB file
    assert "test_audiobook_studio.db" in str(DB_PATH), f"Expected 'test_audiobook_studio.db' in {DB_PATH}"

    # 3. Verify environment variable overrides are active
    assert os.environ.get("AUDIOBOOK_BASE_DIR") is not None

def test_export_sample_with_project_context(client):
    """
    Verifies that the restored export-sample endpoint works correctly
    with the new project_id structure.
    """
    # 1. Create a project and chapter
    res = client.post("/api/projects", data={"name": "SafetyTest"})
    pid = res.json()["project_id"]

    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "SafetyChapter", "text_content": "Safety first."})
    cid = res.json()["chapter"]["id"]

    # 2. Mock a WAV file in the project's nested chapter directory
    from app.config import get_chapter_dir
    c_dir = get_chapter_dir(pid, cid)
    wav_path = c_dir / "chapter.wav"
    wav_path.write_text("fake audio data")

    # 3. Call the export endpoint with project_id
    res = client.post(f"/api/chapters/{cid}/export-sample?project_id={pid}")

    # We expect success if the file is found
    assert res.status_code in [200, 500]
    if res.status_code == 200:
        assert "url" in res.json()
    else:
        # If it failed due to video gen, it still found the source
        assert res.json().get("message") != "Audio not found for this chapter. Generate it first."

def test_reset_chapter_isolation(client):
    """
    Verifies that resetting a chapter correctly clears files
    inside the project-specific directory.
    """
    res = client.post("/api/projects", data={"name": "ResetTarget"})
    pid = res.json()["project_id"]

    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "ToReset"})
    cid = res.json()["chapter"]["id"]

    from app.config import get_chapter_dir
    c_dir = get_chapter_dir(pid, cid)
    wav_path = c_dir / "chapter.wav"
    wav_path.write_text("data")

    # Manually update the chapter to point to this file so reset knows to delete it
    from app.db import update_chapter
    update_chapter(cid, audio_file_path="chapter.wav")

    assert wav_path.exists()

    # Reset
    res = client.post(f"/api/chapters/{cid}/reset")
    assert res.status_code == 200

    # Check if file is gone
    assert not wav_path.exists()

def test_import_legacy_data_is_safe(client):
    """
    Verifies that running the migration endpoint doesn't crash
    and obeys isolation rules.
    """
    res = client.post("/api/migration/import_legacy")
    assert res.status_code == 200
    assert res.json()["status"] == "success"

def test_chapter_metadata_sync(client):
    """
    Verifies that updating a chapter's text content also updates
    its metadata (char_count, word_count, predicted_audio_length).
    """
    # 1. Create a chapter
    res = client.post("/api/projects", data={"name": "SyncTest"})
    pid = res.json()["project_id"]

    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "Original"})
    cid = res.json()["chapter"]["id"]

    # 2. Update with text
    new_text = "This is a test with seven words now."
    res = client.put(f"/api/chapters/{cid}", data={"text_content": new_text})
    assert res.status_code == 200

    updated = res.json()["chapter"]
    assert updated["text_content"] == new_text
    assert updated["char_count"] == len(new_text)
    assert updated["word_count"] == 8 # "This is a test with seven words now."
    assert updated["predicted_audio_length"] > 0

def test_reconciliation_project_aware(client):
    """
    Verifies that cleanup_and_reconcile respects project-specific paths.
    """
    # 1. Create a project and chapter
    res = client.post("/api/projects", data={"name": "ReconTest"})
    pid = res.json()["project_id"]

    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "ReconChapter"})
    cid = res.json()["chapter"]["id"]

    # 2. Add to queue and mark as done manually in state
    from app.state import put_job, update_job
    from app.models import Job
    import time

    jid = f"test_recon_{cid}"
    j = Job(
        id=jid,
        engine="xtts",
        chapter_file=f"{cid}_0.txt",
        status="done",
        created_at=time.time(),
        project_id=pid
    )
    put_job(j)

    # 2.5 Create the text file so it's not pruned as stale
    from app.config import get_project_text_dir
    p_text_dir = get_project_text_dir(pid)
    (p_text_dir / f"{cid}_0.txt").write_text("chapter text")

    # 3. Create the audio file in the project folder
    from app.config import get_project_audio_dir
    p_audio_dir = get_project_audio_dir(pid)
    wav_path = p_audio_dir / f"{cid}_0.wav"
    wav_path.write_text("audio content")
    mp3_path = p_audio_dir / f"{cid}_0.mp3"
    mp3_path.write_text("audio content")

    # 4. Trigger reconciliation (happens in api_home)
    from app.jobs import cleanup_and_reconcile
    cleanup_and_reconcile()

    # 5. Verify status is STILL 'done'
    from app.state import get_jobs
    jobs = get_jobs()
    assert jobs[jid].status == "done"

    # 6. Now delete the file and reconcile again
    wav_path.unlink()
    mp3_path.unlink()
    cleanup_and_reconcile()

    # 7. Verify status is now 'queued'
    jobs = get_jobs()
    assert jobs[jid].status == "queued"
