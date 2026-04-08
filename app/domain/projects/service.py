"""Project domain service.

This is where project creation, validation, defaults, and snapshot behavior
will eventually live.

For Phase 1, the module exists only to define the boundary.
"""

from .exports import build_project_export_manifest
from .repository import ProjectRepository
from .snapshots import build_project_snapshot


class ProjectService:
    """Placeholder service showing the intended project-domain entry points."""

    def __init__(self, repository: ProjectRepository):
        self.repository = repository

    def get_project(self, project_id: str):
        """Read a project through the domain boundary."""
        raise NotImplementedError("Studio 2.0 project reads are not implemented yet.")

    def create_snapshot(self, project_id: str):
        """Delegate snapshot building through the project domain."""
        _ = build_project_snapshot
        raise NotImplementedError("Studio 2.0 snapshot creation is not implemented yet.")

    def build_export_manifest(self, project_id: str):
        """Delegate export intent through the project domain."""
        _ = build_project_export_manifest
        raise NotImplementedError("Studio 2.0 export manifests are not implemented yet.")


def create_project_service(repository: ProjectRepository) -> ProjectService:
    """Factory for the future project domain service."""
    _ = repository
    raise NotImplementedError("Studio 2.0 project service is not implemented yet.")
