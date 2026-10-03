import logging
import logging.handlers
import subprocess
import sys
from pathlib import Path

import pytest

from app.core import log_file


@pytest.fixture
def clean_logging():
    """Detach any handler the test installed so it never leaks to other tests."""
    yield
    log_file.teardown_file_logging()


def _flush():
    for h in logging.getLogger().handlers:
        h.flush()


def test_import_creates_no_handler_or_file(tmp_path):
    # Fresh interpreter: importing must not create handlers or files.
    code = (
        "import logging\n"
        "import app.core.log_file\n"
        "import app.core.boot\n"
        "assert not any(getattr(h, '_studio_file_log', False) for h in logging.getLogger().handlers)\n"
    )
    env = {"AUDIOBOOK_BASE_DIR": str(tmp_path), "PATH": "/usr/bin:/bin"}
    repo = Path(__file__).resolve().parents[2]
    subprocess.run([sys.executable, "-c", code], cwd=repo, env=env, check=True, timeout=60)
    assert not (tmp_path / "logs").exists()


def test_setup_writes_records_and_is_idempotent(tmp_path, clean_logging):
    p1 = log_file.setup_file_logging(log_dir=tmp_path / "logs")
    p2 = log_file.setup_file_logging(log_dir=tmp_path / "logs")
    assert p1 is not None and p1 == p2
    handlers = [h for h in logging.getLogger().handlers if getattr(h, "_studio_file_log", False)]
    assert len(handlers) == 1
    assert isinstance(handlers[0], logging.handlers.RotatingFileHandler)
    assert handlers[0].maxBytes > 0 and handlers[0].backupCount > 0

    logging.getLogger("app.somewhere").info("render started job=abc")
    _flush()
    text = p1.read_text(encoding="utf-8")
    assert text.count("render started job=abc") == 1


def test_secrets_are_redacted(tmp_path, clean_logging):
    path = log_file.setup_file_logging(log_dir=tmp_path / "logs")
    logging.getLogger("app.x").warning(
        "Authorization: Bearer sk-supersecret123 api_key=hunter2 x-api-key: abc999"
    )
    _flush()
    text = path.read_text(encoding="utf-8")
    for secret in ("sk-supersecret123", "hunter2", "abc999"):
        assert secret not in text
    assert "[REDACTED]" in text


def test_log_dir_failure_does_not_raise(tmp_path, clean_logging):
    blocker = tmp_path / "logs"
    blocker.write_text("i am a file, not a dir")
    assert log_file.setup_file_logging(log_dir=blocker) is None


def test_startup_event_attaches_file_logging_before_anything_else():
    """The log must exist before init_db/migrations so a crash there leaves a trace."""
    from unittest.mock import patch

    import app.api.web as web

    class _Stop(Exception):
        pass

    with patch("app.core.boot.boot_logging", side_effect=_Stop) as boot_log, \
         patch("app.api.web.init_db") as init_db:
        with pytest.raises(_Stop):
            web.startup_event()

    boot_log.assert_called_once()
    init_db.assert_not_called()


def _run_fresh(code, tmp_path):
    repo = Path(__file__).resolve().parents[2]
    env = {"AUDIOBOOK_BASE_DIR": str(tmp_path), "PATH": "/usr/bin:/bin"}
    return subprocess.run(
        [sys.executable, "-c", code], cwd=repo, env=env, capture_output=True, text=True, timeout=60, check=True
    )


def test_warnings_still_reach_the_console_and_uvicorn_errors_reach_the_file(tmp_path):
    """A root handler disables logging.lastResort, so the console must be kept explicitly."""
    code = (
        "import logging, logging.config, uvicorn.config\n"
        "logging.config.dictConfig(uvicorn.config.LOGGING_CONFIG)\n"  # uvicorn's non-propagating loggers
        "from app.core.log_file import setup_file_logging\n"
        "setup_file_logging(); setup_file_logging()\n"
        "logging.getLogger('app.x').warning('console-visible-warning')\n"
        "logging.getLogger('uvicorn.error').error('crash-traceback-marker')\n"
    )
    result = _run_fresh(code, tmp_path)
    assert result.stderr.count("console-visible-warning") == 1  # shown once, not duplicated
    log = (tmp_path / "logs" / "studio.log").read_text(encoding="utf-8")
    assert "console-visible-warning" in log
    assert "crash-traceback-marker" in log


def test_teardown_restores_root_level(tmp_path):
    root = logging.getLogger()
    before = root.level
    root.setLevel(logging.WARNING)
    try:
        log_file.setup_file_logging(log_dir=tmp_path / "logs")
        assert root.level == logging.INFO
        log_file.teardown_file_logging()
        assert root.level == logging.WARNING
    finally:
        root.setLevel(before)
