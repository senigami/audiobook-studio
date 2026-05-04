"""Assembly task for Studio 2.0.

Provides batch-merging capabilities for chapters. This task typically runs
after all synthesis batches for a chapter have completed.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import List

from .base import StudioTask, TaskContext, TaskResult

logger = logging.getLogger(__name__)


class AssemblyTask(StudioTask):
    """Assembles audio (merges segments into chapters, or chapters into audiobooks)."""

    def __init__(
        self,
        *,
        task_id: str,
        output_path: Path,
        segment_paths: List[Path] | None = None,
        project_id: str | None = None,
        chapter_id: str | None = None,
        # Audiobook specific fields
        is_audiobook: bool = False,
        book_title: str | None = None,
        author: str | None = None,
        narrator: str | None = None,
        chapters: List[dict] | None = None,
        cover_path: Path | None = None,
    ) -> None:
        """Initialize the assembly task.

        Args:
            task_id: Unique task identifier.
            output_path: Absolute path where the merged file should be saved.
            segment_paths: Ordered list of absolute paths to audio segments to merge (for chapters).
            project_id: Optional project ownership.
            chapter_id: Optional chapter ownership.
            is_audiobook: If True, performs full M4B assembly with metadata.
            book_title: Metadata title (for audiobooks).
            author: Metadata author (for audiobooks).
            narrator: Metadata narrator (for audiobooks).
            chapters: List of chapter metadata {filename, title} (for audiobooks).
            cover_path: Path to the cover image (for audiobooks).
        """
        self.task_id = task_id
        self.output_path = output_path
        self.segment_paths = segment_paths or []
        self.project_id = project_id
        self.chapter_id = chapter_id
        self.is_audiobook = is_audiobook
        self.book_title = book_title
        self.author = author
        self.narrator = narrator
        self.chapters = chapters
        self.cover_path = cover_path
        self._submitted_at = time.monotonic()

    def validate(self) -> None:
        """Validate assembly inputs."""
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.output_path:
            raise ValueError("output_path is required")

        if self.is_audiobook:
            if not self.book_title:
                raise ValueError("book_title is required for audiobook assembly")
        else:
            if not self.segment_paths:
                raise ValueError("segment_paths list cannot be empty for chapter assembly")
            for p in self.segment_paths:
                if not p.exists():
                    raise FileNotFoundError(f"Assembly segment missing: {p}")

    def describe(self) -> TaskContext:
        """Describe assembly identity."""
        payload = {
            "output_path": str(self.output_path),
            "is_audiobook": self.is_audiobook,
            "segment_paths": [str(p) for p in self.segment_paths],
            "book_title": self.book_title,
            "author": self.author,
            "narrator": self.narrator,
            "chapters": self.chapters,
            "cover_path": str(self.cover_path) if self.cover_path else None,
        }
        if not self.is_audiobook:
            payload["segment_count"] = len(self.segment_paths)

        return TaskContext(
            task_id=self.task_id,
            task_type="assembly",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            payload=payload,
            submitted_at=self._submitted_at,
        )

    @classmethod
    def from_task_context(cls, context: TaskContext) -> AssemblyTask:
        """Reconstruct task from context."""
        payload = context.payload or {}
        return cls(
            task_id=context.task_id,
            output_path=Path(payload["output_path"]),
            segment_paths=[Path(p) for p in payload.get("segment_paths", [])],
            project_id=context.project_id,
            chapter_id=context.chapter_id,
            is_audiobook=payload.get("is_audiobook", False),
            book_title=payload.get("book_title"),
            author=payload.get("author"),
            narrator=payload.get("narrator"),
            chapters=payload.get("chapters"),
            cover_path=Path(payload["cover_path"]) if payload.get("cover_path") else None,
        )

    def run(self) -> TaskResult:
        """Execute assembly via app.engines."""
        def on_output(line: str) -> None:
            if line.strip():
                logger.debug("[assembly] %s", line.strip())

        def cancel_check() -> bool:
            return False

        try:
            if self.is_audiobook:
                from app.engines.audiobook_utils import assemble_audiobook  # noqa: PLC0415
                input_folder = self.output_path.parent
                rc = assemble_audiobook(
                    input_folder=input_folder,
                    book_title=self.book_title or "Untitled",
                    output_m4b=self.output_path,
                    on_output=on_output,
                    cancel_check=cancel_check,
                    author=self.author,
                    narrator=self.narrator,
                    chapters=self.chapters,
                    cover_path=str(self.cover_path) if self.cover_path else None,
                )
            else:
                from app.engines.audio_ops import stitch_segments  # noqa: PLC0415
                rc = stitch_segments(
                    pdir=self.output_path.parent,
                    segment_wavs=self.segment_paths,
                    output_path=self.output_path,
                    on_output=on_output,
                    cancel_check=cancel_check,
                )

            if rc == 0 and self.output_path.exists():
                return TaskResult(status="completed")

            return TaskResult(
                status="failed",
                message=f"Assembly failed with exit code {rc}",
            )
        except Exception as exc:
            logger.exception("AssemblyTask %s failed", self.task_id)
            return TaskResult(status="failed", message=str(exc))

    def on_cancel(self) -> None:
        """Cleanup partial output."""
        if self.output_path.exists():
            try:
                self.output_path.unlink()
            except OSError:
                pass
