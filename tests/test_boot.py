import pytest
from unittest.mock import patch
from app.boot import boot_studio

@pytest.fixture(autouse=True)
def reset_boot_flag():
    """Reset the global _booted flag before each test."""
    import app.boot
    app.boot._booted = False

def test_boot_studio_starts_watchdog_by_default():
    """Verify that boot_studio() always starts the watchdog."""
    with patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_studio()
        mock_start.assert_called_once()

def test_boot_studio_is_idempotent():
    """Verify that boot_studio() only performs the boot sequence once."""
    with patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_studio()
        boot_studio()
        mock_start.assert_called_once()

def test_boot_studio_handles_watchdog_failure():
    """Verify that boot_studio() handles watchdog startup failure gracefully."""
    with patch("app.engines.watchdog.start_watchdog", side_effect=Exception("Watchdog crash")) as mock_start:
        boot_studio()
        mock_start.assert_called_once()


def test_boot_tts_server_uses_repo_root_plugins_dir():
    """Verify the default TTS boot path resolves plugins from the repo root."""
    from app.boot import boot_tts_server
    from app.config import PLUGINS_DIR

    with patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_tts_server()

    mock_start.assert_called_once()
    assert mock_start.call_args.kwargs["plugins_dir"] == PLUGINS_DIR
