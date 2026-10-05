from __future__ import annotations
import uuid
from pathlib import Path
from typing import Optional
from app.utils.pathing import secure_join_flat

class ProjectContext:
    """Represents a scoped project directory with helper methods for sub-assets."""

    def __init__(self, project_id: str, projects_root: Path):
        self.project_id = self._canonical_project_id(project_id)
        self.root = secure_join_flat(projects_root, self.project_id)

    def _canonical_project_id(self, project_id: str) -> str:
        from app.core import config
        if not project_id or not isinstance(project_id, str) or not config.SAFE_PROJECT_ID_RE.fullmatch(project_id):
            raise ValueError(f"Invalid project id: {project_id}")
        return project_id

    @property
    def m4b_dir(self) -> Path:
        return secure_join_flat(self.root, "m4b")

    @property
    def cover_dir(self) -> Path:
        return secure_join_flat(self.root, "cover")

    @property
    def trash_dir(self) -> Path:
        return secure_join_flat(self.root, "trash")

    @property
    def chapters_root(self) -> Path:
        return secure_join_flat(self.root, "chapters")

    def get_chapter_dir(self, chapter_id: str) -> Path:
        c_id = self._canonical_chapter_id(chapter_id)
        return secure_join_flat(self.chapters_root, c_id)

    def _canonical_chapter_id(self, chapter_id: str) -> str:
        from app.core import config
        # Reuse same safe pattern for now as chapters often use UUIDs but tests might use '999'
        if not chapter_id or not isinstance(chapter_id, str) or not config.SAFE_PROJECT_ID_RE.fullmatch(chapter_id):
            raise ValueError(f"Invalid chapter id: {chapter_id}")
        return chapter_id
