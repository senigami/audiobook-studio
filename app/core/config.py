"""Studio 2.0 config boundary.

This module will eventually centralize configuration reads for the new
architecture so domain, orchestration, and engine layers do not pull settings
directly from legacy globals.
"""

INTENDED_UPSTREAM_CALLERS = (
    "app.core.feature_flags",
    "app.orchestration",
    "app.engines",
    "app.api.deps",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = ()
FORBIDDEN_DIRECT_IMPORTS = (
    "app.domain",
    "app.jobs",
)


def load_studio_config() -> dict[str, object]:
    """Describe configuration loading for Studio 2.0 boundaries.

    Returns:
        dict[str, object]: Normalized configuration values for the new
        architecture.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
