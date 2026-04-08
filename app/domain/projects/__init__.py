"""Project domain for Studio 2.0.

Owns project lifecycle, project-level defaults, snapshots, and export intent.
"""

from .models import ProjectExportManifestModel, ProjectModel, ProjectSnapshotModel
from .service import create_project_service

__all__ = [
    "ProjectExportManifestModel",
    "ProjectModel",
    "ProjectSnapshotModel",
    "create_project_service",
]
