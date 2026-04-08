"""Project repository boundary.

Intended responsibility:
- hide persistence details from routes and orchestration
- expose project reads, writes, and snapshot operations

Legacy source of truth remains in the current DB modules for now.
"""

from typing import Protocol


class ProjectRepository(Protocol):
    """Persistence contract for project data."""

    def get(self, project_id: str): ...
    def save(self, project): ...

