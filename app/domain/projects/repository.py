"""Project repository boundary.

Intended responsibility:
- hide persistence details from routes and orchestration
- expose project reads, writes, and snapshot operations

Legacy source of truth remains in the current DB modules for now.
"""

from typing import Iterable, Protocol

from .models import ProjectModel


class ProjectRepository(Protocol):
    """Persistence contract for project data."""

    def get(self, project_id: str) -> ProjectModel | None: ...
    def list_all(self) -> Iterable[ProjectModel]: ...
    def save(self, project: ProjectModel) -> ProjectModel: ...
    def delete(self, project_id: str) -> None: ...
