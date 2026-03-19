import pytest
from fastapi.testclient import TestClient
from app.web import app
from app.db import get_connection

client = TestClient(app)

@pytest.fixture
def test_project():
    # Setup
    res = client.post("/api/projects", data={"name": "UX Test Project"})
    pid = res.json()["project_id"]

    # Create chapter
    res = client.post(f"/api/projects/{pid}/chapters", data={
        "title": "UX Chapter", 
        "text_content": "Section one. Section two. Section three."
    })
    cid = res.json()["chapter"]["id"]
    yield pid, cid
    # Teardown
    client.delete(f"/api/projects/{pid}")

def test_update_segment_profile_name(test_project):
    pid, cid = test_project

    # 1. Fetch segments
    res = client.get(f"/api/chapters/{cid}/segments")
    segments = res.json()["segments"]
    sid = segments[0]["id"]

    # 2. Update single segment with profile name
    res = client.put(f"/api/segments/{sid}", data={
        "speaker_profile_name": "Sally - Happy"
    })
    assert res.status_code == 200

    # 3. Verify update
    res = client.get(f"/api/chapters/{cid}/segments")
    updated_segments = res.json()["segments"]
    assert updated_segments[0]["speaker_profile_name"] == "Sally - Happy"

def test_bulk_update_profile_name(test_project):
    pid, cid = test_project

    # 1. Fetch segments
    res = client.get(f"/api/chapters/{cid}/segments")
    segments = res.json()["segments"]
    sids = [s["id"] for s in segments]

    # 2. Bulk update segments with character and profile name
    res = client.post("/api/segments/bulk-update", json={
        "segment_ids": sids,
        "updates": {
            "character_id": "char-123",
            "speaker_profile_name": "Sally - Excited",
        },
    })
    assert res.status_code == 200

    # 3. Verify bulk update
    res = client.get(f"/api/chapters/{cid}/segments")
    updated_segments = res.json()["segments"]
    for s in updated_segments:
        assert s["character_id"] == "char-123"
        assert s["speaker_profile_name"] == "Sally - Excited"

def test_clear_profile_name(test_project):
    pid, cid = test_project

    # 1. Set a profile name first
    res = client.get(f"/api/chapters/{cid}/segments")
    sid = res.json()["segments"][0]["id"]
    client.put(f"/api/segments/{sid}", data={"speaker_profile_name": "Stale Voice"})

    # 2. Clear it
    res = client.put(f"/api/segments/{sid}", data={"speaker_profile_name": ""})
    assert res.status_code == 200

    # 3. Verify cleared
    res = client.get(f"/api/chapters/{cid}/segments")
    assert res.json()["segments"][0]["speaker_profile_name"] is None
