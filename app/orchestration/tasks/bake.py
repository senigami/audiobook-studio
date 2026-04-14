"""Chapter bake task for Studio 2.0.

Provides finalization capabilities for chapters, such as MP3 conversion
and post-processing. Typically runs after a chapter has been assembled
into a single WAV file.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from .base import StudioTask, TaskContext, TaskResult

logger = logging.getLogger(__name__)


class BakeTask(StudioTask):
    """Finalizes chapter audio (Conversion/Post-processing)."""

    def __init__(
        self,
        *,
        task_id: str,
        input_path: Path,
        output_path: Path,
        project_id: str | None = None,
        chapter_id: str | None = None,
        make_mp3: bool = True,
    ) -> None:
        """Initialize the bake task.

        Args:
            task_id: Unique task identifier.
            input_path: Path to the source chapter WAV.
            output_path: Path where the baked output should be saved.
            project_id: Optional project ownership.
            chapter_id: Optional chapter ownership.
            make_mp3: If True, convert to MP3. If False, performs a 
                high-quality pass-through/normalization.
        """
        self.task_id = task_id
        self.input_path = input_path
        self.output_path = output_path
        self.project_id = project_id
        self.chapter_id = chapter_id
        self.make_mp3 = make_mp3
        self._submitted_at = time.monotonic()

    def validate(self) -> None:
        """Validate bake inputs."""
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.input_path:
            raise ValueError("input_path is required")
        if not self.output_path:
            raise ValueError("output_path is required")

    def describe(self) -> TaskContext:
        """Describe bake identity."""
        return TaskContext(
            task_id=self.task_id,
            task_type="bake",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            payload={
                "input_path": str(self.input_path),
                "output_path": str(self.output_path),
                "make_mp3": self.make_mp3,
            },
            submitted_at=self._submitted_at,
        )

    def run(self) -> TaskResult:
        """Execute bake via app.engines."""
        from app.engines import wav_to_mp3  # noqa: PLC0415

        if not self.input_path.exists():
            return TaskResult(
                status="failed", 
                message=f"Bake input file missing: {self.input_path}"
            )

        def on_output(line: str) -> None:
            if line.strip():
                logger.debug("[bake] %s", line.strip())

        try:
            if self.make_mp3:
                rc = wav_to_mp3(
                    in_wav=self.input_path,
                    out_mp3=self.output_path,
                    on_output=on_output,
                )
            else:
                # Pass-through / copy for now. Normalization logic will be added here
                # in future phases to keep this task class the owner of post-render polish.
                import shutil
                shutil.copy2(self.input_path, self.output_path)
                rc = 0

            if rc == 0 and self.output_path.exists():
                return TaskResult(status="completed")

            return TaskResult(
                status="failed",
                message=f"Bake operation failed with exit code {rc}",
            )
        except Exception as exc:
            logger.exception("BakeTask %s failed", self.task_id)
            return TaskResult(status="failed", message=str(exc))

    def on_cancel(self) -> None:
        """Cleanup partial output."""
        if self.output_path.exists():
            try:
                self.output_path.unlink()
            except OSError:
                pass
