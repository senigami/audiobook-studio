import pytest
from unittest.mock import patch
from app.core.boot import boot_studio

@pytest.fixture(autouse=True)
def reset_boot_flag():
    """Reset the global _booted flag before each test."""
    import app.core.boot
    app.core.boot._booted = False

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


def test_boot_studio_aborts_on_schema_migration_failure():
    """A failed versioned schema migration must abort boot, not be swallowed.

    Replaces the old blanket ``except Exception: logger.exception(...)``
    around migration (#233) — boot must refuse to bring up the app on a
    half-migrated schema rather than boot anyway.
    """
    from app.db.migrations.runner import Migration, MigrationError

    def bad_up(conn):
        raise RuntimeError("simulated schema migration failure")

    bad_migration = Migration(version=999999, name="simulated_failure", up=bad_up)

    with patch("app.db.migrations.registry.MIGRATIONS", [bad_migration]), \
         patch("app.engines.watchdog.start_watchdog") as mock_start:
        with pytest.raises(MigrationError):
            boot_studio()

    # The TTS server must never start once schema migration has failed.
    mock_start.assert_not_called()
    # _booted must not be left permanently set — a fixed migration should be
    # able to retry on the next boot_studio() call.
    import app.core.boot
    assert app.core.boot._booted is False


def test_boot_tts_server_uses_repo_root_plugins_dir():
    """Verify the default TTS boot path resolves plugins from the repo root."""
    from app.core.boot import boot_tts_server
    from app.core.config import PLUGINS_DIR

    with patch("app.core.boot.cleanup_orphaned_tts_server_processes") as mock_cleanup, \
         patch("app.engines.watchdog.start_watchdog") as mock_start:
        boot_tts_server()

    mock_cleanup.assert_called_once()
    mock_start.assert_called_once()
    assert mock_start.call_args.kwargs["plugins_dir"] == PLUGINS_DIR


