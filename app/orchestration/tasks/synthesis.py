"""Standard synthesis task for Studio 2.0.

Represents a single unit of Studio-originated synthesis work — one render
batch, one chapter segment, or one block of script text.

This is the primary task type the orchestrator dispatches for Studio UI
synthesis requests.  It is distinct from ``ApiSynthesisTask`` which represents
externally-submitted API requests.

Orchestration contract
----------------------
The orchestrator must NOT be called from inside ``run()``.  The task body is
responsible only for synthesis execution.  Progress publication, reconciliation,
and resource management are all the orchestrator's responsibility.
"""

from __future__ import annotations

import time
from typing import Any

from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult


class SynthesisTask(StudioTask):
    """Queueable synthesis task for one Studio render unit.

    A "render unit" is typically one render batch (a group of script blocks
    assigned to one speaker/engine pass).  The orchestrator reconciles the
    full chapter scope and creates one ``SynthesisTask`` per batch that needs
    rendering.

    Attributes:
        task_id: Stable unique identifier (typically the DB job UUID).
        engine_id: Target TTS engine identifier.
        script_text: The text to synthesize for this batch.
        output_path: Absolute path where the audio file should be written.
        project_id: Owning project identifier.
        chapter_id: Owning chapter identifier.
        voice_ref: Optional reference audio path (used by voice-cloning engines).
        language: BCP-47 language code.
        resource_claim: Hardware requirements declared to the scheduler.
        submitted_at: Monotonic timestamp set at submission.
        source: Always ``"ui"`` — Studio-originated tasks take this badge.
        requested_revision: Revision context passed to Phase 4 reconciliation.
        render_batch_id: Optional grouping identifier for progress reporting.
    """

    source: str = "ui"

    def __init__(
        self,
        *,
        task_id: str,
        engine_id: str,
        script_text: str,
        output_path: str,
        project_id: str | None = None,
        chapter_id: str | None = None,
        voice_profile_id: str | None = None,
        voice_ref: str | None = None,
        language: str = "en",
        resource_claim: ResourceClaim | None = None,
        requested_revision: dict[str, Any] | None = None,
        render_batch_id: str | None = None,
    ) -> None:
        self.task_id = task_id
        self.engine_id = engine_id
        self.script_text = script_text
        self.output_path = output_path
        self.project_id = project_id
        self.chapter_id = chapter_id
        self.voice_profile_id = voice_profile_id
        self.voice_ref = voice_ref
        self.language = language
        self.resource_claim = resource_claim or ResourceClaim.none()
        self.requested_revision = requested_revision or {}
        self.render_batch_id = render_batch_id
        self.submitted_at = time.monotonic()

    # ------------------------------------------------------------------
    # StudioTask contract
    # ------------------------------------------------------------------

    def validate(self) -> None:
        """Validate task payload before scheduler admission.

        Raises:
            ValueError: When required fields are missing or invalid.
        """
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.engine_id:
            raise ValueError("engine_id is required")
        if not self.script_text or not self.script_text.strip():
            raise ValueError("script_text must not be empty")
        if not self.output_path:
            raise ValueError("output_path is required")

    def describe(self) -> TaskContext:
        """Return the identifying metadata needed for scheduling.

        Returns:
            TaskContext: Scheduler-compatible context with revision payload.
        """
        return TaskContext(
            task_id=self.task_id,
            task_type="synthesis",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            source=self.source,
            submitted_at=self.submitted_at,
            payload={
                "engine_id": self.engine_id,
                "script_text": self.script_text,
                "output_path": self.output_path,
                "voice_profile_id": self.voice_profile_id,
                "reference_audio_path": self.voice_ref,
                "language": self.language,
                "source": self.source,
                "render_batch_id": self.render_batch_id,
                # Phase 4 reconciliation context — the orchestrator reads
                # these fields when calling reconcile_work_item().
                "requested_revision": self.requested_revision,
                "task_revision_id": self.requested_revision.get(
                    "source_revision_id", self.task_id
                ),
                "scope": "job",
            },
        )

    @classmethod
    def from_task_context(cls, ctx: TaskContext) -> "SynthesisTask":
        """Reconstruct a SynthesisTask from a recovered TaskContext.

        Args:
            ctx: Recovered task context from the scheduler recovery path.

        Returns:
            SynthesisTask: Reconstructed task.
        """
        payload = ctx.payload or {}
        return cls(
            task_id=ctx.task_id,
            engine_id=str(payload.get("engine_id", "")),
            script_text=str(payload.get("script_text", "")),
            output_path=str(payload.get("output_path", "")),
            project_id=ctx.project_id,
            chapter_id=ctx.chapter_id,
            voice_profile_id=payload.get("voice_profile_id"),
            voice_ref=payload.get("reference_audio_path"),
            language=str(payload.get("language", "en")),
            requested_revision=payload.get("requested_revision"),
            render_batch_id=payload.get("render_batch_id"),
        )

    def run(self) -> TaskResult:
        """Execute synthesis as a self-contained fallback.

        .. note::

           The ``TaskOrchestrator`` does **not** call this method for standard
           submissions.  Instead it detects ``to_bridge_request()`` and routes
           through the injected ``voice_bridge``.

           This method exists as a fallback for:
           - Direct task invocation (CLI, tests without an orchestrator)
           - Non-orchestrator execution paths

        Returns:
            TaskResult: Synthesis outcome with ``completed`` or ``failed`` status.
        """
        from app.engines.bridge import create_voice_bridge  # noqa: PLC0415

        bridge = create_voice_bridge()
        try:
            result = bridge.synthesize(self.to_bridge_request())
            ok = result.get("status", "ok") == "ok"
            return TaskResult(
                status="completed" if ok else "failed",
                message=result.get("message"),
            )
        except Exception as exc:
            from app.engines.bridge_remote import EngineUnavailableError
            is_retriable = isinstance(exc, EngineUnavailableError)
            return TaskResult(status="failed", message=str(exc), retriable=is_retriable)

    def on_cancel(self) -> None:
        """Release task-level resources on cancellation.

        ``SynthesisTask`` is stateless with respect to the orchestrator —
        in-flight synthesis inside the TTS Server subprocess is cancelled by
        the watchdog if needed.  Nothing to clean up here.
        """

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def to_bridge_request(self) -> dict[str, Any]:
        """Build a VoiceBridge-compatible synthesis request."""
        return {
            "engine_id": self.engine_id,
            "script_text": self.script_text,
            "output_path": self.output_path,
            "voice_profile_id": self.voice_profile_id,
            "reference_audio_path": self.voice_ref,
            "language": self.language,
            "source": self.source,
            "render_batch_id": self.render_batch_id,
        }

