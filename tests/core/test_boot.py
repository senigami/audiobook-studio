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


def test_schema_migration_completes_before_startup_recovery_runs():
    """Regression test for #247.

    ``startup_event`` must finish applying pending schema migrations before
    ``run_startup_recovery`` resubmits interrupted jobs — otherwise a
    migration that reshapes segment state (like #232's) can run
    concurrently with a recovered job still holding pre-migration
    segment_ids, and with real traffic hitting chapter/segment routes.

    Uses a threading.Event rather than a sleep: the fake migration sets it,
    the fake recovery records whether it was already set at call time. This
    is deterministic regardless of scheduling, because pre-fix the
    migration only ever runs on a background thread that is started
    *after* recovery already ran synchronously — by the time recovery
    executes, that thread has not even been started yet.
    """
    import threading as threading_module
    import app.api.web as web

    migration_done = threading_module.Event()
    result = {"migration_done_when_recovery_ran": None}

    def fake_run_migrations(conn, migrations, db_path=None, dry_run=False):
        migration_done.set()
        return []

    def fake_run_startup_recovery(contexts):
        result["migration_done_when_recovery_ran"] = migration_done.is_set()

    with patch("app.db.migrations.runner.run_migrations", side_effect=fake_run_migrations), \
         patch("app.core.boot.run_startup_recovery", side_effect=fake_run_startup_recovery), \
         patch("app.engines.watchdog.start_watchdog"):
        web.startup_event()

        # Let the background Studio-2.0 boot thread (which also runs the
        # now-idempotent migration step) finish before the test exits, so it
        # doesn't outlive the mocks it's using.
        for t in threading_module.enumerate():
            if t.name == "StudioBoot":
                t.join(timeout=5)

    assert result["migration_done_when_recovery_ran"] is True, (
        "run_startup_recovery executed before the schema migration finished "
        "(or without a migration ever having run) — recovery must never "
        "resubmit jobs while a schema migration is in flight"
    )


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


