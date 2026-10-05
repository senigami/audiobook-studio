import pytest

# NOTE: Do NOT import TestClient or app at the top level.
# Doing so can trigger module loading before conftest.py env vars are set.

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app
    return TestClient(app)

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
    from app.core.config import get_chapter_dir
    c_dir = get_chapter_dir(pid, cid)
    wav_path = c_dir / "chapter.wav"
    wav_path.write_text("fake audio data")

    # 3. Call the export endpoint with project_id
    res = client.post(f"/api/chapters/{cid}/export-sample?project_id={pid}")

    # The nested chapter.wav we wrote is discoverable via the standard-name
    # fallback in resolve_chapter_asset_path, so this must succeed with a
    # URL pointing at the project-scoped asset route -- not a vague
    # "200 or 500" outcome.
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["url"] == f"/api/projects/{pid}/chapters/{cid}/assets/audio"

def test_reset_chapter_isolation(client):
    """
    Verifies that resetting a chapter clears files inside its OWN
    project-specific directory only -- and, despite the identical
    "chapter.wav" filename, does NOT touch a second project's chapter audio
    (real cross-project isolation, not just "does reset delete its target").
    """
    from app.core.config import get_chapter_dir
    from app.db import update_chapter

    res = client.post("/api/projects", data={"name": "ResetTarget"})
    pid = res.json()["project_id"]
    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "ToReset"})
    cid = res.json()["chapter"]["id"]

    c_dir = get_chapter_dir(pid, cid)
    wav_path = c_dir / "chapter.wav"
    wav_path.write_text("data")
    update_chapter(cid, audio_file_path="chapter.wav")
    assert wav_path.exists()

    # A second, unrelated project with an identically-named chapter.wav.
    res = client.post("/api/projects", data={"name": "OtherProject"})
    other_pid = res.json()["project_id"]
    res = client.post(f"/api/projects/{other_pid}/chapters", data={"title": "Untouched"})
    other_cid = res.json()["chapter"]["id"]

    other_dir = get_chapter_dir(other_pid, other_cid)
    other_wav_path = other_dir / "chapter.wav"
    other_wav_path.write_text("other project's data")
    update_chapter(other_cid, audio_file_path="chapter.wav")
    assert other_wav_path.exists()

    # Reset only the first project's chapter.
    res = client.post(f"/api/chapters/{cid}/reset")
    assert res.status_code == 200

    # The target chapter's audio is gone...
    assert not wav_path.exists()
    # ...but the other project's identically-named file is untouched.
    assert other_wav_path.exists()
    assert other_wav_path.read_text() == "other project's data"

def test_import_legacy_data_is_safe(client):
    """
    Verifies that running the migration endpoint actually reads a legacy
    state.json's jobs and materializes them as a project + chapter row,
    not just a no-crash smoke test on an empty directory.
    """
    import json
    from app.core.config import BASE_DIR
    from app.db.core import get_connection
    from app.db.projects import list_projects

    # migrate_state_json_to_db() only imports jobs when the projects table is
    # currently empty; force that precondition since the DB is shared across
    # tests in this session.
    with get_connection() as conn:
        conn.execute("DELETE FROM chapters")
        conn.execute("DELETE FROM projects")
        conn.commit()

    state_file = BASE_DIR / "state.json"
    state_file.write_text(json.dumps({
        "jobs": {
            "legacy-job-1": {
                "status": "done",
                "custom_title": "Legacy Chapter One",
                "output_wav": "legacy-job-1.wav",
            }
        }
    }))

    try:
        res = client.post("/api/migration/import_legacy")
        assert res.status_code == 200
        assert res.json()["status"] == "success"

        projects = list_projects()
        assert len(projects) == 1
        assert projects[0]["name"] == "Imported Project"
        assert projects[0]["series"] == "Legacy Data"

        with get_connection() as conn:
            rows = conn.execute(
                "SELECT title, audio_status, audio_file_path FROM chapters"
            ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "Legacy Chapter One"
        assert rows[0][1] == "done"
        assert rows[0][2] == "legacy-job-1.wav"
    finally:
        state_file.unlink(missing_ok=True)

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
    from app.db.state import put_job, update_job
    from app.db.models import Job
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
    from app.core.config import get_chapter_dir
    c_dir = get_chapter_dir(pid, cid)
    c_dir.mkdir(parents=True, exist_ok=True)
    (c_dir / "chapter.txt").write_text("chapter text")

    # 3. Create the audio file in the nested folder
    wav_path = c_dir / "chapter.wav"
    wav_path.write_text("audio content")
    mp3_path = c_dir / "chapter.mp3"
    mp3_path.write_text("audio content")

    # 4. Trigger reconciliation via DB helper
    from app.db.reconcile import reconcile_project_audio
    reconcile_project_audio(pid)

    # 5. Verify status is STILL 'done'
    from app.db.chapters import get_chapter
    chapter = get_chapter(cid)
    assert chapter["audio_status"] == "done"

    # 6. Now delete the file and reconcile again
    wav_path.unlink()
    mp3_path.unlink()

    reconcile_project_audio(pid)

    # 7. Verify status is now 'unprocessed'
    chapter = get_chapter(cid)
    assert chapter["audio_status"] == "unprocessed"
