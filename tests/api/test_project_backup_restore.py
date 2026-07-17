"""Tests for POST /api/projects/{project_id}/backups/{filename}/restore
(synced_reader plan, Task 6b).

Mirrors tests/domain/test_project_backup_bundle.py's fixture conventions
(clean_db + TestClient). Per R2 (mock boundaries only), no mocking is
needed: the route only reads a ZIP already sitting in the project's
backups/ dir and writes real files + DB rows, so tests exercise real
files, real DB, and the real /timing serving route (Task 5) end-to-end.

Security tests hand-craft malicious backup archives directly (bypassing the
normal save flow) to prove the restore endpoint never extracts to disk and
never lets an arcname string influence the destination path.
"""
import json
import os
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.api.web import app
from app.db.core import init_db
from app.db.projects import create_project
from app.db.chapters import create_chapter, update_chapter, delete_chapter
from app.core.config import get_chapter_dir
from app.domain.chapters.timing import (
    SCHEMA_DISCRIMINATOR,
    SCHEMA_VERSION,
    validate_timing_sidecar,
)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def clean_db():
    db_path = "/tmp/test_project_backup_restore.db"
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


def _valid_timing_sidecar(chapter_id: str, audio_generated_at: float, audio_duration_ms: int = 1000) -> dict:
    return {
        "schema": SCHEMA_DISCRIMINATOR,
        "version": SCHEMA_VERSION,
        "chapter_id": chapter_id,
        "audio_file": "chapter.wav",
        "audio_generated_at": audio_generated_at,
        "audio_duration_ms": audio_duration_ms,
        "generated_at": audio_generated_at + 1.0,
        "group_count": 1,
        "groups": [
            {
                "group_id": "seg-1",
                "segment_ids": ["seg-1"],
                "order": 0,
                "start_ms": 0,
                "end_ms": audio_duration_ms,
                "duration_ms": audio_duration_ms,
            }
        ],
    }


def _make_chapter_with_audio(pid, title="Chapter 1", text="Content", audio_generated_at=1000.0, include_timing=True):
    cid = create_chapter(pid, title, text)
    chapter_dir = get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    wav_path = chapter_dir / "chapter.wav"
    wav_path.write_bytes(b"RIFF....fake wav data")
    update_chapter(cid, audio_status="done", audio_file_path="chapter.wav", audio_generated_at=audio_generated_at)

    if include_timing:
        sidecar = _valid_timing_sidecar(cid, audio_generated_at)
        (chapter_dir / "chapter.timing.json").write_text(json.dumps(sidecar))

    return cid, chapter_dir


def _write_hand_crafted_backup(backups_dir, filename, bundle_json, extra_members=None):
    backups_dir.mkdir(parents=True, exist_ok=True)
    path = backups_dir / filename
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("bundle.json", json.dumps(bundle_json))
        for arcname, data in (extra_members or {}).items():
            zf.writestr(arcname, data)
    return path


# --- Case 1: core portability requirement ----------------------------------

def test_restore_core_portability_wav_and_timing_survive_without_segment_wavs(clean_db, client):
    pid = create_project("Restore Project")
    cid, chapter_dir = _make_chapter_with_audio(pid, audio_generated_at=1000.0)

    # Precondition: no segment-level WAVs exist (backups never include them
    # anyway) -- this proves restore is entirely self-sufficient from the
    # chapter-level WAV + timing sidecar alone.
    segments_dir = chapter_dir / "segments"
    for f in segments_dir.glob("*.wav"):
        f.unlink()
    assert not any(segments_dir.glob("*.wav"))

    save_response = client.post(f"/api/projects/{pid}/backup-bundle/save")
    assert save_response.status_code == 200
    filename = save_response.json()["filename"]

    # Simulate catastrophic loss of the rendered chapter audio + sidecar --
    # only the DB row and the saved backup ZIP survive.
    wav_path = chapter_dir / "chapter.wav"
    timing_path = chapter_dir / "chapter.timing.json"
    wav_path.unlink()
    timing_path.unlink()
    assert not wav_path.exists()
    assert not timing_path.exists()

    response = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["restored_chapter_ids"] == [cid]
    assert body["skipped_chapter_ids"] == []

    assert wav_path.exists()
    assert wav_path.read_bytes() == b"RIFF....fake wav data"
    assert timing_path.exists()
    validate_timing_sidecar(json.loads(timing_path.read_text()))

    timing_response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")
    assert timing_response.status_code == 200


