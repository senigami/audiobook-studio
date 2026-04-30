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
    """Merges multiple audio segments (batches) into a single chapter file."""

    def __init__(
        self,
        *,
        task_id: str,
        segment_paths: List[Path],
        output_path: Path,
        project_id: str | None = None,
        chapter_id: str | None = None,
    ) -> None:
        """Initialize the assembly task.

        Args:
            task_id: Unique task identifier.
            segment_paths: Ordered list of absolute paths to audio segments to merge.
            output_path: Absolute path where the merged file should be saved.
            project_id: Optional project ownership.
            chapter_id: Optional chapter ownership.
        """
        self.task_id = task_id
        self.segment_paths = segment_paths
        self.output_path = output_path
        self.project_id = project_id
        self.chapter_id = chapter_id
        self._submitted_at = time.monotonic()

    def validate(self) -> None:
        """Validate assembly inputs."""
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.segment_paths:
            raise ValueError("segment_paths list cannot be empty")
        if not self.output_path:
            raise ValueError("output_path is required")

        # Ensure all segments exist (fail fast before scheduling if possible, 
        # though orchestrator might check again).
        for p in self.segment_paths:
            if not p.exists():
                raise FileNotFoundError(f"Assembly segment missing: {p}")

    def describe(self) -> TaskContext:
        """Describe assembly identity."""
        return TaskContext(
            task_id=self.task_id,
            task_type="assembly",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            payload={
                "segment_count": len(self.segment_paths),
                "output_path": str(self.output_path),
            },
            submitted_at=self._submitted_at,
        )

    def run(self) -> TaskResult:
        """Execute stitching via app.engines."""
        from app.engines import stitch_segments  # noqa: PLC0415

        def on_output(line: str) -> None:
            # We don't have a progress broadcaster in the task body,
            # but we can log for debug.
            if line.strip():
                logger.debug("[assembly] %s", line.strip())

        def cancel_check() -> bool:
            # Task body doesn't own cancellation polling; the orchestrator
            # will kill the thread/process if cancelled.
            return False

        try:
            # stitch_segments uses ffmpeg concat
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
                message=f"FFmpeg assembly failed with exit code {rc}",
            )
        except Exception as exc:
            logger.exception("AssemblyTask %s failed", self.task_id)
            return TaskResult(status="failed", message=str(exc))

    def on_cancel(self) -> None:
        """Cleanup partial output if necessary."""
        # Note: stitch_segments sub-commands are killed by the watchdog or 
        # process manager. We just ensure we don't leave a half-baked file 
        # if easy to do so.
        if self.output_path.exists():
            try:
                self.output_path.unlink()
            except OSError:
                pass
