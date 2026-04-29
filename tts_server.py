"""TTS Server entry point.

Usage:
    python -u tts_server.py [--port PORT] [--plugins-dir PATH] [--host HOST]

This script is the subprocess spawned by Studio.  When the server is ready to
accept connections it prints ``READY:{port}`` to stdout so the Studio watchdog
knows the startup sequence completed.
"""

from __future__ import annotations

import argparse
import logging
import signal
import socket
import sys
from pathlib import Path

import uvicorn

from app.config import PLUGINS_DIR

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] tts-server %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger("tts_server")


def _find_available_port(start: int, end: int, host: str) -> int:
    """Return the first available TCP port in [start, end].

    Args:
        start: First port to try.
        end: Last port to try.
        host: Bind address to test.

    Returns:
        int: Available port.

    Raises:
        RuntimeError: If no port in the range is available.
    """
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                continue
    raise RuntimeError(
        f"No available port found in range {start}–{end} on {host}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Studio TTS Server — managed subprocess for speech synthesis"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=7862,
        help="Port to listen on (default: 7862, auto-increments if taken)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--plugins-dir",
        type=Path,
        default=PLUGINS_DIR,
        help="Path to the plugins directory (default: repo-root plugins/)",
    )
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip verification synthesis on startup (useful for development)",
    )
    parser.add_argument(
        "--port-range",
        type=int,
        default=10,
        help="Number of ports to try if requested port is taken (default: 10)",
    )
    args = parser.parse_args()

    # Resolve the plugins directory to an absolute repo-root path.
    plugins_dir = args.plugins_dir.resolve()

    # Find an available port.
    try:
        port = _find_available_port(
            args.port,
            args.port + args.port_range - 1,
            args.host,
        )
    except RuntimeError as exc:
        logger.error("Could not bind: %s", exc)
        sys.exit(1)

    if port != args.port:
        logger.info("Requested port %d was taken; using %d instead", args.port, port)

    # Import the app here (after arg parsing) to avoid unnecessary import-time
    # side effects during --help or argument errors.
    from app.tts_server.server import app, load_plugins  # noqa: PLC0415

    if not args.no_verify:
        load_plugins(plugins_dir)
    else:
        logger.info("Skipping plugin verification (--no-verify)")
        from app.tts_server.plugin_loader import discover_plugins  # noqa: PLC0415
        from app.tts_server.server import _state_lock, _plugins  # noqa: PLC0415, F401
        discovered = discover_plugins(plugins_dir)
        # Mark plugins as verified without running synthesis so tools like
        # development environments can start without GPU.
        for p in discovered:
            p.verified = True
        import app.tts_server.server as _srv  # noqa: PLC0415
        with _state_lock:
            _srv._plugins = discovered
            _srv._plugins_dir = plugins_dir

    # Graceful shutdown handler.
    def _handle_shutdown(signum, frame):
        logger.info("Received signal %d — shutting down", signum)
        from app.tts_server.server import _state_lock, _plugins  # noqa: PLC0415, F811
        import app.tts_server.server as _srv2  # noqa: PLC0415
        with _state_lock:
            plugins = list(_srv2._plugins)
        for plugin in plugins:
            try:
                plugin.engine.shutdown()
                logger.debug("Shutdown %s", plugin.folder_name)
            except Exception:
                pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    # Print the READY signal BEFORE starting uvicorn so the Studio watchdog
    # can begin polling.  The actual port is embedded so the watchdog knows
    # which port to use when it queries /health.
    print(f"READY:{port}", flush=True)
    logger.info("TTS Server starting on %s:%d", args.host, port)

    # Run the server — this call blocks until the server exits.
    uvicorn.run(
        app,
        host=args.host,
        port=port,
        log_level="warning",  # uvicorn's own logs go to stderr
        access_log=False,
    )


if __name__ == "__main__":
    main()
