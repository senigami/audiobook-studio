"""Project repository boundary.

Intended responsibility:
- hide persistence details from routes and orchestration
- expose project reads, writes, and snapshot operations

Legacy source of truth remains in the current DB modules for now.
"""

from typing import Iterable, Protocol

from .models import ProjectModel, ProjectSnapshotModel


class ProjectRepository(Protocol):
    """Persistence contract for project data and snapshots."""

    def get(self, project_id: str) -> ProjectModel | None:
        """Load one project by stable project identifier."""

    def list_all(self) -> Iterable[ProjectModel]:
        """List all visible projects for library and picker views."""

    def save(self, project: ProjectModel) -> ProjectModel:
        """Persist project metadata changes and return the stored entity."""

    def delete(self, project_id: str) -> None:
        """Delete or archive a project by stable project identifier."""

    def get_snapshot(
        self, project_id: str, revision_id: str
    ) -> ProjectSnapshotModel | None:
        """Load a stored snapshot for a specific project revision."""

    def save_snapshot(
        self, snapshot: ProjectSnapshotModel
    ) -> ProjectSnapshotModel:
        """Persist a project snapshot and return the stored snapshot."""
