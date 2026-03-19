import os
import tempfile
import pytest
import atexit
import signal
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
from app.jobs import clear_job_queue, pause_flag  # noqa: E402


_TEST_TIMEOUT_SECONDS = int(os.environ.get("PYTEST_TEST_TIMEOUT_SECONDS", "30"))


def _timeout_handler(signum, frame):
    raise TimeoutError(f"pytest test exceeded {_TEST_TIMEOUT_SECONDS} seconds")


def pytest_configure(config):
    """
    Keep focused local runs from tripping historical coverage gates.
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


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_protocol(item, nextitem):
    """
    Fail a test if it stalls too long so hangs surface as actionable failures.
    """
    if _TEST_TIMEOUT_SECONDS <= 0 or not hasattr(signal, "SIGALRM"):
        yield
        return

    previous_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.setitimer(signal.ITIMER_REAL, _TEST_TIMEOUT_SECONDS)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)

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
    pause_flag.clear()

    # Clear any dependency overrides that a test may have left behind.
    from app.web import app as fastapi_app
    fastapi_app.dependency_overrides = {}

    yield

    fastapi_app.dependency_overrides = {}
    clear_all_jobs()
    clear_job_queue()
    pause_flag.clear()
