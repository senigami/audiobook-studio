import pytest
import os
import io
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_chapters.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()
    # #232 Task 009: this fixture points DB_PATH at its own file and never ran
    # the versioned schema migrations (unlike the session-wide autouse
    # clean_storage fixture in conftest.py) -- start_offset/end_offset/text_hash
    # didn't exist here, silently exercising sync_chapter_segments' pre-#232
    # fallback path instead of the real render-block schema every other test
    # (and production) runs against.
    from app.core.boot import run_schema_migrations
    run_schema_migrations()

    from app.db.state import update_settings
    update_settings({"default_speaker_profile": "DefaultVoice"})

    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_chapter_list_and_create(clean_db, client):
    from app.db.projects import create_project
    pid = create_project("TestProj")

    response = client.post(f"/api/projects/{pid}/chapters", data={"title": "Chapter 1", "text_content": "Content"})
    assert response.status_code == 200
    cid = response.json()["chapter"]["id"]

    response = client.get(f"/api/projects/{pid}/chapters")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Chapter 1"

def test_get_chapter_rejects_mismatched_project_id(clean_db, client):
    """A chapter fetched with a project_id it doesn't belong to must 404,
    not silently return another project's chapter data."""
    from app.db.projects import create_project
    pid_a = create_project("ProjectA")
    pid_b = create_project("ProjectB")
    cid = client.post(
        f"/api/projects/{pid_a}/chapters", data={"title": "A1", "text_content": "Content"}
    ).json()["chapter"]["id"]

    # No project_id passed: unscoped lookup still works.
    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200

    # Correct project_id: still works.
    response = client.get(f"/api/chapters/{cid}", params={"project_id": pid_a})
    assert response.status_code == 200

    # Wrong project_id: must 404, not return project A's chapter.
    response = client.get(f"/api/chapters/{cid}", params={"project_id": pid_b})
    assert response.status_code == 404


def test_chapter_crud(clean_db, client):
    from app.db.projects import create_project
    pid = create_project("TestProj")
    cid = client.post(f"/api/projects/{pid}/chapters", data={"title": "C1", "text_content": "T1"}).json()["chapter"]["id"]

    # Get chapter
    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200
    assert response.json()["title"] == "C1"

    # Update chapter
    response = client.put(f"/api/chapters/{cid}", data={"title": "C1 Updated", "text_content": "T1 Updated"})
    assert response.status_code == 200

    response = client.put(f"/api/chapters/{cid}", data={"speaker_profile_name": "XTTS Voice"})
    assert response.status_code == 200
    assert response.json()["chapter"]["speaker_profile_name"] == "XTTS Voice"

    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200
    assert response.json()["speaker_profile_name"] == "XTTS Voice"

    response = client.put(f"/api/chapters/{cid}", data={"speaker_profile_name": "__USE_DEFAULT__"})
    assert response.status_code == 200
    assert response.json()["chapter"]["speaker_profile_name"] is None

    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200
    assert response.json()["speaker_profile_name"] is None

    # Delete chapter
    response = client.delete(f"/api/chapters/{cid}")
    assert response.status_code == 200

