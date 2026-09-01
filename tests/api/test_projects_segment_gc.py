"""Route-level test: GET /api/projects/{project_id} triggers per-project GC.

R1 revert-check target: must fail before the BackgroundTasks hook is added
to api_get_project in projects.py.

R2 compliant: mocks only _chapter_has_active_generation (boundary).
R4 compliant: Starlette's TestClient executes BackgroundTasks synchronously
within the request — no sleeps needed.
"""
from __future__ import annotations

import time

import pytest

from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.core import get_connection
from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import run_migrations
from app.core import config


@pytest.fixture(autouse=True)
def _ensure_schema():
    """conftest's ``clean_storage`` (function-scoped, autouse) re-runs
    ``init_db()`` before every test, which recreates the schema from scratch
    without the versioned migration registry — so segment_audio_tombstones
    and chapter_locks would not exist. Re-apply the migration after it, each
    test (idempotent, guarded by schema_migrations)."""
    with get_connection() as conn:
        run_migrations(conn, MIGRATIONS)


def _insert_tombstone(chapter_id: str, filename: str, *, age_seconds: float = 0.0) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO segment_audio_tombstones (filename, chapter_id, created_at) VALUES (?, ?, ?)",
            (filename, chapter_id, time.time() - age_seconds),
        )
        conn.commit()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)


def _insert_segment(chapter_id: str, seg_id: str, audio_file_path: str) -> None:
    """Insert a chapter_segments row with a referenced audio file."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO chapter_segments
              (id, chapter_id, segment_order, text_content, audio_status, audio_file_path)
            VALUES (?, ?, 0, 'text', 'done', ?)
            """,
            (seg_id, chapter_id, audio_file_path),
        )
        conn.commit()


def _resolve_seg_dir(project_id: str, chapter_id: str):
    chapter_dir = config.get_chapter_dir(project_id, chapter_id)
    seg_dir = config.secure_join_flat(chapter_dir, "segments")
    assert seg_dir is not None
    seg_dir.mkdir(parents=True, exist_ok=True)
    return seg_dir


def test_get_project_triggers_gc_deletes_orphan(client):
    """GET /api/projects/{project_id} should delete a TOMBSTONED-and-aged
    orphaned segment file via a background task while keeping referenced
    files intact (#232 Task 004: GC is tombstone-gated, INV-3 — an
    untombstoned orphan is a separate case, covered below).

    R1 revert-check: fails before the BackgroundTasks hook is wired in
    api_get_project.
    """
    from app.db.segment_gc import GC_TOMBSTONE_GRACE_PERIOD_SECONDS

    pid = create_project("GC Route Test Project")
    cid = create_chapter(pid, "GC Route Test Chapter")

    # Create DB row referencing 'referenced.wav'
    _insert_segment(cid, "seg-ref-1", "referenced.wav")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "referenced.wav").write_bytes(b"RIFF")
    (seg_dir / "orphan.wav").write_bytes(b"RIFF")
    _insert_tombstone(cid, "orphan.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)

    response = client.get(f"/api/projects/{pid}")

    assert response.status_code == 200
    assert response.json()["id"] == pid

    # BackgroundTasks runs synchronously in TestClient
    assert (seg_dir / "referenced.wav").exists(), "Referenced file must survive"
    assert not (seg_dir / "orphan.wav").exists(), "Tombstoned+aged orphan must be deleted"


def test_get_project_does_not_delete_untombstoned_orphan(client):
    """An unreferenced file with no tombstone must survive a GET-triggered
    sweep (INV-3) — GC only reports it, an operator/scheduled sweep decides
    what to do with it."""
    pid = create_project("GC Route Untombstoned Test Project")
    cid = create_chapter(pid, "GC Route Untombstoned Test Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "orphan.wav").write_bytes(b"RIFF")
    # No tombstone.

    response = client.get(f"/api/projects/{pid}")

    assert response.status_code == 200
    assert (seg_dir / "orphan.wav").exists(), "Untombstoned orphan must NOT be deleted"


def test_get_project_404_does_not_trigger_gc(client):
    """GET /api/projects/<nonexistent> returns 404 and must not schedule any GC."""
    from unittest.mock import patch

    with patch("app.api.routers.projects._schedule_segment_gc") as mock_gc:
        response = client.get("/api/projects/nonexistent-project-id-xyz")

    assert response.status_code == 404
    mock_gc.assert_not_called()
