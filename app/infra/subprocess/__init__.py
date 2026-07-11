"""Infrastructure subprocess boundary for Studio 2.0.

This package will hold safe wrappers for engine launches, ffmpeg, and other
external processes so engine adapters do not manage process details ad hoc.
"""

# Intentional plugin-boundary allowlist: installed plugin bundles are authorized to manage
# subprocess lifecycles for external engine binaries. Upstream: plugins.*, app.domain.artifacts.cache.
# No downstream deps. Must not import app.api.routers / app.domain.projects / app.domain.chapters
# directly.


def run_managed_subprocess(*, command: list[str], context: str) -> dict[str, object]:
    """Describe managed subprocess execution for Studio 2.0 infrastructure.

    Args:
        command: Fully assembled subprocess command.
        context: Human-readable execution context for logging and error
            reporting.

    Returns:
        dict[str, object]: Placeholder subprocess result payload.

    Raises:
        NotImplementedError: Subclasses must implement.
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
        NotImplementedError: Subclasses must implement.
    """
    _ = (command, context)
    raise NotImplementedError
