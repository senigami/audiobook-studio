"""Project domain for Studio 2.0.

Owns project lifecycle, project-level defaults, snapshots, and export intent.
"""

from .models import ProjectModel
from .service import create_project_service

__all__ = ["ProjectModel", "create_project_service"]