# --- Case 2: WAV without a timing sidecar -----------------------------------

def test_restore_wav_without_timing_sidecar(clean_db, client):
    pid = create_project("No Timing Restore")
    cid, chapter_dir = _make_chapter_with_audio(pid, include_timing=False)

    save_response = client.post(f"/api/projects/{pid}/backup-bundle/save")
    assert save_response.status_code == 200
    filename = save_response.json()["filename"]

    wav_path = chapter_dir / "chapter.wav"
    wav_path.unlink()

    response = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert response.status_code == 200
    body = response.json()
    assert body["restored_chapter_ids"] == [cid]
    assert body["skipped_chapter_ids"] == []

    assert wav_path.exists()
    assert wav_path.read_bytes() == b"RIFF....fake wav data"
    assert not (chapter_dir / "chapter.timing.json").exists()


# --- Case 3: chapter deleted after the backup was made ----------------------

def test_restore_skips_chapter_deleted_after_backup(clean_db, client):
    pid = create_project("Deleted Chapter Restore")
    cid, chapter_dir = _make_chapter_with_audio(pid)

    save_response = client.post(f"/api/projects/{pid}/backup-bundle/save")
    assert save_response.status_code == 200
    filename = save_response.json()["filename"]

    delete_chapter(cid)

    response = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert response.status_code == 200
    body = response.json()
    assert body["restored_chapter_ids"] == []
    assert body["skipped_chapter_ids"] == [cid]


# --- Case 4: corrupted/invalid timing sidecar inside the archive ------------

def test_restore_invalid_timing_sidecar_skips_timing_but_restores_wav(clean_db, client):
    pid = create_project("Invalid Timing Restore")
    cid, chapter_dir = _make_chapter_with_audio(pid, audio_generated_at=1000.0, include_timing=False)

    invalid_sidecar = _valid_timing_sidecar(cid, 1000.0)
    invalid_sidecar["version"] = SCHEMA_VERSION + 1  # wrong version -> validate_timing_sidecar rejects
    (chapter_dir / "chapter.timing.json").write_text(json.dumps(invalid_sidecar))

    save_response = client.post(f"/api/projects/{pid}/backup-bundle/save")
    assert save_response.status_code == 200
    filename = save_response.json()["filename"]

    wav_path = chapter_dir / "chapter.wav"
    timing_path = chapter_dir / "chapter.timing.json"
    wav_path.unlink()
    timing_path.unlink()

    response = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert response.status_code == 200
    body = response.json()
    assert body["restored_chapter_ids"] == [cid]
    assert body["skipped_chapter_ids"] == []

    assert wav_path.exists()
    assert not timing_path.exists()

    timing_response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")
    assert timing_response.status_code == 404


# --- Case 5: security -- arcname not actually present / traversal smuggling -

def test_restore_missing_arcname_referenced_by_chapter_map_is_skipped_not_500(clean_db, client):
    pid = create_project("Security Restore Missing Member")
    cid, chapter_dir = _make_chapter_with_audio(pid, include_timing=False)

    from app.storage.manager import get_storage_manager
    ctx = get_storage_manager().get_project_context(pid)
    backups_dir = ctx.root / "backups"

    malicious_filename = "malicious_missing_member.zip"
    bundle_json = {
        "project_id": pid,
        "bundle_name": malicious_filename,
        "bundle_version": 1,
        "chapter_map": {
            cid: {
                "title": "Chapter 1",
                "order": 1,
                "text_path": "chapters/01_Chapter_1.txt",
                # This arcname is never actually written into the zip below --
                # a forged chapter_map cannot conjure a real archive member.
                "audio_path": "../../../../escaped_marker.txt",
            }
        },
    }
    _write_hand_crafted_backup(backups_dir, malicious_filename, bundle_json)

    response = client.post(f"/api/projects/{pid}/backups/{malicious_filename}/restore")
    assert response.status_code == 200
    body = response.json()
    assert body["restored_chapter_ids"] == []
    assert body["skipped_chapter_ids"] == [cid]

    # Nothing was written outside the project tree, and the chapter's real
    # WAV (still present from setup) was left untouched.
    escaped_marker = chapter_dir.parent.parent.parent.parent / "escaped_marker.txt"
    assert not escaped_marker.exists()
    assert (chapter_dir / "chapter.wav").read_bytes() == b"RIFF....fake wav data"


