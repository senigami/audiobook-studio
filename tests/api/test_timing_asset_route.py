"""Tests for the chapter timing-sidecar serving route
(GET /api/projects/{pid}/chapters/{cid}/timing).

Mirrors tests/api/test_peaks_asset_route.py's fixture conventions. Per R2
(mock boundaries only), no mocking is needed here: the route only reads a
sidecar file from disk and validates it via
``app.domain.chapters.timing.validate_timing_sidecar`` (Task 2, outside the
route under test), so tests exercise real files + the real DB.

Unlike the peaks route, this route must NEVER lazily recompute a missing or
stale sidecar — a missing/stale/corrupt/version-mismatched sidecar is always
a 404, never a 500.
"""
import json
import os

import pytest
from fastapi.testclient import TestClient

from app.db.core import init_db
from app.api.web import app
from app.core import config
from app.db.projects import create_project
from app.db.chapters import create_chapter, update_chapter
from app.domain.chapters.timing import SCHEMA_DISCRIMINATOR, SCHEMA_VERSION


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def clean_db():
    db_path = "/tmp/test_timing_asset_route.db"
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


def _make_chapter_wav(pid, cid):
    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    wav_path = chapter_dir / "chapter.wav"
    wav_path.write_bytes(b"RIFF....fake wav data")
    return wav_path


def _valid_timing_sidecar(chapter_id: str, audio_generated_at: float) -> dict:
    return {
        "schema": SCHEMA_DISCRIMINATOR,
        "version": SCHEMA_VERSION,
        "chapter_id": chapter_id,
        "audio_file": "chapter.wav",
        "audio_generated_at": audio_generated_at,
        "audio_duration_ms": 1000,
        "generated_at": audio_generated_at + 1.0,
        "group_count": 1,
        "groups": [
            {
                "group_id": "seg-1",
                "segment_ids": ["seg-1"],
                "order": 0,
                "start_ms": 0,
                "end_ms": 1000,
                "duration_ms": 1000,
            }
        ],
    }


def _setup_chapter_with_audio(pid_prefix="P1", audio_generated_at=1000.0):
    pid = create_project(pid_prefix)
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)
    update_chapter(cid, audio_generated_at=audio_generated_at)
    return pid, cid, wav_path


def test_timing_route_returns_fresh_valid_sidecar(clean_db, client):
    pid, cid, wav_path = _setup_chapter_with_audio()
    sidecar_path = wav_path.with_suffix(".timing.json")
    sidecar = _valid_timing_sidecar(cid, audio_generated_at=1000.0)
    sidecar_path.write_text(json.dumps(sidecar))

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")

    assert response.status_code == 200
    assert response.json() == sidecar


def test_timing_route_missing_sidecar_returns_404(clean_db, client):
    pid, cid, _wav_path = _setup_chapter_with_audio()

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")

    assert response.status_code == 404


def test_timing_route_version_mismatch_returns_404_not_500(clean_db, client):
    pid, cid, wav_path = _setup_chapter_with_audio()
    sidecar_path = wav_path.with_suffix(".timing.json")
    sidecar = _valid_timing_sidecar(cid, audio_generated_at=1000.0)
    sidecar["version"] = SCHEMA_VERSION + 1
    sidecar_path.write_text(json.dumps(sidecar))

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")

    assert response.status_code == 404


def test_timing_route_corrupt_json_returns_404_not_500(clean_db, client):
    pid, cid, wav_path = _setup_chapter_with_audio()
    sidecar_path = wav_path.with_suffix(".timing.json")
    sidecar_path.write_text("{ this is not valid json ][")

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")

    assert response.status_code == 404


def test_timing_route_stale_audio_generated_at_returns_404(clean_db, client):
    """Simulates the chapter having been re-rendered after this sidecar was
    written: the sidecar's audio_generated_at no longer matches the chapter's
    current DB value. This is the staleness case (Fable H3) — must be a 404,
    not silently served as if it still matched the current audio."""
    pid, cid, wav_path = _setup_chapter_with_audio(audio_generated_at=1000.0)
    sidecar_path = wav_path.with_suffix(".timing.json")
    sidecar = _valid_timing_sidecar(cid, audio_generated_at=999.0)  # stale value
    sidecar_path.write_text(json.dumps(sidecar))

    response = client.get(f"/api/projects/{pid}/chapters/{cid}/timing")

    assert response.status_code == 404


def test_timing_route_rejects_path_traversal_in_chapter_id(clean_db, client):
    pid = create_project("P1")

    response = client.get(f"/api/projects/{pid}/chapters/..%2f..%2f..%2fetc%2fpasswd/timing")

    assert 400 <= response.status_code < 500
    body_text = response.text
    assert "etc/passwd" not in body_text
    assert "/etc/" not in body_text


def test_timing_route_rejects_path_traversal_in_project_id(clean_db, client):
    pid, cid, _wav_path = _setup_chapter_with_audio()

    response = client.get(f"/api/projects/..%2f..%2f..%2fetc/chapters/{cid}/timing")

    assert 400 <= response.status_code < 500
    body_text = response.text
    assert "/etc/" not in body_text
