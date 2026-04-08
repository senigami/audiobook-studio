"""Project snapshot helpers.

Snapshots will record the project state needed for safe reload, export, and
restore flows.
"""


def build_project_snapshot(*args, **kwargs):
    """Placeholder snapshot builder."""
    raise NotImplementedError


def validate_project_snapshot(*args, **kwargs):
    """Placeholder snapshot validator."""
    raise NotImplementedError
