"""TTS Server package for Studio 2.0.

This package contains the FastAPI application that runs as a separate
subprocess alongside the main Studio process.  Studio communicates with the
TTS Server via HTTP over loopback.

Do not import Studio application modules (``app.api``, ``app.domain``,
``app.orchestration``, ``app.db``, etc.) from this package.  The TTS Server
must be fully self-contained so it can run in isolation.
"""
