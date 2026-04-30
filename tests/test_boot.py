import pytest
import os
from unittest.mock import MagicMock, patch
from app.boot import boot_studio, _booted

@pytest.fixture(autouse=True)
def reset_boot_flag():
    """Reset the global _booted flag before each test."""
    import app.boot
    app.boot._booted = False

def test_boot_studio_starts_watchdog_by_default(monkeypatch):
    """Verify that boot_studio() starts the watchdog when no env vars are set."""
    # Ensure environment is clean
    monkeypatch.delenv("USE_TTS_SERVER", raising=False)
    monkeypatch.delenv("USE_STUDIO_ORCHESTRATOR", raising=False)

    with patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_studio()
        mock_start.assert_called_once()

def test_boot_studio_respects_disable_override(monkeypatch):
    """Verify that boot_studio() does NOT start the watchdog when USE_TTS_SERVER=0."""
    monkeypatch.setenv("USE_TTS_SERVER", "0")

    with patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_studio()
        mock_start.assert_not_called()

def test_boot_studio_is_idempotent():
    """Verify that boot_studio() only performs the boot sequence once."""
    with patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_studio()
        boot_studio()
        mock_start.assert_called_once()

def test_boot_studio_handles_watchdog_failure(monkeypatch):
    """Verify that boot_studio() handles a failure in start_watchdog gracefully and sets fallback mode."""
    monkeypatch.setenv("USE_TTS_SERVER", "1")
    with patch("app.engines.watchdog.start_watchdog", side_effect=Exception("Watchdog crash")):
        boot_studio()
        assert os.environ.get("USE_TTS_SERVER") == "0"


def test_boot_tts_server_uses_repo_root_plugins_dir():
    """Verify the default TTS boot path resolves plugins from the repo root."""
    from app.boot import boot_tts_server
    from app.config import PLUGINS_DIR

    with patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_tts_server()

    mock_start.assert_called_once()
    assert mock_start.call_args.kwargs["plugins_dir"] == PLUGINS_DIR
