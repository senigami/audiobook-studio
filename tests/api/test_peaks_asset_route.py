"""Tests for the compute-on-miss peaks sidecar route
(GET /api/projects/{pid}/chapters/{cid}/assets/peaks).

Per R2 (mock boundaries only), these tests mock compute_peaks_sidecar
(app.engines.audio_ops, a module outside chapters_assets.py — the unit under
test) rather than anything inside the route/helper itself.
"""
import json
import os
import threading

import pytest
from fastapi.testclient import TestClient

from app.db.core import init_db
from app.api.web import app
from app.core import config
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.api.routers import chapters_assets as chapters_assets_module
from app.engines.audio_ops import SIDECAR_VERSION


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def clean_db():
    db_path = "/tmp/test_peaks_asset_route.db"
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


def _sidecar_for(wav_path, *, version=None, peaks=None) -> dict:
    stat = wav_path.stat()
    return {
        "version": SIDECAR_VERSION if version is None else version,
        "peaks": peaks if peaks is not None else [0.1, 0.2, 0.3],
        "duration_sec": 1.5,
        "sample_rate": 22050,
        "channels": 1,
        "peaks_per_sec": 8,
        "source": {
            "filename": wav_path.name,
            "size_bytes": stat.st_size,
            "mtime_ns": stat.st_mtime_ns,
        },
    }


def _make_chapter_wav(pid, cid):
    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    wav_path = chapter_dir / "chapter.wav"
    wav_path.write_bytes(b"RIFF....fake wav data")
    return wav_path


def test_peaks_route_computes_and_caches_on_first_request(clean_db, client, monkeypatch):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)
    sidecar_path = wav_path.with_suffix(".peaks.json")
    assert not sidecar_path.exists()

    call_count = {"n": 0}

    def fake_compute(path):
        call_count["n"] += 1
        return _sidecar_for(path)

    monkeypatch.setattr(chapters_assets_module, "compute_peaks_sidecar", fake_compute)

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "chapter.wav"},
    )

    assert response.status_code == 200
    assert call_count["n"] == 1
    assert sidecar_path.exists()
    assert json.loads(sidecar_path.read_text()) == response.json()
    assert response.json()["source"]["size_bytes"] == wav_path.stat().st_size


def test_peaks_route_serves_cached_sidecar_without_recompute(clean_db, client, monkeypatch):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)
    sidecar_path = wav_path.with_suffix(".peaks.json")

    cached = _sidecar_for(wav_path)
    sidecar_path.write_text(json.dumps(cached))

    def fail_if_called(path):
        raise AssertionError("compute_peaks_sidecar must not run for a fresh cached sidecar")

    monkeypatch.setattr(chapters_assets_module, "compute_peaks_sidecar", fail_if_called)

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "chapter.wav"},
    )

    assert response.status_code == 200
    assert response.json() == cached


def test_peaks_route_recomputes_on_stale_stat(clean_db, client, monkeypatch):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)
    sidecar_path = wav_path.with_suffix(".peaks.json")

    stale = _sidecar_for(wav_path, peaks=[9.9])
    stale["source"]["size_bytes"] += 999  # force a stat mismatch against the real WAV
    sidecar_path.write_text(json.dumps(stale))

    call_count = {"n": 0}

    def fake_compute(path):
        call_count["n"] += 1
        return _sidecar_for(path)  # matches the real, current stat

    monkeypatch.setattr(chapters_assets_module, "compute_peaks_sidecar", fake_compute)

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "chapter.wav"},
    )

    assert response.status_code == 200
    assert call_count["n"] == 1
    body = response.json()
    assert body["peaks"] != [9.9]
    assert body["source"]["size_bytes"] == wav_path.stat().st_size
    assert json.loads(sidecar_path.read_text()) == body


def test_peaks_route_recomputes_on_version_mismatch(clean_db, client, monkeypatch):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)
    sidecar_path = wav_path.with_suffix(".peaks.json")

    old_version = _sidecar_for(wav_path, version=SIDECAR_VERSION - 1, peaks=[4.2])
    sidecar_path.write_text(json.dumps(old_version))

    call_count = {"n": 0}

    def fake_compute(path):
        call_count["n"] += 1
        return _sidecar_for(path)

    monkeypatch.setattr(chapters_assets_module, "compute_peaks_sidecar", fake_compute)

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "chapter.wav"},
    )

    assert response.status_code == 200
    assert call_count["n"] == 1
    body = response.json()
    assert body["version"] == SIDECAR_VERSION
    assert body["peaks"] != [4.2]


