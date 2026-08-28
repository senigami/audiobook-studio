"""Studio 2.0 boot sequence.

This module owns the explicit startup wiring for Studio 2.0 subsystems.
Entry points (Gradio app, CLI tools, test fixtures) call ``boot_studio()``
to start any feature-flagged subsystems.

**Why this exists**: The modular architecture rules prohibit import-time
side effects — importing a module must not start threads, mutate global
settings, or reconcile persistent state.  This module provides the single
explicit call site where those side effects are allowed.

Usage::

    # In the main app entry point (e.g. app/web.py or run.py):
    from app.core.boot import boot_studio
    boot_studio()

    # In test fixtures that need the TTS Server:
    from app.core.boot import boot_tts_server
    boot_tts_server()
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import PLUGINS_DIR, BASE_DIR
from app.engines.proc_utils import cleanup_orphaned_tts_server_processes

logger = logging.getLogger(__name__)

_booted = False


def run_startup_recovery(recovery_contexts: list) -> None:
    """Re-submit interrupted tasks that were snapshotted before reconciliation.

    This helper is called from the web.py startup sequence *after*
    reconciliation and job-listener registration, so recovery progress events
    reach the UI.  It is factored out here (boot.py) so tests can invoke it
    directly without spinning uvicorn.

    The ``recovery_contexts`` list must be captured *before* the stuck-job
    clearing step so that evidence of interrupted work is not lost.

    Controlled by the ``STUDIO_RECOVER_ON_STARTUP`` env var (default "1").
    Set to "0" to disable.

    Args:
        recovery_contexts: Pre-snapshotted list of ``TaskContext`` objects.
    """
    import os  # noqa: PLC0415

    enabled = os.environ.get("STUDIO_RECOVER_ON_STARTUP", "1") != "0"
    if not enabled:
        logger.info("Startup: Task recovery disabled (STUDIO_RECOVER_ON_STARTUP=0).")
        return

    if not recovery_contexts:
        logger.info("Startup: No interrupted task(s) to recover.")
        return

    try:
        from app.orchestration.scheduler.orchestrator import create_orchestrator  # noqa: PLC0415
        orchestrator = create_orchestrator()
        recovered = orchestrator.recover(contexts=recovery_contexts)
        logger.info("Startup: recovered %d interrupted task(s).", len(recovered))
    except Exception:
        logger.warning(
            "Startup Warning: Task recovery failed — interrupted tasks will not be resumed.",
            exc_info=True,
        )


def boot_studio() -> None:
    """Run the full Studio 2.0 boot sequence.

    Idempotent — safe to call multiple times. Starts the Studio 2.0
    TTS Server watchdog explicitly from the app entry point.
    """
    global _booted  # noqa: PLW0603

    if _booted:
        return

    # 1a. Run the versioned schema-migration runner. Unlike the legacy
    # data migrations below, a failure here is NOT swallowed: booting on a
    # half-migrated schema is worse than refusing to boot at all (#233).
    # _booted is deliberately left False on failure so a fixed migration
    # can be retried by calling boot_studio() again.
    from app.db.migrations.registry import MIGRATIONS  # noqa: PLC0415
    from app.db.migrations.runner import run_migrations  # noqa: PLC0415
    from app.db.core import get_connection, get_db_path  # noqa: PLC0415

    conn = get_connection()
    try:
        run_migrations(conn, MIGRATIONS, db_path=get_db_path())
    finally:
        conn.close()

    _booted = True

    # 1b. Run legacy one-shot data migrations (v1 -> v2 state.json import
    # etc.) These remain self-guarding/idempotent and best-effort; they are
    # not part of the versioned schema-migration runner above.
    try:
        from app.db.migration import migrate_state_json_to_db  # noqa: PLC0415
        migrate_state_json_to_db()
    except Exception:
        logger.exception("Database migration failed during boot sequence.")

    # 2. Initialize job handlers
    try:
        from app.jobs.registry import initialize_default_handlers  # noqa: PLC0415
        initialize_default_handlers()
    except Exception:
        logger.exception("Job handler initialization failed during boot.")

    # 3. Install the ProgressService singleton (idempotent — no-op if already set).
    try:
        from app.orchestration.progress.service import (  # noqa: PLC0415
            create_progress_service,
            get_progress_service,
            set_progress_service,
        )
        existing = get_progress_service()
        # get_progress_service() lazily creates an instance; if it was already
        # installed by a prior boot_studio() call the singleton is unchanged.
        # If it was newly created by the lazy path we've now installed it.
        # Either way, ensure it is registered.
        set_progress_service(existing)
    except Exception:
        logger.exception("ProgressService singleton installation failed during boot.")

    # 4. Start services
    boot_tts_server()


def boot_tts_server(
    *,
    plugins_dir: Path | None = None,
    port: int = 7862,
    host: str = "127.0.0.1",
) -> None:
    """Start the TTS Server watchdog.

    This function is the **only** place where the watchdog subprocess is
    started.  It must be called from an explicit app entry point, never
    from module import time.

    Args:
        plugins_dir: Path to the engine plugins directory (default: ``./tts_engines``).
        port: Starting port number (default: 7862).
        host: Bind address (default: 127.0.0.1).
    """
    try:
        cleanup_orphaned_tts_server_processes(
            server_script=BASE_DIR / "tts_server.py",
            plugins_dir=plugins_dir or PLUGINS_DIR,
        )
        from app.engines.watchdog import start_watchdog  # noqa: PLC0415

        start_watchdog(
            plugins_dir=plugins_dir or PLUGINS_DIR,
            port=port,
            host=host,
        )
        logger.info("TTS Server watchdog started via boot sequence.")
    except Exception:
        logger.exception(
            "TTS Server watchdog failed to start during boot. "
            "TTS services will be unavailable."
        )