def test_restore_arcname_content_never_escapes_chapter_dir_even_when_member_exists(clean_db, client):
    pid = create_project("Security Restore Present Member")
    cid, chapter_dir = _make_chapter_with_audio(pid, include_timing=False)

    from app.storage.manager import get_storage_manager
    ctx = get_storage_manager().get_project_context(pid)
    backups_dir = ctx.root / "backups"

    malicious_filename = "malicious_present_member.zip"
    weird_arcname = "../../../../tmp/should_never_land_here.wav"
    bundle_json = {
        "project_id": pid,
        "bundle_name": malicious_filename,
        "bundle_version": 1,
        "chapter_map": {
            cid: {
                "title": "Chapter 1",
                "order": 1,
                "text_path": "chapters/01_Chapter_1.txt",
                "audio_path": weird_arcname,
            }
        },
    }
    # This time the traversal-named member genuinely exists in the zip --
    # proving the endpoint still never writes outside the chapter dir
    # because it only ever reads bytes (zf.read), never extracts, and the
    # destination path is built purely from trusted project_id/chapter_id.
    _write_hand_crafted_backup(backups_dir, malicious_filename, bundle_json, extra_members={weird_arcname: b"malicious payload bytes"})

    response = client.post(f"/api/projects/{pid}/backups/{malicious_filename}/restore")
    assert response.status_code == 200
    body = response.json()
    assert body["restored_chapter_ids"] == [cid]
    assert body["skipped_chapter_ids"] == []

    wav_path = chapter_dir / "chapter.wav"
    assert wav_path.read_bytes() == b"malicious payload bytes"
    assert not os.path.exists("/tmp/should_never_land_here.wav")


# --- Case 6: restoring the same backup twice is idempotent-ish --------------

def test_restore_twice_is_idempotent(clean_db, client):
    pid = create_project("Idempotent Restore")
    cid, chapter_dir = _make_chapter_with_audio(pid)

    save_response = client.post(f"/api/projects/{pid}/backup-bundle/save")
    assert save_response.status_code == 200
    filename = save_response.json()["filename"]

    wav_path = chapter_dir / "chapter.wav"
    timing_path = chapter_dir / "chapter.timing.json"
    wav_path.unlink()
    timing_path.unlink()

    first = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert first.status_code == 200
    first_body = first.json()
    assert first_body["restored_chapter_ids"] == [cid]
    first_wav_bytes = wav_path.read_bytes()

    second = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert second.status_code == 200
    second_body = second.json()
    assert second_body["restored_chapter_ids"] == [cid]

    assert wav_path.read_bytes() == first_wav_bytes
    assert len(list(chapter_dir.glob("chapter*.wav"))) == 1
    assert len(list(chapter_dir.glob("chapter*.timing.json"))) == 1

    timing_response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")
    assert timing_response.status_code == 200


# --- Case 7: bundle_version is validated at load (owner directive) ---------

def test_restore_rejects_unsupported_bundle_version(clean_db, client):
    pid = create_project("Unsupported Bundle Version Restore")
    cid, chapter_dir = _make_chapter_with_audio(pid)

    from app.storage.manager import get_storage_manager
    ctx = get_storage_manager().get_project_context(pid)
    backups_dir = ctx.root / "backups"

    filename = "unsupported_version.zip"
    audio_arcname = "chapters/audio/chapter.wav"
    bundle_json = {
        "project_id": pid,
        "bundle_name": filename,
        "bundle_version": 2,
        "chapter_map": {
            cid: {
                "title": "Chapter 1",
                "order": 1,
                "text_path": "chapters/01_Chapter_1.txt",
                "audio_path": audio_arcname,
            }
        },
    }
    _write_hand_crafted_backup(
        backups_dir, filename, bundle_json,
        extra_members={audio_arcname: b"should never be restored"},
    )

    wav_path = chapter_dir / "chapter.wav"
    original_bytes = wav_path.read_bytes()

    response = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert response.status_code == 400
    assert "version" in response.json()["message"].lower()

    # No chapters were touched -- the version check runs before any
    # chapter processing begins.
    assert wav_path.read_bytes() == original_bytes


