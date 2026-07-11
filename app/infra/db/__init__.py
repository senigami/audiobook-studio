"""Infrastructure DB boundary for Studio 2.0.

This package will hold persistence plumbing that repositories can depend on
without coupling domain code to legacy DB modules directly.
"""

# Upstream: app.domain.{projects,chapters,voices,settings,artifacts,jobs}.repository. No
# downstream deps. Must not import app.api.routers / app.orchestration / app.engines directly.


def get_db_session():
    """Describe DB session acquisition for Studio 2.0 repositories.

    Returns:
        object: Placeholder DB session or connection handle.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
