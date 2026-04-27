import os
import shutil
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from app.db.core import init_db
from app.db.projects import create_project
from app.db.chapters import create_chapter, get_chapter
from app.db.segments import get_chapter_segments
from app.db.core import get_connection
from app.config import get_project_dir, get_project_audio_dir, get_project_text_dir, resolve_chapter_asset_path, get_chapter_dir
from app.domain.projects.migration import migrate_project_to_v2
from app.domain.projects.manifest import load_project_manifest

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_storage.db"
    os.environ["DB_PATH"] = str(db_path)
    init_db()

    # Mock projects root to tmp_path
    with patch("app.config.XTTS_OUT_DIR", tmp_path / "xtts_out"), \
         patch("app.config.PROJECTS_DIR", tmp_path / "projects"):
        (tmp_path / "projects").mkdir()
        yield tmp_path

def test_migration_v1_to_v2(clean_db):
    tmp_root = clean_db
    # Create project with metadata
    from app.db.projects import update_project
    pid = create_project("Legacy Project")
    update_project(pid, author="Test Author", series="Test Series")
    project_dir = get_project_dir(pid)

    # Create legacy structure
    audio_dir = get_project_audio_dir(pid)
    text_dir = get_project_text_dir(pid)
    audio_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)

    cid = create_chapter(pid, "Chapter 1", "Hello world.")

    # Create legacy files
    (audio_dir / f"{cid}.wav").write_text("audio data")
    (text_dir / f"{cid}.txt").write_text("text data")

    segments = get_chapter_segments(cid)
    sid = segments[0]["id"]
    (audio_dir / f"chunk_{sid}.wav").write_text("segment data")

    # RUN MIGRATION
    success = migrate_project_to_v2(pid)
    assert success is True

    # Verify manifest and enriched metadata
    manifest = load_project_manifest(project_dir)
    assert manifest["version"] == 2
    assert manifest["title"] == "Legacy Project"
    assert manifest["author"] == "Test Author"
    assert manifest["series"] == "Test Series"
    assert "created_at" in manifest

    # Verify files moved
    nested_dir = get_chapter_dir(pid, cid)
    assert (nested_dir / "chapter.wav").exists()
    assert (nested_dir / "chapter.txt").exists()
    assert (nested_dir / "segments" / "seg_0.wav").exists()
    with get_connection() as conn:
        migrated_segment = conn.execute(
            "SELECT audio_file_path FROM chapter_segments WHERE id = ?",
            (sid,),
        ).fetchone()
    assert migrated_segment["audio_file_path"] == "seg_0.wav"

    # Verify legacy files ARE REMOVED
    assert not (audio_dir / f"{cid}.wav").exists()
    assert not (text_dir / f"{cid}.txt").exists()
    assert not (audio_dir / f"chunk_{sid}.wav").exists()

    # Verify legacy directories ARE REMOVED (Hardening Cleanup)
    assert not audio_dir.exists()
    assert not text_dir.exists()

    # Verify resolution still works (points to new location)
    asset_path = resolve_chapter_asset_path(pid, cid, "audio")
    assert asset_path.exists()
    assert str(asset_path).endswith("chapter.wav")


def test_migration_skips_unsafe_segment_audio_id(clean_db):
    pid = create_project("Unsafe Segment Project")
    cid = create_chapter(pid, "Chapter 1", "Hello world.")

    audio_dir = get_project_audio_dir(pid)
    text_dir = get_project_text_dir(pid)
    audio_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)

    unsafe_sid = "../escape"
    with patch("app.db.segments.get_chapter_segments", return_value=[{"id": unsafe_sid}]):
        (audio_dir / "chunk_..").mkdir()
        (audio_dir / "chunk_.." / "escape.wav").write_text("segment data")

        success = migrate_project_to_v2(pid)

    nested_dir = get_chapter_dir(pid, cid)
    assert success is True
    assert not (nested_dir / "escape.wav").exists()
    assert not (nested_dir / "segments" / "escape.wav").exists()


def test_idempotent_migration(clean_db):
    pid = create_project("Idempotent Project")
    project_dir = get_project_dir(pid)

    # Migrate once
    migrate_project_to_v2(pid)
    manifest = load_project_manifest(project_dir)
    assert manifest["version"] == 2

    # Migrate again
    success = migrate_project_to_v2(pid)
    assert success is True
    assert load_project_manifest(project_dir)["version"] == 2

def test_new_project_is_v2_compatible(clean_db):
    # Actually, create_project currently doesn't write project.json.
    # Migration is triggered on first access.
    pid = create_project("New Project")

    # Trigger migration via helper (simulating API access)
    migrate_project_to_v2(pid)

    # Create chapter in v2 world
    cid = create_chapter(pid, "New Chapter", "Content")
    nested_dir = get_chapter_dir(pid, cid)

    # Verify nested dir was created by create_chapter (Milestone 3)
    assert nested_dir.exists()
    assert (nested_dir / "segments").exists()

