"""Project export task for Studio 2.0.

Provides final audiobook assembly (M4B) for completed projects.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import List, Optional

from .base import StudioTask, TaskContext, TaskResult

logger = logging.getLogger(__name__)


class ExportTask(StudioTask):
    """Assembles a full project into a single M4B file."""

    def __init__(
        self,
        *,
        task_id: str,
        project_id: str,
        audio_dir: Path,
        output_file: Path,
        book_title: str,
        author: Optional[str] = None,
        narrator: Optional[str] = None,
        chapters: Optional[List[dict]] = None,
        cover_path: Optional[Path] = None,
    ) -> None:
        """Initialize the export task.

        Args:
            task_id: Unique task identifier.
            project_id: Project identifier.
            audio_dir: Path to the directory containing chapter audio.
            output_file: Final M4B output path.
            book_title: Metadata title.
            author: Metadata author.
            narrator: Metadata narrator.
            chapters: Optional list of chapter metadata for mapping logic.
            cover_path: Optional path to the cover image.
        """
        self.task_id = task_id
        self.project_id = project_id
        self.audio_dir = audio_dir
        self.output_file = output_file
        self.book_title = book_title
        self.author = author
        self.narrator = narrator
        self.chapters = chapters
        self.cover_path = cover_path
        self._submitted_at = time.monotonic()

    def validate(self) -> None:
        """Validate export inputs."""
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.project_id:
            raise ValueError("project_id is required")
        if not self.audio_dir:
            raise ValueError("audio_dir is required")
        if not self.output_file:
            raise ValueError("output_file is required")
        if not self.book_title:
            raise ValueError("book_title is required")

    def describe(self) -> TaskContext:
        """Describe export identity."""
        return TaskContext(
            task_id=self.task_id,
            task_type="export",
            project_id=self.project_id,
            payload={
                "book_title": self.book_title,
                "output_file": str(self.output_file),
            },
            submitted_at=self._submitted_at,
        )

    def run(self) -> TaskResult:
        """Execute assembly via app.engines."""
        from app.engines import assemble_audiobook  # noqa: PLC0415

        def on_output(line: str) -> None:
            if line.strip():
                logger.debug("[export] %s", line.strip())

        def cancel_check() -> bool:
            return False

        try:
            rc = assemble_audiobook(
                input_folder=self.audio_dir,
                book_title=self.book_title,
                output_m4b=self.output_file,
                on_output=on_output,
                cancel_check=cancel_check,
                author=self.author,
                narrator=self.narrator,
                chapters=self.chapters,
                cover_path=str(self.cover_path) if self.cover_path else None,
            )

            if rc == 0 and self.output_file.exists():
                return TaskResult(status="completed")

            return TaskResult(
                status="failed", 
                message=f"Audiobook assembly failed with exit code {rc}"
            )
        except Exception as exc:
            logger.exception("ExportTask %s failed", self.task_id)
            return TaskResult(status="failed", message=str(exc))

    def on_cancel(self) -> None:
        """Cleanup partial output."""
        if self.output_file.exists():
            try:
                self.output_file.unlink()
            except OSError:
                pass
