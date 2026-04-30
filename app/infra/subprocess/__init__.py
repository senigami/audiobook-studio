"""Infrastructure subprocess boundary for Studio 2.0.

This package will hold safe wrappers for engine launches, ffmpeg, and other
external processes so engine adapters do not manage process details ad hoc.
"""

INTENDED_UPSTREAM_CALLERS = (
    "app.engines.voice.xtts.engine",
    "app.engines.voice.voxtral.engine",
    "app.domain.artifacts.cache",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = ()
FORBIDDEN_DIRECT_IMPORTS = (
    "app.api.routers",
    "app.domain.projects",
    "app.domain.chapters",
)


def run_managed_subprocess(*, command: list[str], context: str) -> dict[str, object]:
    """Describe managed subprocess execution for Studio 2.0 infrastructure.

    Args:
        command: Fully assembled subprocess command.
        context: Human-readable execution context for logging and error
            reporting.

    Returns:
        dict[str, object]: Placeholder subprocess result payload.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (command, context)
    raise NotImplementedError


def run_managed_subprocess_async(
    *, command: list[str], context: str
) -> dict[str, object]:
    """Describe non-blocking subprocess execution for async-facing callers.

    Args:
        command: Fully assembled subprocess command.
        context: Human-readable execution context for logging and error
            reporting.

    Returns:
        dict[str, object]: Placeholder subprocess result payload.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (command, context)
    raise NotImplementedError
