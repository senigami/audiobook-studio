"""Infrastructure DB boundary for Studio 2.0.

This package will hold persistence plumbing that repositories can depend on
without coupling domain code to legacy DB modules directly.
"""

INTENDED_UPSTREAM_CALLERS = (
    "app.domain.projects.repository",
    "app.domain.chapters.repository",
    "app.domain.voices.repository",
    "app.domain.settings.repository",
    "app.domain.artifacts.repository",
    "app.domain.jobs.repository",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = ()
FORBIDDEN_DIRECT_IMPORTS = (
    "app.api.routers",
    "app.orchestration",
    "app.engines",
)


def get_db_session():
    """Describe DB session acquisition for Studio 2.0 repositories.

    Returns:
        object: Placeholder DB session or connection handle.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
