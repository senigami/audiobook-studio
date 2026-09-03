import pytest
import sqlite3
import os
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db, get_connection
from app.db.projects import (
    create_project, get_project, list_projects, update_project, delete_project
)
from app.db.chapters import create_chapter, update_chapter

@pytest.fixture
def db_conn():
    db_path = "/tmp/test_projects.db"
    if os.path.exists(db_path):
        os.unlink(db_path)

    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    init_db()
    conn = get_connection()
    yield conn
    conn.close()
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_project_crud(db_conn, tmp_path):
    # Create
    pid = create_project("Test Project", "Series X", "Author Y", "/path/to/cover.jpg")
    assert pid is not None

    # Get
    project = get_project(pid)
    assert project is not None
    assert project["name"] == "Test Project"
    assert project["series"] == "Series X"
    assert project["author"] == "Author Y"

    # List
    projects = list_projects()
    assert len(projects) == 1
    assert projects[0]["id"] == pid

    # Update
    success = update_project(pid, name="Updated Project", author="New Author")
    assert success is True
    project = get_project(pid)
    assert project["name"] == "Updated Project"
    assert project["author"] == "New Author"

    # Delete (mocking physical cleanup)
    project_root = tmp_path / "projects"
    project_root.mkdir()
    project_dir = project_root / pid
    project_dir.mkdir()
    with patch("shutil.rmtree") as mock_rm, \
         patch("app.core.config.PROJECTS_DIR", project_root.resolve()):
        success = delete_project(pid)
        assert success is True
        mock_rm.assert_called_once()

    assert get_project(pid) is None

def test_project_description_round_trip(db_conn):
    pid = create_project("Description Project")

    # Unset by default
    project = get_project(pid)
    assert project["description"] is None

    # Set a description
    success = update_project(pid, description="A gripping tale.")
    assert success is True
    project = get_project(pid)
    assert project["description"] == "A gripping tale."

    # Clear to empty string
    success = update_project(pid, description="")
    assert success is True
    project = get_project(pid)
    assert project["description"] == ""

    # Set back to None
    success = update_project(pid, description=None)
    assert success is True
    project = get_project(pid)
    assert project["description"] is None

def test_list_projects_order(db_conn):
    pid1 = create_project("P1")
    pid2 = create_project("P2")
    # Force updated_at ordering by touching pid2 after pid1
    update_project(pid2, name="P2")

    projects = list_projects()
    # Ordered by updated_at DESC
    assert projects[0]["id"] == pid2
    assert projects[1]["id"] == pid1

def test_delete_project_no_path(db_conn, tmp_path):
    pid = create_project("NoPath")
    project_root = tmp_path / "projects"
    project_root.mkdir()
    with patch("app.core.config.PROJECTS_DIR", project_root.resolve()):
        success = delete_project(pid)
        assert success is True


# ---------------------------------------------------------------------------
# Task 005 (north_star_screen_parity) — derived project status.
#
# list_projects() must return a "status" field computed from chapter-lifecycle
# aggregates already in the DB (chapter count, chapters with segments, chapters
# with audio_status == 'done') — no per-project round-trip, no filesystem scan.
# Owner-approved partial scope: only 3 states (drafting/casting/rendered) —
# Studio (actively rendering) and Published (assembled) are out of scope for
# this pass (see design-docs/plans/active/north_star_screen_parity/tasks/
# 005-library-project-status.md).

def test_list_projects_status_drafting_when_no_chapters(db_conn):
    pid = create_project("Empty Book")
    projects = list_projects()
    assert projects[0]["id"] == pid
    assert projects[0]["status"] == "drafting"


def test_list_projects_status_drafting_when_chapters_have_no_segments(db_conn):
    pid = create_project("Unchunked Book")
    # A chapter with no text_content never gets segments synced.
    create_chapter(pid, "Chapter 1")
    projects = list_projects()
    assert projects[0]["status"] == "drafting"


