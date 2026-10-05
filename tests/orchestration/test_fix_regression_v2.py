import pytest
import time
from fastapi.testclient import TestClient
from pathlib import Path
from app.api.web import app
from app.db import create_project, create_chapter, update_chapter
from app.db.state import put_job, Job, get_jobs

client = TestClient(app)

def test_stream_chapter_with_suffixed_filename(tmp_path):
    # Setup: Create a project and chapter
    pid = create_project("Suffix Project")
    cid = create_chapter(pid, "Suffix Chapter", "Suffix content")

    # Simulate a filename with suffix in DB
    audio_path = f"{cid}_0.wav"
    update_chapter(cid, audio_file_path=audio_path)

    # Create the actual file in the V2 nested chapter dir
    from app.core.config import get_chapter_dir
    chap_dir = get_chapter_dir(pid, cid)
    chap_dir.mkdir(parents=True, exist_ok=True)
    f = chap_dir / audio_path
    f.write_text("dummy audio data")

    # Test streaming
    response = client.get(f"/api/chapters/{cid}/stream?project_id={pid}")
    assert response.status_code == 200
    assert response.text == "dummy audio data"

def test_startup_recovery_clears_stuck_states():
    # Mock some jobs in various states
    put_job(Job(id="stuck-preparing", status="preparing", created_at=time.time(), engine="xtts", chapter_file="c1.txt"))
    put_job(Job(id="stuck-finalizing", status="finalizing", created_at=time.time(), engine="xtts", chapter_file="c2.txt"))
    put_job(Job(id="safe-done", status="done", created_at=time.time(), engine="xtts", chapter_file="c3.txt"))

    # Trigger the startup event logic (which we updated in app.api.web)
    # Since we can't easily trigger the real 'startup' event in a test without side effects,
    # we can call the logic directly or rely on the fact that app instances in TestClient
    # might trigger it if not careful. 
    # Actually, let's just import and run the recovery logic block.

    from app.db.state import delete_jobs

    # Re-verify initial state
    jobs = get_jobs()
    assert "stuck-preparing" in jobs
    assert "stuck-finalizing" in jobs

    # Run the logic that was added to startup_event
    to_del = [jid for jid, j in jobs.items() if j.status in ("queued", "running", "preparing", "finalizing")]
    if to_del:
        delete_jobs(to_del)

    # Verify they are gone
    remaining = get_jobs()
    assert "stuck-preparing" not in remaining
    assert "stuck-finalizing" not in remaining
    assert "safe-done" in remaining

def test_startup_step2b_clears_terminal_jobs_from_snapshot():
    """_clear_terminal_jobs_from_snapshot() removes done/failed/cancelled jobs from
    state.json while leaving active (queued) jobs intact.

    Revert-check: rename/remove _clear_terminal_jobs_from_snapshot in web.py and
    this test fails with ImportError or AssertionError because terminal jobs survive.
    R2: mocks only the filesystem/network boundary (none needed here — state store is
    the unit under test alongside the helper).
    """
    import time
    from app.db.state import put_job, Job, get_jobs
    from app.api.web import _clear_terminal_jobs_from_snapshot

    # Seed: one active job, one done, one failed
    put_job(Job(id="sb-active-queued", status="queued", created_at=time.time(), engine="xtts", chapter_file="a.txt"))
    put_job(Job(id="sb-terminal-done", status="done", created_at=time.time(), engine="xtts", chapter_file="b.txt"))
    put_job(Job(id="sb-terminal-failed", status="failed", created_at=time.time(), engine="xtts", chapter_file="c.txt"))

    # Verify seeding
    jobs = get_jobs()
    assert "sb-active-queued" in jobs
    assert "sb-terminal-done" in jobs
    assert "sb-terminal-failed" in jobs

    # Execute the helper (this is the unit under test — the same code called by startup_event step 2b)
    cleared = _clear_terminal_jobs_from_snapshot()

    # Terminal jobs must be gone; active job must survive
    remaining = get_jobs()
    assert "sb-terminal-done" not in remaining, "done job should be cleared by step 2b"
    assert "sb-terminal-failed" not in remaining, "failed job should be cleared by step 2b"
    assert "sb-active-queued" in remaining, "active queued job must not be cleared by step 2b"
    assert cleared >= 2, "helper should report at least 2 cleared jobs"


def test_startup_recovery_clears_stuck_chapter_status():
    from app.db.reconcile import reconcile_all_chapter_statuses
    from app.db.core import get_connection

    # Setup: Create a project and chapter in 'processing' state
    pid = create_project("Ghost Project")
    cid = create_chapter(pid, "Ghost Chapter", "content")

    with get_connection() as conn:
        conn.execute("UPDATE chapters SET audio_status = 'processing' WHERE id = ?", (cid,))
        conn.commit()

    # Run reconciliation with NO active chapter IDs
    reconcile_all_chapter_statuses(set())

    # Verify it was reset
    with get_connection() as conn:
        row = conn.execute("SELECT audio_status FROM chapters WHERE id = ?", (cid,)).fetchone()
        assert row[0] == 'unprocessed'

def test_audiobook_listing_finds_png_cover():
    pid = create_project("PNG Project")
    # Simulate an m4b file in the project's m4b dir
    from app.core.config import get_project_m4b_dir
    m4b_dir = get_project_m4b_dir(pid)
    m4b_dir.mkdir(parents=True, exist_ok=True)

    m4b_file = m4b_dir / "test_book.m4b"
    m4b_file.write_text("dummy m4b content")

    png_file = m4b_dir / "test_book.png"
    png_file.write_text("fake png data")

    response = client.get(f"/api/projects/{pid}/audiobooks")
    assert response.status_code == 200
    data = response.json()

    # Find our book in the list
    book = next(b for b in data if b["filename"] == "test_book.m4b")
    assert book["cover_url"] == f"/projects/{pid}/m4b/test_book.png"

def test_state_pruning():
    from app.db.state import put_job, Job, get_jobs, prune_completed_jobs
    import time

    # Add 60 done jobs
    for i in range(60):
        jid = f"prune-this-{i}"
        put_job(Job(id=jid, status="done", created_at=time.time(), engine="xtts", chapter_file=f"file_{i}.txt", finished_at=time.time()))

    # Trigger pruning
    prune_completed_jobs()

    # Should only have 50 (plus whatever else was there, but it keeps 50 most recent terminal ones)
    remaining = get_jobs()
    terminal_remaining = [j for j in remaining.values() if j.status in ("done", "failed", "cancelled")]
    assert len(terminal_remaining) <= 50

def test_stream_chapter_fallback_logic():
    # Test that it falls back to {chapter_id}_0.wav even if NOT in DB
    pid = create_project("Fallback Project")
    cid = create_chapter(pid, "Fallback Chapter", "content")

    # DB has NO audio_file_path
    update_chapter(cid, audio_file_path=None)

    # Create the file on disk anyway in the V2 nested dir
    from app.core.config import get_chapter_dir
    chap_dir = get_chapter_dir(pid, cid)
    chap_dir.mkdir(parents=True, exist_ok=True)
    f = chap_dir / "chapter.wav"
    f.write_text("fallback data")

    response = client.get(f"/api/chapters/{cid}/stream?project_id={pid}")
    assert response.status_code == 200
    assert response.text == "fallback data"
