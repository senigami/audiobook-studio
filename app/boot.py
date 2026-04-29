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
    from app.boot import boot_studio
    boot_studio()

    # In test fixtures that need the TTS Server:
    from app.boot import boot_tts_server
    boot_tts_server()
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.config import PLUGINS_DIR

logger = logging.getLogger(__name__)

_booted = False


def boot_studio() -> None:
    """Run the full Studio 2.0 boot sequence.

    Idempotent — safe to call multiple times.  Starts feature-flagged
    subsystems based on environment variables:

    - ``USE_TTS_SERVER=0``: Disables the TTS Server watchdog (emergency fallback)
    - ``USE_STUDIO_ORCHESTRATOR=0``: Disables the 2.0 orchestrator (emergency fallback)
    """
    global _booted  # noqa: PLW0603

    if _booted:
        return
    _booted = True

    from app.core.feature_flags import use_tts_server  # noqa: PLC0415

    if use_tts_server():
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
        plugins_dir: Path to the plugins directory (default: ``./plugins``).
        port: Starting port number (default: 7862).
        host: Bind address (default: 127.0.0.1).
    """
    try:
        from app.engines.watchdog import start_watchdog  # noqa: PLC0415

        start_watchdog(
            plugins_dir=plugins_dir or PLUGINS_DIR,
            port=port,
            host=host,
        )
        logger.info("TTS Server watchdog started via boot sequence.")
    except Exception:
        import os
        os.environ["USE_TTS_SERVER"] = "0"
        logger.exception(
            "TTS Server watchdog failed to start during boot. "
            "Synthesis will fall back to the legacy in-process path."
        )
