import os
import tempfile
import pytest
import atexit
import signal
import faulthandler
from pathlib import Path
import psutil

try:
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None

pytest_plugins = ["tests.api_voices_fixtures"]

# 1. Create a session-wide temp directory for storage isolation
_temp_dir = tempfile.TemporaryDirectory()
atexit.register(_temp_dir.cleanup)
SESSION_TEMP = Path(_temp_dir.name)

os.environ["AUDIOBOOK_BASE_DIR"] = str(SESSION_TEMP)
os.environ["APP_TEST_MODE"] = "1"
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
from app.engines import terminate_all_subprocesses  # noqa: E402


_TEST_TIMEOUT_SECONDS = int(os.environ.get("PYTEST_TEST_TIMEOUT_SECONDS", "15"))
_DEFAULT_TEST_TIMEOUT_SECONDS = _TEST_TIMEOUT_SECONDS
_PYTEST_LOCK_FILE = None
_PYTEST_LOCK_PATH = Path(os.environ.get("PYTEST_SESSION_LOCK_PATH", "/tmp/audiobook-factory-pytest.lock"))
_ACTIVE_TIMEOUT_SECONDS = _DEFAULT_TEST_TIMEOUT_SECONDS


def _kill_pytest_descendants():
    """
    Reap any child/grandchild processes spawned by this pytest run.
    This catches leaked watchers, worker helpers, and server subprocess trees
    that outlive an individual test.
    """
    try:
        current = psutil.Process()
        descendants = current.children(recursive=True)
    except Exception:
        return

    protected_pids = {os.getpid(), os.getppid()}
    processes = [proc for proc in descendants if proc.pid not in protected_pids]
    if not processes:
        return

    for proc in processes:
        try:
            proc.terminate()
        except Exception:
            pass

    gone, alive = psutil.wait_procs(processes, timeout=2)

    for proc in alive:
        try:
            proc.kill()
        except Exception:
            pass

    psutil.wait_procs(alive, timeout=1)


def _cleanup_test_runtime():
    """
    Best-effort cleanup for runaway subprocesses and worker state.
    This runs before and after each test, and also from the timeout handler.
    """
    try:
        terminate_all_subprocesses()
    except Exception:
        pass
    try:
        _kill_pytest_descendants()
    except Exception:
        pass
    try:
        clear_all_jobs()
    except Exception:
        pass
    try:
        clear_job_queue()
    except Exception:
        pass
    try:
        pause_flag.clear()
    except Exception:
        pass


def _timeout_handler(signum, frame):
    _cleanup_test_runtime()
    raise TimeoutError(f"pytest test exceeded {_ACTIVE_TIMEOUT_SECONDS} seconds")


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
    config.addinivalue_line("markers", "timeout(seconds): override the default per-test timeout in seconds")


def pytest_sessionstart(session):
    """
    Prevent overlapping pytest runs in the same repo from piling up worker threads
    and subprocesses, which can cause severe memory pressure.
    """
    global _PYTEST_LOCK_FILE
    if fcntl is None:
        return
    _PYTEST_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    _PYTEST_LOCK_FILE = open(_PYTEST_LOCK_PATH, "w")
    try:
        fcntl.flock(_PYTEST_LOCK_FILE.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        pytest.exit(
            f"Another pytest run already holds {_PYTEST_LOCK_PATH}. "
            "Wait for it to finish or remove the stale lock after confirming no pytest process is active.",
            returncode=2,
        )
    _PYTEST_LOCK_FILE.write(str(os.getpid()))
    _PYTEST_LOCK_FILE.flush()


def pytest_sessionfinish(session, exitstatus):
    _cleanup_test_runtime()
    global _PYTEST_LOCK_FILE
    if _PYTEST_LOCK_FILE is None or fcntl is None:
        return
    try:
        fcntl.flock(_PYTEST_LOCK_FILE.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
    try:
        _PYTEST_LOCK_FILE.close()
    finally:
        _PYTEST_LOCK_FILE = None


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_protocol(item, nextitem):
    """
    Fail a test if it stalls too long so hangs surface as actionable failures.
    """
    global _ACTIVE_TIMEOUT_SECONDS
    timeout_marker = item.get_closest_marker("timeout")
    timeout_seconds = _DEFAULT_TEST_TIMEOUT_SECONDS
    if timeout_marker and timeout_marker.args:
        timeout_seconds = int(timeout_marker.args[0])
    _ACTIVE_TIMEOUT_SECONDS = timeout_seconds

    if timeout_seconds <= 0 or not hasattr(signal, "SIGALRM"):
        yield
        return

    previous_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.setitimer(signal.ITIMER_REAL, timeout_seconds)
    faulthandler.dump_traceback_later(timeout_seconds, repeat=False)
    try:
        yield
    finally:
        faulthandler.cancel_dump_traceback_later()
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
        _ACTIVE_TIMEOUT_SECONDS = _DEFAULT_TEST_TIMEOUT_SECONDS

@pytest.fixture(autouse=True)
def clean_storage():
    """
    Ensures that every test starts with a fresh database and cleared state.
    Storage directory isolation is handled by session-wide environment variables.
    """
    _cleanup_test_runtime()

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
    _cleanup_test_runtime()


atexit.register(_cleanup_test_runtime)