def test_chapter_segments_sync_and_update(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import get_chapter_segments
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")

    # Sync segments
    response = client.post(f"/api/chapters/{cid}/sync-segments", json={"text": "Hello. How are you?"})
    assert response.status_code == 200

    # List segments
    response = client.get(f"/api/chapters/{cid}/segments")
    assert response.status_code == 200
    segs = response.json()["segments"]
    assert len(segs) > 0
    sid = segs[0]["id"]

    # #232 Task 009: segment_order is a derived-on-write convenience column
    # now (ordering authority is start_offset, per 01-map.md) with zero
    # frontend readers -- the API stops serving it even though the DB column
    # itself stays (segment_order remains a real, populated column; this is
    # a payload-shape change, not a schema change).
    assert "segment_order" not in segs[0]
    assert "start_offset" in segs[0]

    # Update segment
    response = client.put(f"/api/segments/{sid}", json={"text_content": "Updated segment text"})
    assert response.status_code == 200
    assert get_chapter_segments(cid)[0]["text_content"] == "Updated segment text"

    # Reject unknown fields rather than passing them through as raw SQL column
    # names (app.api.routers.chapters.SEGMENT_UPDATE_ALLOWED_FIELDS)
    response = client.put(f"/api/segments/{sid}", json={"text_content": "x", "evil_column": "y"})
    assert response.status_code == 400
    assert "evil_column" in response.json()["detail"]
    # The allowed field must not have been applied either — the whole request is rejected
    assert get_chapter_segments(cid)[0]["text_content"] != "x"

    # Bulk status update without a backing file gets normalized back to
    # unprocessed when segments are reloaded from the DB/disk view.
    response = client.post(f"/api/chapters/{cid}/segments/bulk-status", json={"segment_ids": [sid], "status": "done"})
    assert response.status_code == 200
    assert get_chapter_segments(cid)[0]["audio_status"] == "unprocessed"

    # Bulk update
    response = client.post("/api/segments/bulk-update", json={"segment_ids": [sid], "updates": {"audio_status": "done"}})
    assert response.status_code == 200

    # Reject unknown fields on the bulk route too — same raw-SQL-column hazard
    # as PUT /segments/{id} (app.api.routers.chapters.SEGMENT_UPDATE_ALLOWED_FIELDS).
    # Uses speaker_profile_name (not audio_status) for the allowed-field assertion
    # below, since audio_status gets normalized back to "unprocessed" on read when
    # there's no backing audio file — that would mask whether the update landed.
    response = client.post(
        "/api/segments/bulk-update",
        json={"segment_ids": [sid], "updates": {"speaker_profile_name": "evil-profile", "evil_column": "x"}},
    )
    assert response.status_code == 400
    assert "evil_column" in response.json()["detail"]
    # The allowed field must not have been applied either — the whole request is rejected
    assert get_chapter_segments(cid)[0]["speaker_profile_name"] != "evil-profile"

def test_chapter_cancel_and_reset(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    # Cancel
    response = client.post(f"/api/chapters/{cid}/cancel")
    assert response.status_code == 200

    # Reset
    response = client.post(f"/api/chapters/{cid}/reset")
    assert response.status_code == 200

def test_export_and_stream(clean_db, tmp_path, client):
    from app.core import config
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    # Create a dummy wav
    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    wav_file = chapter_dir / "chapter.wav"
    wav_file.write_bytes(b"RIFF...")

    # Stream
    response = client.get(f"/api/chapters/{cid}/stream")
    assert response.status_code == 200

    # Export sample
    response = client.post(f"/api/chapters/{cid}/export-sample")
    assert response.status_code == 200
    expected_url = f"/api/projects/{pid}/chapters/{cid}/assets/audio"
    assert response.json()["url"].startswith(expected_url)



def test_chapter_asset_route_rejects_path_traversal(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    for asset_type in ("audio", "segment"):
        response = client.get(
            f"/api/projects/{pid}/chapters/{cid}/assets/{asset_type}",
            params={"filename": "../../etc/passwd"},
        )

        assert response.status_code == 404


def test_chapter_update_surfaces_lost_assignments_count(clean_db, client):
    """RC-1 fix, Task 6 API-level test: an ordinary PUT /chapters/{id} text save that
    actually destroys a manual assignment surfaces the count in the JSON response, and
    a save that preserves everything surfaces 0 -- not just the explicit resync route's
    preview."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.characters import create_character
    from app.db import update_segment

    pid = create_project("PLA1")
    cid = create_chapter(pid, "CLA1", "First sentence. Second sentence.")
    sync_chapter_segments(cid, "First sentence. Second sentence.")
    segs = get_chapter_segments(cid)
    second_id = segs[1]["id"]

    villain = create_character(pid, "Villain")
    update_segment(second_id, character_id=villain)

    # A genuine edit to the assigned sentence: real loss.
    response = client.put(
        f"/api/chapters/{cid}",
        data={"text_content": "First sentence. Completely different text."},
    )
    assert response.status_code == 200
    assert response.json()["lost_assignments_count"] == 1

    # A clean save (identical text) reports zero.
    response2 = client.put(
        f"/api/chapters/{cid}",
        data={"text_content": "First sentence. Completely different text."},
    )
    assert response2.status_code == 200
    assert response2.json()["lost_assignments_count"] == 0


def test_sync_segments_route_surfaces_lost_assignments_count(clean_db, client):
    """Same guarantee for the explicit /sync-segments route."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.characters import create_character
    from app.db import update_segment

    pid = create_project("PLA2")
    cid = create_chapter(pid, "CLA2", "One. Two.")
    sync_chapter_segments(cid, "One. Two.")
    segs = get_chapter_segments(cid)
    second_id = segs[1]["id"]

    hero = create_character(pid, "Hero")
    update_segment(second_id, character_id=hero)

    response = client.post(f"/api/chapters/{cid}/sync-segments", json={"text": "One. Different."})
    assert response.status_code == 200
    assert response.json()["lost_assignments_count"] == 1