def test_list_projects_status_casting_when_some_progress(db_conn):
    pid = create_project("In Progress Book")
    # Chapter with text gets segments synced (chapter_segments rows created),
    # but audio_status stays 'unprocessed' until rendered.
    create_chapter(pid, "Chapter 1", text_content="Hello world. Another sentence.")
    projects = list_projects()
    assert projects[0]["status"] == "casting"


def test_list_projects_status_rendered_when_all_chapters_done(db_conn):
    pid = create_project("Finished Book")
    cid = create_chapter(pid, "Chapter 1", text_content="Hello world. Another sentence.")
    update_chapter(cid, audio_status="done")
    projects = list_projects()
    assert projects[0]["status"] == "rendered"


def test_list_projects_status_casting_when_one_of_two_chapters_rendered(db_conn):
    pid = create_project("Half Done Book")
    cid1 = create_chapter(pid, "Chapter 1", text_content="Hello world. Another sentence.")
    create_chapter(pid, "Chapter 2", text_content="More text here. Yet more.")
    update_chapter(cid1, audio_status="done")
    projects = list_projects()
    assert projects[0]["status"] == "casting"


# ---------------------------------------------------------------------------
# Task 006 (north_star_screen_parity) — Library "Continue" section.
#
# list_projects() already computes chapter_count/chapters_rendered_count in
# its aggregate SQL to derive `status`, but previously discarded (popped) them
# before returning. The Continue section needs a static book-level rendered
# fraction (rendered chapters / total chapters) — a genuine, non-fabricated
# number — so these counts must be exposed on each project dict instead of
# being thrown away.

def test_list_projects_exposes_chapter_counts_for_progress_fraction(db_conn):
    pid = create_project("Half Done Book")
    cid1 = create_chapter(pid, "Chapter 1", text_content="Hello world. Another sentence.")
    create_chapter(pid, "Chapter 2", text_content="More text here. Yet more.")
    update_chapter(cid1, audio_status="done")
    projects = list_projects()
    assert projects[0]["chapter_count"] == 2
    assert projects[0]["chapters_rendered_count"] == 1


def test_list_projects_chapter_counts_zero_for_empty_project(db_conn):
    create_project("Empty Book")
    projects = list_projects()
    assert projects[0]["chapter_count"] == 0
    assert projects[0]["chapters_rendered_count"] == 0


def test_list_projects_status_uses_a_single_query_no_n_plus_1(db_conn):
    # Three projects, several chapters each — list_projects() must derive
    # status via one aggregate query, not one query per project/chapter.
    for i in range(3):
        pid = create_project(f"Book {i}")
        create_chapter(pid, "Chapter 1", text_content="Some text. More text.")
        create_chapter(pid, "Chapter 2", text_content="Some text. More text.")

    # sqlite3's trace callback fires once per executed SQL statement — use it
    # to count statements without touching the (C-extension, immutable)
    # sqlite3.Cursor type. list_projects() opens its own fresh connection
    # (app's connect-per-call pattern, see app/db/core.get_connection), so
    # wrap sqlite3.connect itself to attach the callback to whatever
    # connection(s) get created during the call.
    executed_statements = []
    real_connect = sqlite3.connect

    def connect_with_trace(*args, **kwargs):
        conn = real_connect(*args, **kwargs)
        conn.set_trace_callback(executed_statements.append)
        return conn

    with patch("app.db.core.sqlite3.connect", side_effect=connect_with_trace):
        projects = list_projects()

    assert len(projects) == 3
    assert all(p["status"] == "casting" for p in projects)
    # Exactly one SELECT executed for the whole list_projects() call
    # (ignoring the per-connection WAL PRAGMA set up by get_connection),
    # regardless of the number of projects/chapters — the aggregate join,
    # not a per-project fan-out.
    select_statements = [s for s in executed_statements if s.strip().upper().startswith("SELECT")]
    assert len(select_statements) == 1
