"""Project domain models.

This module will define project-level entities such as Project, ProjectSnapshot,
and export-related metadata.

Phase 1 note:
- This is scaffold only.
- Legacy project behavior still comes from app.db and app.api.routers.projects.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ProjectModel:
    """Placeholder for the long-term project entity."""

    id: str
    name: str
    author: Optional[str] = None
    series: Optional[str] = None

