import pytest
import os
from pathlib import Path
from fastapi.testclient import TestClient
from app.api.web import app
from app.db import create_project, create_chapter, get_chapter

client = TestClient(app)

def test_audio_synchronization_discovers_existing_files():
    """
    Verifies that loading the chapter list triggers a sync that discovers 
    audio files on disk even if the DB says they are 'unprocessed'.
    """
    # 1. Setup project and chapter
    pid = create_project("Sync Discovery Test")
    cid = create_chapter(project_id=pid, title="Sync Chapter")

    # Ensure it starts as unprocessed
    chap = get_chapter(cid)
    assert chap['audio_status'] == 'unprocessed'

    # 2. Manually place a mock audio file on disk in V2 nested location
    from app.core.config import get_chapter_dir
    chap_dir = get_chapter_dir(pid, cid)
    chap_dir.mkdir(parents=True, exist_ok=True)
    mock_file = chap_dir / "chapter.wav"
    mock_file.write_text("fake audio") # Not a real wav but enough for discovery

    try:
        # 3. Request the chapters list via API (this should trigger sync)
        response = client.get(f"/api/projects/{pid}/chapters")
        assert response.status_code == 200

        # 4. Verify chapter status is now 'done'
        chap_after = get_chapter(cid)
        assert chap_after['audio_status'] == 'done', "Chapter should have been synced to 'done'"

    finally:
        if mock_file.exists():
            mock_file.unlink()