def test_restore_rejects_missing_bundle_version(clean_db, client):
    pid = create_project("Missing Bundle Version Restore")
    cid, chapter_dir = _make_chapter_with_audio(pid)

    from app.storage.manager import get_storage_manager
    ctx = get_storage_manager().get_project_context(pid)
    backups_dir = ctx.root / "backups"

    filename = "missing_version.zip"
    audio_arcname = "chapters/audio/chapter.wav"
    bundle_json = {
        "project_id": pid,
        "bundle_name": filename,
        # bundle_version deliberately absent -- an old-format or
        # hand-crafted bundle without the field must not be assumed to be
        # version 1.
        "chapter_map": {
            cid: {
                "title": "Chapter 1",
                "order": 1,
                "text_path": "chapters/01_Chapter_1.txt",
                "audio_path": audio_arcname,
            }
        },
    }
    _write_hand_crafted_backup(
        backups_dir, filename, bundle_json,
        extra_members={audio_arcname: b"should never be restored"},
    )

    wav_path = chapter_dir / "chapter.wav"
    original_bytes = wav_path.read_bytes()

    response = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert response.status_code == 400
    assert "version" in response.json()["message"].lower()
    assert wav_path.read_bytes() == original_bytes


# --- Case 8: bundle.json itself is size-capped before being read -----------

def _patch_bundle_json_size(monkeypatch, huge_size):
    """Make zipfile.ZipFile.getinfo/infolist report an oversized bundle.json
    member without actually writing a multi-GB fixture file to disk.
    (api_restore_project_backup and api_list_project_backups read the size
    via getinfo(); api_update_project_backup_metadata reads it via the
    ZipInfo objects yielded by infolist(), so both need patching.)"""
    real_getinfo = zipfile.ZipFile.getinfo
    real_infolist = zipfile.ZipFile.infolist

    def fake_getinfo(self, name, *args, **kwargs):
        info = real_getinfo(self, name, *args, **kwargs)
        if name == "bundle.json":
            info.file_size = huge_size
        return info

    def fake_infolist(self, *args, **kwargs):
        infos = real_infolist(self, *args, **kwargs)
        for info in infos:
            if info.filename == "bundle.json":
                info.file_size = huge_size
        return infos

    monkeypatch.setattr(zipfile.ZipFile, "getinfo", fake_getinfo)
    monkeypatch.setattr(zipfile.ZipFile, "infolist", fake_infolist)


def test_restore_rejects_oversized_bundle_json_without_crashing(clean_db, client, monkeypatch):
    pid = create_project("Oversized Bundle JSON Restore")
    cid, chapter_dir = _make_chapter_with_audio(pid)

    save_response = client.post(f"/api/projects/{pid}/backup-bundle/save")
    assert save_response.status_code == 200
    filename = save_response.json()["filename"]

    wav_path = chapter_dir / "chapter.wav"
    original_bytes = wav_path.read_bytes()

    _patch_bundle_json_size(monkeypatch, 10 * 1024 ** 3)  # 10 GB, well over the cap

    response = client.post(f"/api/projects/{pid}/backups/{filename}/restore")
    assert response.status_code == 400
    assert "size" in response.json()["message"].lower()
    assert wav_path.read_bytes() == original_bytes


def test_list_and_update_backups_do_not_crash_on_oversized_bundle_json(clean_db, client, monkeypatch):
    pid = create_project("Oversized Bundle JSON List/Update")
    _make_chapter_with_audio(pid)

    save_response = client.post(f"/api/projects/{pid}/backup-bundle/save")
    assert save_response.status_code == 200
    filename = save_response.json()["filename"]

    _patch_bundle_json_size(monkeypatch, 10 * 1024 ** 3)  # 10 GB, well over the cap

    list_response = client.get(f"/api/projects/{pid}/backups")
    assert list_response.status_code == 200
    entry = next(b for b in list_response.json() if b["filename"] == filename)
    # The oversized bundle.json is never read, so the opportunistically
    # extracted comment is simply unavailable rather than a crash.
    assert entry["comment"] is None

    update_response = client.patch(
        f"/api/projects/{pid}/backups/{filename}",
        json={"comment": "new comment"},
    )
    assert update_response.status_code == 400
    assert "size" in update_response.json()["message"].lower()
