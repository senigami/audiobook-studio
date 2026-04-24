import pytest
from fastapi.testclient import TestClient
from app.web import app
from app.db import create_project, create_chapter, update_chapter, get_chapter
import json
import os
from pathlib import Path

client = TestClient(app)

def test_reorder_chapters_logic():
    pid = create_project("Reorder Test")
    cid1 = create_chapter(pid, "C1", "Text 1", sort_order=0)
    cid2 = create_chapter(pid, "C2", "Text 2", sort_order=1)

    # Reorder
    res = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": json.dumps([cid2, cid1])})
    assert res.status_code == 200

    # Verify
    chaps = client.get(f"/api/projects/{pid}/chapters").json()
    assert chaps[0]["id"] == cid2
    assert chaps[1]["id"] == cid1

def test_export_sample_404():
    # Test 404 case for non-existent audio
    pid = create_project("Export Test")
    cid = create_chapter(pid, "C1", "Some text")

    res = client.post(f"/api/chapters/{cid}/export-sample?project_id={pid}")
    assert res.status_code == 404
    assert "Audio not found" in res.json()["message"]

def test_chapter_update_only_title():
    pid = create_project("Title Update Test")
    cid = create_chapter(pid, "Old Title", "Same text")
    original = get_chapter(cid)
    original_mod = original['text_last_modified']

    import time
    time.sleep(0.01)

    # Update only title
    res = client.put(f"/api/chapters/{cid}", data={"title": "New Title"})
    assert res.status_code == 200

    updated = get_chapter(cid)
    assert updated['title'] == "New Title"
    assert updated['text_last_modified'] == original_mod

def test_chapter_update_text():
    pid = create_project("Text Update Test")
    cid = create_chapter(pid, "Same Title", "Old text")
    original = get_chapter(cid)
    original_mod = original['text_last_modified']

    import time
    time.sleep(0.01)

    # Update text
    res = client.put(f"/api/chapters/{cid}", data={"text_content": "New text"})
    assert res.status_code == 200

    updated = get_chapter(cid)
    assert updated['text_content'] == "New text"
    assert updated['text_last_modified'] > original_mod
