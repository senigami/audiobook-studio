import os
import tempfile
import pytest
import atexit
from pathlib import Path

# 1. Create a session-wide temp directory for storage isolation
_temp_dir = tempfile.TemporaryDirectory()
atexit.register(_temp_dir.cleanup)
SESSION_TEMP = Path(_temp_dir.name)

os.environ["AUDIOBOOK_BASE_DIR"] = str(SESSION_TEMP)
os.environ["DB_PATH"] = str(SESSION_TEMP / "test_audiobook_studio.db")
os.environ["STATE_FILE"] = str(SESSION_TEMP / "test_state.json")
os.environ["CHAPTER_DIR"] = str(SESSION_TEMP / "chapters_out")
os.environ["UPLOAD_DIR"] = str(SESSION_TEMP / "uploads")
os.environ["REPORT_DIR"] = str(SESSION_TEMP / "reports")
os.environ["XTTS_OUT_DIR"] = str(SESSION_TEMP / "xtts_audio")
os.environ["AUDIOBOOK_DIR"] = str(SESSION_TEMP / "audiobooks")
os.environ["VOICES_DIR"] = str(SESSION_TEMP / "voices")
os.environ["COVER_DIR"] = str(SESSION_TEMP / "uploads/covers")
os.environ["SAMPLES_DIR"] = str(SESSION_TEMP / "samples")
os.environ["ASSETS_DIR"] = str(SESSION_TEMP / "assets")
os.environ["PROJECTS_DIR"] = str(SESSION_TEMP / "projects")

# Ensure all directories exist
for d in ["chapters_out", "uploads", "reports", "xtts_audio", "audiobooks", "voices", "uploads/covers", "samples", "assets", "projects"]:
    (SESSION_TEMP / d).mkdir(parents=True, exist_ok=True)

# 2. NOW import modules that rely on these env vars
from app.db import init_db  # noqa: E402
from app.state import clear_all_jobs  # noqa: E402
from app.jobs import clear_job_queue  # noqa: E402


def pytest_configure(config):
    """
    Keep the coverage gate for full-suite runs, but don't fail focused local
    runs that intentionally target a single file while debugging.
    """
    selected_targets = list(getattr(config.option, "file_or_dir", []) or [])
    focused_run = bool(
        selected_targets
        or getattr(config.option, "keyword", "")
        or getattr(config.option, "markexpr", "")
    )
    if focused_run and getattr(config.option, "cov_fail_under", None):
        config.option.cov_source = []
        config.option.cov_report = []
        config.option.cov_fail_under = 0

@pytest.fixture(autouse=True)
def clean_storage():
    """
    Ensures that every test starts with a fresh database and cleared state.
    Storage directory isolation is handled by session-wide environment variables.
    """
    # Initialize/Reset the database
    init_db()

    # Clear in-memory state and state.json
    clear_all_jobs()
    clear_job_queue()

    # Clear any dependency overrides that a test may have left behind.
    from app.web import app as fastapi_app
    fastapi_app.dependency_overrides = {}

    yield

    fastapi_app.dependency_overrides = {}
    clear_all_jobs()
    clear_job_queue()
