"""Project domain models.

Phase 1 note:
- This module is a contract scaffold, not a behavioral implementation.
- Legacy project behavior still comes from app.db and app.api.routers.projects.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ProjectModel:
    """Project-level metadata owned by the future project domain."""

    id: str
    name: str
    author: Optional[str] = None
    series: Optional[str] = None
    status: str = "draft"


@dataclass
class ProjectSnapshotModel:
    """Revision-safe project snapshot used for restore and export flows."""

    project_id: str
    revision_id: str
    chapter_ids: list[str] = field(default_factory=list)
    artifact_hashes: list[str] = field(default_factory=list)


@dataclass
class ProjectExportManifestModel:
    """Export intent payload describing what a project export should include."""

    project_id: str
    format_id: str
    chapter_ids: list[str] = field(default_factory=list)
    include_cover_art: bool = True
