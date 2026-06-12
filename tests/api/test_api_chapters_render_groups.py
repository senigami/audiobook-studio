"""Tests for GET /projects/{project_id}/chapters/{chapter_id}/render_groups."""
import os
import pytest
from unittest.mock import patch
from app.db.core import init_db


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)


@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_render_groups.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()

    from app.db.state import update_settings
    update_settings({"default_speaker_profile": "DefaultVoice"})

    yield
    if os.path.exists(db_path):
        os.unlink(db_path)


def _make_project_and_chapter(client, title="TestProj", chapter_title="Ch1", text="Hello. World."):
    from app.db.projects import create_project
    pid = create_project(title)
    resp = client.post(f"/api/projects/{pid}/chapters", data={"title": chapter_title, "text_content": text})
    assert resp.status_code == 200
    cid = resp.json()["chapter"]["id"]
    return pid, cid


def test_render_groups_404_on_unknown_chapter(clean_db, client):
    """Should return 404 for a chapter_id that does not exist."""
    from app.db.projects import create_project
    pid = create_project("Proj")
    resp = client.get(f"/api/projects/{pid}/chapters/nonexistent-chapter-id/render_groups")
    assert resp.status_code == 404


def test_render_groups_partitions_all_segments(clean_db, client):
    """All segment ids must appear exactly once across all groups."""
    # Use a small text_chunk_limit to force multiple groups from consecutive segments.
    # Monkeypatch get_text_chunk_limit to a small number so short segments still split.
    pid, cid = _make_project_and_chapter(
        client,
        text="Alpha sentence here. Beta sentence here. Gamma sentence here."
    )

    # Sync to ensure we have ≥3 segments.
    sync_resp = client.post(
        f"/api/chapters/{cid}/sync-segments",
        json={"text": "Alpha sentence here. Beta sentence here. Gamma sentence here."}
    )
    assert sync_resp.status_code == 200

    segs_resp = client.get(f"/api/chapters/{cid}/segments")
    assert segs_resp.status_code == 200
    all_seg_ids = [s["id"] for s in segs_resp.json()["segments"] if s.get("text_content", "").strip()]

    # Patch limit to a tiny number to force multiple groups (each segment its own group).
    with patch("app.domain.chunk_groups.get_text_chunk_limit", return_value=5):
        resp = client.get(f"/api/projects/{pid}/chapters/{cid}/render_groups")

    assert resp.status_code == 200
    data = resp.json()

    assert "count" in data
    assert "groups" in data
    assert data["count"] == len(data["groups"])

    # All segment ids from non-empty segments must be accounted for, each exactly once.
    returned_ids = []
    for group in data["groups"]:
        returned_ids.extend(group["segment_ids"])

    assert set(returned_ids) == set(all_seg_ids), (
        f"Returned ids {set(returned_ids)} != expected {set(all_seg_ids)}"
    )
    assert len(returned_ids) == len(all_seg_ids), "Duplicate or missing segment ids"

    # Each group must have required keys.
    for i, group in enumerate(data["groups"]):
        assert group["index"] == i
        assert "engine" in group
        assert "char_count" in group
        assert isinstance(group["segment_ids"], list)
        assert len(group["segment_ids"]) > 0


def test_render_groups_packs_into_fewer_groups_than_segments(clean_db, client):
    """When limit is large, short segments pack into fewer groups than there are segments."""
    pid, cid = _make_project_and_chapter(
        client,
        text="Hi. Bye."
    )
    client.post(
        f"/api/chapters/{cid}/sync-segments",
        json={"text": "Hi. Bye."}
    )
    segs_resp = client.get(f"/api/chapters/{cid}/segments")
    all_seg_ids = [s["id"] for s in segs_resp.json()["segments"] if s.get("text_content", "").strip()]

    # Large limit: all segments should pack into one group.
    with patch("app.domain.chunk_groups.get_text_chunk_limit", return_value=100_000):
        resp = client.get(f"/api/projects/{pid}/chapters/{cid}/render_groups")

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] < len(all_seg_ids) or len(all_seg_ids) <= 1
    # All segments still accounted for.
    returned_ids = [sid for g in data["groups"] for sid in g["segment_ids"]]
    assert set(returned_ids) == set(all_seg_ids)
