"""Route-level test: GET /api/projects/{project_id} triggers per-project GC.

R1 revert-check target: must fail before the BackgroundTasks hook is added
to api_get_project in projects.py.

R2 compliant: mocks only _chapter_has_active_generation (boundary).
R4 compliant: Starlette's TestClient executes BackgroundTasks synchronously
within the request — no sleeps needed.
"""
from __future__ import annotations

import pytest

from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.core import get_connection
from app.core import config


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
    """GET /api/projects/{project_id} should delete orphaned segment files
    via a background task while keeping referenced files intact.

    R1 revert-check: fails before the BackgroundTasks hook is wired in
    api_get_project.
    """
    pid = create_project("GC Route Test Project")
    cid = create_chapter(pid, "GC Route Test Chapter")

    # Create DB row referencing 'referenced.wav'
    _insert_segment(cid, "seg-ref-1", "referenced.wav")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "referenced.wav").write_bytes(b"RIFF")
    (seg_dir / "orphan.wav").write_bytes(b"RIFF")

    response = client.get(f"/api/projects/{pid}")

    assert response.status_code == 200
    assert response.json()["id"] == pid

    # BackgroundTasks runs synchronously in TestClient
    assert (seg_dir / "referenced.wav").exists(), "Referenced file must survive"
    assert not (seg_dir / "orphan.wav").exists(), "Orphaned file must be deleted"


def test_get_project_404_does_not_trigger_gc(client):
    """GET /api/projects/<nonexistent> returns 404 and must not schedule any GC."""
    from unittest.mock import patch

    with patch("app.api.routers.projects._schedule_segment_gc") as mock_gc:
        response = client.get("/api/projects/nonexistent-project-id-xyz")

    assert response.status_code == 404
    mock_gc.assert_not_called()
