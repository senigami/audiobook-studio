"""Studio 2.0 logging boundary.

This module will eventually provide structured logger setup for new modules so
logging concerns do not remain scattered through legacy helpers.
"""

# Upstream: app.api, app.orchestration, app.engines, app.infra. No downstream deps. Must not
# import app.domain directly.


def get_studio_logger(name: str):
    """Describe logger acquisition for Studio 2.0 modules.

    Args:
        name: Logger namespace requested by the caller.

    Returns:
        object: Placeholder logger instance.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = name
    raise NotImplementedError
