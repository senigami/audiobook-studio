import pytest
import os
import shutil
from pathlib import Path
from fastapi.testclient import TestClient
from app.web import app
from app.db.core import init_db
from app.db.projects import create_project
from app.db.chapters import create_chapter, update_chapter
from app import config

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_storage.db"
    os.environ["DB_PATH"] = str(db_path)

    # Override directories to use tmp_path
    # We must override both app.config and app.web because web.py has a middleware 
    # that syncs from its own local imports.
    test_projects_dir = tmp_path / "projects"
    test_projects_dir.mkdir(parents=True, exist_ok=True)

    config.PROJECTS_DIR = test_projects_dir
    from app import web
    web.PROJECTS_DIR = test_projects_dir

    init_db()
    yield tmp_path
    if db_path.exists():
        db_path.unlink()

def test_legacy_flat_storage_resolution(clean_db, client):
    """Verify that assets in legacy flat directories are still resolved correctly."""
    pid = create_project("LegacyProject")
    cid = create_chapter(pid, "Chapter1", "Legacy content")

    project_dir = config.get_project_dir(pid)
    audio_dir = project_dir / "audio"
    text_dir = project_dir / "text"
    audio_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)

    # Create legacy files
    legacy_audio = audio_dir / f"{cid}_0.wav"
    legacy_audio.write_bytes(b"RIFF_LEGACY")

    legacy_text = text_dir / f"{cid}_0.txt"
    legacy_text.write_text("Legacy Text File Content")

    # Verify via API asset endpoint
    response = client.get(f"/api/projects/{pid}/chapters/{cid}/assets/audio")
    assert response.status_code == 200
    assert response.content == b"RIFF_LEGACY"

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/assets/text")
    assert response.status_code == 200
    assert response.text == "Legacy Text File Content"

def test_nested_storage_resolution_priority(clean_db, client):
    """Verify that assets in the new nested directory take priority over legacy ones."""
    pid = create_project("HybridProject")
    cid = create_chapter(pid, "Chapter1", "Hybrid content")

    project_dir = config.get_project_dir(pid)

    # 1. Setup Legacy
    audio_dir = project_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    (audio_dir / f"{cid}_0.wav").write_bytes(b"RIFF_LEGACY")

    # 2. Setup Nested
    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    nested_audio = chapter_dir / "chapter.wav"
    nested_audio.write_bytes(b"RIFF_NESTED")

    # Verify nested takes priority
    response = client.get(f"/api/projects/{pid}/chapters/{cid}/assets/audio")
    assert response.status_code == 200
    assert response.content == b"RIFF_NESTED"

def test_explicit_filename_resolution(clean_db, client):
    """Verify that passing an explicit filename works for both layouts."""
    pid = create_project("ExplicitProject")
    cid = create_chapter(pid, "Chapter1", "Explicit content")

    project_dir = config.get_project_dir(pid)

    # Case A: Legacy file with custom name
    audio_dir = project_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    custom_legacy = audio_dir / "custom_legacy.wav"
    custom_legacy.write_bytes(b"RIFF_CUSTOM_LEGACY")

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/assets/audio?filename=custom_legacy.wav")
    assert response.status_code == 200
    assert response.content == b"RIFF_CUSTOM_LEGACY"

    # Case B: Nested file with custom name
    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    custom_nested = chapter_dir / "custom_nested.wav"
    custom_nested.write_bytes(b"RIFF_CUSTOM_NESTED")

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/assets/audio?filename=custom_nested.wav")
    assert response.status_code == 200
    assert response.content == b"RIFF_CUSTOM_NESTED"

def test_reconcile_supports_nested(clean_db):
    """Verify that the reconciliation logic finds nested files."""
    from app.db.reconcile import reconcile_project_audio
    from app.db.chapters import get_chapter

    pid = create_project("ReconcileProject")
    cid = create_chapter(pid, "Chapter1", "Reconcile content")

    # Mark as unprocessed initially
    assert get_chapter(cid)["audio_status"] == "unprocessed"

    # Create nested audio
    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    (chapter_dir / "chapter.wav").write_bytes(b"RIFF_NESTED")

    # Run reconciliation
    reconcile_project_audio(pid)

    # Verify it's now 'done'
    chapter = get_chapter(cid)
    assert chapter["audio_status"] == "done"
    assert chapter["audio_file_path"] == "chapter.wav"

def test_cleanup_supports_nested(clean_db):
    """Verify that cleanup removes files from both layouts."""
    from app.db.chapters import cleanup_chapter_audio_files

    pid = create_project("CleanupProject")
    cid = create_chapter(pid, "Chapter1", "Cleanup content")

    # 1. Setup Legacy
    legacy_audio = config.get_project_dir(pid) / "audio" / f"{cid}_0.wav"
    legacy_audio.parent.mkdir(parents=True, exist_ok=True)
    legacy_audio.write_bytes(b"RIFF")

    # 2. Setup Nested
    nested_audio = config.get_chapter_dir(pid, cid) / "chapter.wav"
    nested_audio.parent.mkdir(parents=True, exist_ok=True)
    nested_audio.write_bytes(b"RIFF")

    assert legacy_audio.exists()
    assert nested_audio.exists()

    # Run cleanup
    cleanup_chapter_audio_files(pid, cid)

    # Verify both are gone
    assert not legacy_audio.exists()
    assert not nested_audio.exists()

def test_trash_supports_nested(clean_db):
    """Verify that trash migration moves files from both layouts."""
    from app.db.chapters import move_chapter_artifacts_to_trash

    pid = create_project("TrashProject")
    cid = create_chapter(pid, "Chapter1", "Trash content")

    # 1. Setup Legacy
    legacy_audio = config.get_project_dir(pid) / "audio" / f"{cid}_0.wav"
    legacy_audio.parent.mkdir(parents=True, exist_ok=True)
    legacy_audio.write_bytes(b"RIFF_LEGACY")

    # 2. Setup Nested
    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    nested_audio = chapter_dir / "chapter.wav"
    nested_audio.write_bytes(b"RIFF_NESTED")

    # Run trash move
    move_chapter_artifacts_to_trash(pid, cid)

    # Verify sources are gone
    assert not legacy_audio.exists()
    assert not nested_audio.exists()

    # Verify trash has them
    trash_dir = config.get_project_trash_dir(pid) / cid / "audio"
    assert trash_dir.exists()

    # Since we moved two files with different names (in their respective roots), 
    # they should both be in the trash audio dir.
    trash_files = [f.name for f in trash_dir.iterdir()]
    assert f"{cid}_0.wav" in trash_files
    assert "chapter.wav" in trash_files