def test_peaks_route_missing_wav_returns_404(clean_db, client):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "chapter.wav"},
    )

    assert response.status_code == 404


def test_peaks_route_compute_failure_returns_404_not_500(clean_db, client, monkeypatch):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)

    monkeypatch.setattr(chapters_assets_module, "compute_peaks_sidecar", lambda path: None)

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "chapter.wav"},
    )

    assert response.status_code == 404
    assert not wav_path.with_suffix(".peaks.json").exists()


def test_load_or_compute_returns_none_when_wav_stat_fails(clean_db, tmp_path):
    """Race: a concurrent re-render deletes the WAV between the route's
    exists() check and the helper's top stat(). The helper must degrade to
    None (→ route 404), never let the unguarded stat() FileNotFoundError
    surface as a 500 that breaks the frontend's browser-decode fallback."""
    missing_wav = tmp_path / "gone.wav"  # never created
    sidecar_path = missing_wav.with_suffix(".peaks.json")

    result = chapters_assets_module._load_or_compute_peaks_sidecar(missing_wav, sidecar_path)

    assert result is None
    assert not sidecar_path.exists()


def test_peaks_route_serves_peaks_even_when_cache_write_fails(clean_db, client, monkeypatch):
    """Caching is best-effort: if the atomic sidecar write fails (disk full,
    permission), the freshly computed peaks must still be served (200), not
    discarded or 500'd."""
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)
    sidecar_path = wav_path.with_suffix(".peaks.json")

    def fake_compute(path):
        return _sidecar_for(path)

    monkeypatch.setattr(chapters_assets_module, "compute_peaks_sidecar", fake_compute)

    def boom(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(chapters_assets_module.os, "replace", boom)

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "chapter.wav"},
    )

    assert response.status_code == 200
    assert response.json()["source"]["filename"] == wav_path.name
    assert not sidecar_path.exists()  # write failed → not cached, but still served


def test_peaks_route_rejects_path_traversal(clean_db, client):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    response = client.get(
        f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
        params={"filename": "../../etc/passwd"},
    )

    assert 400 <= response.status_code < 500
    body_text = response.text
    assert "etc/passwd" not in body_text
    assert "/etc/" not in body_text


def test_peaks_route_concurrent_requests_compute_at_most_once(clean_db, client, monkeypatch):
    """Verifies the per-WAV-path lock: a request arriving while another is
    already computing the same sidecar must block on that lock and then be
    served the single computed result — never trigger a second compute.

    Rather than racing real threads against a wall clock (flaky/R4-adjacent),
    this deterministically holds the exact lock the route will contend on
    *before* firing the concurrent request, and proves the request thread is
    still blocked (not merely slow) while the lock is held.
    """
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")
    wav_path = _make_chapter_wav(pid, cid)

    wav_resolved = config.resolve_chapter_asset_path(pid, cid, "audio", filename="chapter.wav")
    assert wav_resolved is not None

    call_count = {"n": 0}

    def fake_compute(path):
        call_count["n"] += 1
        return _sidecar_for(path)

    monkeypatch.setattr(chapters_assets_module, "compute_peaks_sidecar", fake_compute)

    lock = chapters_assets_module._get_peaks_lock(str(wav_resolved))
    lock.acquire()
    result_holder = {}
    try:
        def worker():
            result_holder["response"] = client.get(
                f"/api/projects/{pid}/chapters/{cid}/assets/peaks",
                params={"filename": "chapter.wav"},
            )

        t = threading.Thread(target=worker)
        t.start()
        t.join(timeout=0.2)

        # Still genuinely blocked on the held lock — proves serialization,
        # not just a slow request.
        assert t.is_alive()
        assert call_count["n"] == 0
    finally:
        lock.release()

    t.join(timeout=5)
    assert not t.is_alive()
    assert call_count["n"] == 1
    assert result_holder["response"].status_code == 200
    assert wav_path.with_suffix(".peaks.json").exists()
