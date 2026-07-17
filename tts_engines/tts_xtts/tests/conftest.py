"""Plugin-local conftest so the XTTS test suite can run standalone.

In-tree, the repo-root ``conftest.py`` loads first and sets all of these
environment variables unconditionally, so every ``setdefault`` below is a
no-op — in-tree behavior is unchanged. Standalone (``cd tts_engines/tts_xtts
&& pytest tests``), this provides the same storage/DB isolation the root
conftest would: everything is redirected into a session temp dir before any
host module is imported.

R2 note: nothing here mocks plugin internals — this is environment isolation
at the host/filesystem boundary only.
"""

from __future__ import annotations

import atexit
import os
import tempfile
from pathlib import Path

import pytest

# True only when the repo-root conftest did NOT run first (standalone mode).
# In-tree, pytest loads the root conftest before this one and it sets
# AUDIOBOOK_BASE_DIR unconditionally, so all standalone-only fixtures below
# become no-ops and in-tree behavior is byte-identical.
_STANDALONE = "AUDIOBOOK_BASE_DIR" not in os.environ

_temp_dir = tempfile.TemporaryDirectory(prefix="xtts-plugin-tests-")
atexit.register(_temp_dir.cleanup)
_SESSION_TEMP = Path(_temp_dir.name)

os.environ.setdefault("AUDIOBOOK_BASE_DIR", str(_SESSION_TEMP))
os.environ.setdefault("APP_TEST_MODE", "1")
# Prevent the warm-worker subprocess path in unit tests (root conftest does the same).
os.environ.setdefault("XTTS_WARM_WORKER_DISABLED", "1")
os.environ.setdefault("DB_PATH", str(_SESSION_TEMP / "test_audiobook_studio.db"))
os.environ.setdefault("STUDIO_DB_PATH", str(_SESSION_TEMP / "test_studio.db"))
os.environ.setdefault("STATE_FILE", str(_SESSION_TEMP / "test_state.json"))
os.environ.setdefault("UPLOAD_DIR", str(_SESSION_TEMP / "uploads"))
os.environ.setdefault("REPORT_DIR", str(_SESSION_TEMP / "reports"))
os.environ.setdefault("VOICES_DIR", str(_SESSION_TEMP / "voices"))
os.environ.setdefault("COVER_DIR", str(_SESSION_TEMP / "uploads/covers"))
os.environ.setdefault("PROJECTS_DIR", str(_SESSION_TEMP / "projects"))

os.environ.setdefault("PLUGINS_DIR", str(Path(__file__).resolve().parents[2]))

for _d in ("uploads", "reports", "voices", "uploads/covers", "projects"):
    (_SESSION_TEMP / _d).mkdir(parents=True, exist_ok=True)


@pytest.fixture(autouse=True)
def _standalone_host_isolation(monkeypatch):
    """Standalone-only: minimal host isolation the root conftest provides in-tree.

    - Initializes/resets the (temp) Studio DB so host-integration handler tests
      that touch ``app.db`` find their tables.
    - Forces a healthy mocked TTS Server watchdog/client so nothing tries to
      spawn or reach a real server (R2: mock at the process/network boundary).

    No-op in-tree (root conftest owns this there). If the Studio host package
    is not importable at all, host-integration tests will fail on their own
    fn-body ``app.*`` imports; this fixture just degrades silently.
    """
    if not _STANDALONE:
        yield
        return

    try:
        from unittest.mock import MagicMock

        from app.db import init_db
        from app.db.state import clear_all_jobs
        import app.engines.watchdog as _watchdog_mod
        import app.engines.registry as _registry_mod
    except ImportError:
        yield
        return

    init_db()
    clear_all_jobs()

    _registry_mod._remote_cache = None
    mock_watchdog = MagicMock()
    mock_watchdog.is_healthy.return_value = True
    mock_watchdog.is_circuit_open.return_value = False
    mock_watchdog.get_url.return_value = "http://127.0.0.1:7862"
    mock_client = MagicMock()
    mock_client.ping.return_value = True
    mock_watchdog.get_client.return_value = mock_client

    original_watchdog = _watchdog_mod._global_watchdog
    _watchdog_mod._global_watchdog = mock_watchdog
    monkeypatch.setattr("app.engines.watchdog.get_watchdog", lambda: mock_watchdog)
    monkeypatch.setattr("app.engines.registry.get_watchdog", lambda: mock_watchdog)
    try:
        yield
    finally:
        _watchdog_mod._global_watchdog = original_watchdog
        clear_all_jobs()