def test_voice_v2_migration(tmp_path):
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()

    # Create legacy flat folder
    legacy_dir = voices_dir / "Dracula - Angry"
    legacy_dir.mkdir()
    (legacy_dir / "profile.json").write_text(json.dumps({
        "speaker_id": "dracula-uuid",
        "variant_name": "Angry",
        "engine": "xtts"
    }))
    (legacy_dir / "sample.wav").write_text("audio")

    from app.domain.voices.migration import migrate_voices_to_v2
    with patch("app.domain.voices.migration.VOICES_DIR", voices_dir):
        success = migrate_voices_to_v2()
        assert success is True

        # Verify nested structure
        voice_root = voices_dir / "Dracula"
        variant_dir = voice_root / "Angry"

        assert voice_root.exists()
        assert (voice_root / "voice.json").exists()
        assert variant_dir.exists()
        assert (variant_dir / "profile.json").exists()
        assert (variant_dir / "sample.wav").exists()

        # Verify legacy folder is gone
        assert not legacy_dir.exists()

        # Verify voice manifest content
        from app.domain.voices.manifest import load_voice_manifest
        v_manifest = load_voice_manifest(voice_root)
        assert v_manifest["version"] == 2
        assert v_manifest["id"] == "dracula-uuid"
        assert v_manifest["name"] == "Dracula"


def test_voice_v2_migration_root_default_profile(tmp_path):
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()

    legacy_dir = voices_dir / "Test"
    legacy_dir.mkdir()
    (legacy_dir / "profile.json").write_text(json.dumps({
        "speaker_id": "voxtral-uuid",
        "variant_name": "Vox",
        "engine": "voxtral",
    }))
    (legacy_dir / "latent.pth").write_text("latent")
    (legacy_dir / "sample.wav").write_text("sample")
    (legacy_dir / "1.wav").write_text("sample-a")

    from app.domain.voices.migration import migrate_voices_to_v2
    with patch("app.domain.voices.migration.VOICES_DIR", voices_dir):
        success = migrate_voices_to_v2()
        assert success is True

        voice_root = voices_dir / "Test"
        variant_dir = voice_root / "Default"

        assert voice_root.exists()
        assert (voice_root / "voice.json").exists()
        assert variant_dir.exists()
        assert (variant_dir / "profile.json").exists()
        assert (variant_dir / "latent.pth").exists()
        assert (variant_dir / "sample.wav").exists()
        assert (variant_dir / "1.wav").exists()
        assert not (voice_root / "latent.pth").exists()
        assert not (voice_root / "sample.wav").exists()

        from app.domain.voices.manifest import load_voice_manifest
        v_manifest = load_voice_manifest(voice_root)
        assert v_manifest["version"] == 2
        assert v_manifest["id"] == "voxtral-uuid"
        assert v_manifest["name"] == "Test"
        assert v_manifest["default_variant"] == "Default"

def test_voice_v2_backfill(tmp_path):
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()

    # Create a partially valid v2 root
    voice_root = voices_dir / "Partial"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({
        "version": 2
        # Missing name, id, default_variant
    }))

    variant_dir = voice_root / "Default"
    variant_dir.mkdir()
    (variant_dir / "profile.json").write_text(json.dumps({
        "speaker_id": "partial-uuid",
        "variant_name": "Default"
    }))

    from app.domain.voices.migration import migrate_voices_to_v2
    with patch("app.domain.voices.migration.VOICES_DIR", voices_dir):
        success = migrate_voices_to_v2()
        assert success is True

        from app.domain.voices.manifest import load_voice_manifest
        manifest = load_voice_manifest(voice_root)
        assert manifest["name"] == "Partial"
        assert manifest["id"] == "partial-uuid"
        assert manifest["default_variant"] == "Default"

def test_project_v2_enrichment_backfill(clean_db):
    pid = create_project("Partial Project")
    project_dir = get_project_dir(pid)

    # Create a v2 manifest missing metadata
    from app.domain.projects.manifest import save_project_manifest
    save_project_manifest(project_dir, {"version": 2})

    # Ensure DB has metadata
    from app.db.projects import update_project
    update_project(pid, author="Backfill Author", series="Backfill Series")

    success = migrate_project_to_v2(pid)
    assert success is True

    manifest = load_project_manifest(project_dir)
    assert manifest["version"] == 2
    assert manifest["author"] == "Backfill Author"
    assert manifest["series"] == "Backfill Series"
