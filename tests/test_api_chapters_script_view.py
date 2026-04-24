import os
from pathlib import Path

import pytest

from app.db import create_project, create_chapter, get_chapter_segments, update_segment, create_character, sync_chapter_segments
from app.db.core import init_db


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app

    return TestClient(fastapi_app)


@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_chapters_script_view.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib

    importlib.reload(app.db.core)
    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)


def _assign_segment(segment_id: str, character_id: str, speaker_profile_name: str) -> None:
    update_segment(
        segment_id,
        character_id=character_id,
        speaker_profile_name=speaker_profile_name,
    )


def test_script_view_reconstructs_paragraphs(clean_db, client):
    pid = create_project("Script Project")
    # Paragraphs separated by \n\n
    text = "Para one sentence one. Para one sentence two.\n\nPara two sentence one."
    cid = create_chapter(pid, "Chapter 1", text)
    # sync_chapter_segments usually happens in create_chapter, but let's be explicit
    sync_chapter_segments(cid, text)

    response = client.get(f"/api/chapters/{cid}/script-view")
    assert response.status_code == 200
    data = response.json()

    assert data["chapter_id"] == cid
    assert data["base_revision_id"].startswith("rev_")
    assert len(data["paragraphs"]) == 2
    assert len(data["spans"]) == 3

    # Check span grouping in paragraphs
    p1 = data["paragraphs"][0]
    p2 = data["paragraphs"][1]
    assert p1["span_ids"] == [data["spans"][0]["id"], data["spans"][1]["id"]]
    assert p2["span_ids"] == [data["spans"][2]["id"]]

    # Check span content
    assert "Para one sentence one." in data["spans"][0]["text"]
    assert "Para two sentence one." in data["spans"][2]["text"]


def test_script_view_sanitized_fallback(clean_db, client):
    pid = create_project("P2")
    # Text with characters that should be cleaned (brackets)
    text = "Hello [world]."
    cid = create_chapter(pid, "C1", text)
    sync_chapter_segments(cid, text)

    response = client.get(f"/api/chapters/{cid}/script-view")
    assert response.status_code == 200
    data = response.json()

    span = data["spans"][0]
    assert span["text"] == "Hello [world]."
    # sanitized_text should have [ and ] removed by textops.sanitize_for_xtts
    assert "world" in span["sanitized_text"]
    assert "[" not in span["sanitized_text"]
    assert "]" not in span["sanitized_text"]


def test_script_view_render_batches_grouping_and_limit(clean_db, client, monkeypatch):
    pid = create_project("P3")
    # Text that would exceed a small limit if grouped
    text = "Short one. Short two. Short three."
    cid = create_chapter(pid, "C1", text)
    sync_chapter_segments(cid, text)

    char_id = create_character(pid, "Narrator", "Profile")
    segments = get_chapter_segments(cid)
    for s in segments:
        _assign_segment(s["id"], char_id, "Profile")

    # Mock a very small limit to force batch splitting
    import app.textops
    monkeypatch.setattr(app.textops, "SENT_CHAR_LIMIT", 15)

    response = client.get(f"/api/chapters/{cid}/script-view")
    data = response.json()

    # "Short one. " is 11 chars. "Short two. " is 11 chars. Total 22 > 15.
    # Should split into multiple batches.
    assert len(data["render_batches"]) > 1

    # Check that compatible adjacent spans are grouped when under limit
    monkeypatch.setattr(app.textops, "SENT_CHAR_LIMIT", 1000)
    response = client.get(f"/api/chapters/{cid}/script-view")
    data = response.json()
    assert len(data["render_batches"]) == 1
    all_segments = get_chapter_segments(cid)
    assert data["render_batches"][0]["span_ids"] == [s["id"] for s in all_segments]


def test_script_view_base_revision_id_stability(clean_db, client):
    pid = create_project("P4")
    cid = create_chapter(pid, "C1", "Sentence one. Sentence two.")

    resp1 = client.get(f"/api/chapters/{cid}/script-view").json()
    rev1 = resp1["base_revision_id"]

    # Assignments change rev
    segments = get_chapter_segments(cid)
    char_id = create_character(pid, "A", "P")
    _assign_segment(segments[0]["id"], char_id, "P")

    resp2 = client.get(f"/api/chapters/{cid}/script-view").json()
    rev2 = resp2["base_revision_id"]
    assert rev1 != rev2


def test_script_view_empty_chapter(clean_db, client):
    pid = create_project("P5")
    cid = create_chapter(pid, "Empty", "")

    response = client.get(f"/api/chapters/{cid}/script-view")
    assert response.status_code == 200
    data = response.json()
    assert data["paragraphs"] == []
    assert data["spans"] == []
    assert data["render_batches"] == []


def test_script_view_not_found(clean_db, client):
    response = client.get("/api/chapters/missing-cid/script-view")
    assert response.status_code == 404
