"""Mixed-engine synthesis task for Studio 2.0.

*TEMPORARY COMPATIBILITY ADAPTER*
This task intentionally circumvents the "thin-task" orchestration boundaries
to handle legacy mixed-engine chapters. By creating its own VoiceBridge and 
looping over multiple internal dispatch calls, it hides segment recovery and 
progress granularity from the orchestrator.

Do not use this as a model for new tasks. This is a stopgap for Phase 5 
parity until the UI is updated to dispatch mixed jobs as decomposed, 
atomic `SynthesisTask` units.
"""

from __future__ import annotations

import logging
import time
from typing import Any, List

from .base import StudioTask, TaskContext, TaskResult

logger = logging.getLogger(__name__)


class MixedSynthesisTask(StudioTask):
    """Temporary compatibility task for unstructured multi-engine chapters.

    Attributes:
        task_id: Stable unique identifier.
        chapter_id: Chapter identifier.
        segments: List of segment requests, each containing engine_id and text.
        project_id: Optional project ownership.
        requested_revision: Revision context for reconciliation.
    """

    def __init__(
        self,
        *,
        task_id: str,
        chapter_id: str,
        segments: List[dict[str, Any]],
        project_id: str | None = None,
        requested_revision: dict[str, Any] | None = None,
    ) -> None:
        """Initialize the mixed synthesis task.

        Args:
            task_id: Unique task identifier.
            chapter_id: Chapter identifier.
            segments: List of segment dictionaries. Each must contain 
                'engine_id', 'script_text', and 'output_path'.
            project_id: Optional project identifier.
            requested_revision: Optional reconciliation context.
        """
        self.task_id = task_id
        self.chapter_id = chapter_id
        self.segments = segments
        self.project_id = project_id
        self.requested_revision = requested_revision or {}
        self._submitted_at = time.monotonic()

    def validate(self) -> None:
        """Validate mixed synthesis inputs."""
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.chapter_id:
            raise ValueError("chapter_id is required")
        if not self.segments:
            raise ValueError("segments list cannot be empty")

        for i, seg in enumerate(self.segments):
            if "engine_id" not in seg:
                raise ValueError(f"Segment {i} missing engine_id")
            if "script_text" not in seg:
                raise ValueError(f"Segment {i} missing script_text")
            if "output_path" not in seg:
                raise ValueError(f"Segment {i} missing output_path")

    def describe(self) -> TaskContext:
        """Describe mixed synthesis identity."""
        return TaskContext(
            task_id=self.task_id,
            task_type="mixed_synthesis",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            payload={
                "segment_count": len(self.segments),
                "segments": self.segments,
                "requested_revision": self.requested_revision,
            },
            submitted_at=self._submitted_at,
        )

    @classmethod
    def from_task_context(cls, ctx: TaskContext) -> "MixedSynthesisTask":
        """Reconstruct a MixedSynthesisTask from a recovered TaskContext.

        Args:
            ctx: Recovered task context from the scheduler recovery path.

        Returns:
            MixedSynthesisTask: Reconstructed task.
        """
        payload = ctx.payload or {}
        return cls(
            task_id=ctx.task_id,
            chapter_id=str(ctx.chapter_id or ""),
            segments=payload.get("segments", []),
            project_id=ctx.project_id,
            requested_revision=payload.get("requested_revision"),
        )

    def run(self) -> TaskResult:
        """Execute sequential synthesis for mixed segments.

        .. note::
           This task performs individual synthesis calls via the VoiceBridge.
           It is intended for chapter-level 'Mixed' jobs that have not been
           decomposed into atomic SynthesisTasks by the Orchestrator.
        """
        # In Studio 2.0, the Orchestrator owns the bridge. 
        # Since this task performs *multiple* calls, it creates its own 
        # bridge instance (as a self-contained fallback, similar to SynthesisTask.run).
        from app.engines.bridge import create_voice_bridge  # noqa: PLC0415

        bridge = create_voice_bridge()

        try:
            for seg in self.segments:
                # Build canonical bridge request
                request = {
                    "engine_id": seg["engine_id"],
                    "script_text": seg["script_text"],
                    "output_path": seg["output_path"],
                    "reference_audio_path": seg.get("reference_audio_path"),
                    "voice_profile_id": seg.get("voice_profile_id"),
                    "language": seg.get("language", "en"),
                }

                result = bridge.synthesize(request)
                if result.get("status") != "ok":
                    return TaskResult(
                        status="failed", 
                        message=f"Segment synthesis failed: {result.get('message')}"
                    )

            return TaskResult(status="completed")

        except Exception as exc:
            logger.exception("MixedSynthesisTask %s failed", self.task_id)
            from app.engines.bridge_remote import EngineUnavailableError
            is_retriable = isinstance(exc, EngineUnavailableError)
            return TaskResult(status="failed", message=str(exc), retriable=is_retriable)

    def on_cancel(self) -> None:
        """Release multi-engine resources."""
        # Individual synthesis cancellation is handled by the TTS Server/watchdog.
        pass
