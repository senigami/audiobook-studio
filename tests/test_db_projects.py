import pytest
import sqlite3
import os
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db, get_connection
from app.db.projects import (
    create_project, get_project, list_projects, update_project, delete_project
)

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

def test_project_crud(db_conn):
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
    with patch("app.config.get_project_dir") as mock_dir, \
         patch("shutil.rmtree") as mock_rm:
        mock_dir.return_value = Path("/tmp/mock_project")
        # Ensure exists returns False initially or mock it
        with patch("pathlib.Path.exists", return_value=True):
            success = delete_project(pid)
            assert success is True
            mock_rm.assert_called_once()

    assert get_project(pid) is None

def test_list_projects_order(db_conn):
    pid1 = create_project("P1")
    import time
    time.sleep(0.1)
    pid2 = create_project("P2")

    projects = list_projects()
    # Ordered by updated_at DESC
    assert projects[0]["id"] == pid2
    assert projects[1]["id"] == pid1

def test_delete_project_no_path(db_conn):
    pid = create_project("NoPath")
    with patch("app.config.get_project_dir", return_value=Path("/none")), \
         patch("pathlib.Path.exists", return_value=False):
        success = delete_project(pid)
        assert success is True
