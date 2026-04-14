"""API Synthesis task for Studio 2.0.

Represents TTS synthesis requests originating from the external Local TTS API.
These tasks participate in the same scheduler queue as Studio-originated tasks
and are prioritized according to the active priority mode (STUDIO_FIRST,
EQUAL, or API_FIRST).

Priority badges on the queue UI use the ``source="api"`` field to identify
these tasks with an API badge.
"""

from __future__ import annotations

import time
from typing import Any

from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult


class ApiSynthesisTask(StudioTask):
    """Synthesis task submitted via the external Local TTS API.

    This is a real ``StudioTask`` subclass — the orchestrator's ``submit()``
    method can accept it directly.

    Attributes:
        task_id: Stable unique identifier for this task.
        engine_id: Target TTS engine identifier.
        text: Text to synthesize.
        output_path: Absolute path where audio should be written.
        voice_ref: Optional reference audio path.
        request_settings: Per-request engine settings overrides.
        language: BCP-47 language code.
        resource_claim: Resource requirements for the scheduler.
        submitted_at: Monotonic timestamp of submission.
        source: Always ``"api"`` for queue UI badge and priority policy.
        caller_id: Optional identifier for the API caller (rate-limiting).
    """

    source: str = "api"

    def __init__(
        self,
        *,
        task_id: str,
        engine_id: str,
        text: str,
        output_path: str,
        voice_ref: str | None = None,
        request_settings: dict[str, Any] | None = None,
        language: str = "en",
        resource_claim: ResourceClaim | None = None,
        caller_id: str | None = None,
    ) -> None:
        self.task_id = task_id
        self.engine_id = engine_id
        self.text = text
        self.output_path = output_path
        self.voice_ref = voice_ref
        self.request_settings = request_settings or {}
        self.language = language
        self.resource_claim = resource_claim or ResourceClaim.none()
        self.submitted_at = time.monotonic()
        self.caller_id = caller_id

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
        if not self.text:
            raise ValueError("text is required")
        if not self.output_path:
            raise ValueError("output_path is required")

    def describe(self) -> TaskContext:
        """Return the identifying metadata needed for scheduling.

        Returns:
            TaskContext: Scheduler-compatible context derived from this task.
        """
        return self.to_task_context()

    def run(self) -> TaskResult:
        """Execute the synthesis via VoiceBridge.

        .. note::

           The orchestrator should call this method after reserving resources.
           This method builds the bridge request and delegates to the bridge.
           The orchestrator handles progress publication, not this method.

        Returns:
            TaskResult: Synthesis outcome.
        """
        # Import lazily to avoid circular deps and stay behind the bridge boundary.
        from app.engines.bridge import create_voice_bridge  # noqa: PLC0415

        bridge = create_voice_bridge()
        try:
            result = bridge.synthesize(self.to_bridge_request())
            status = result.get("status", "ok")
            return TaskResult(
                status="completed" if status == "ok" else "failed",
                message=result.get("message"),
            )
        except Exception as exc:
            return TaskResult(status="failed", message=str(exc))

    def on_cancel(self) -> None:
        """Release task-level resources when a task is cancelled.

        API synthesis tasks are stateless — there is nothing to clean up.
        """

    # ------------------------------------------------------------------
    # Adapter methods
    # ------------------------------------------------------------------

    def to_task_context(self) -> TaskContext:
        """Convert to a ``TaskContext`` for queue and scheduling use.

        Returns:
            TaskContext: Scheduler-compatible context derived from this task.
        """
        return TaskContext(
            task_id=self.task_id,
            task_type="api_synthesis",
            source=self.source,
            submitted_at=self.submitted_at,
            payload={
                "engine_id": self.engine_id,
                "script_text": self.text,
                "output_path": self.output_path,
                "reference_audio_path": self.voice_ref,
                "language": self.language,
                "source": self.source,
                "caller_id": self.caller_id,
                **self.request_settings,
            },
        )

    def to_bridge_request(self) -> dict[str, Any]:
        """Build a VoiceBridge-compatible synthesis request.

        Returns:
            dict[str, Any]: Request dict the VoiceBridge can dispatch.
        """
        return {
            "engine_id": self.engine_id,
            "script_text": self.text,
            "output_path": self.output_path,
            "reference_audio_path": self.voice_ref,
            "language": self.language,
            "source": self.source,
            **self.request_settings,
        }

    @classmethod
    def from_task_context(cls, ctx: TaskContext) -> "ApiSynthesisTask":
        """Reconstruct an ApiSynthesisTask from a recovered TaskContext.

        Args:
            ctx: Recovered task context from the scheduler recovery path.

        Returns:
            ApiSynthesisTask: Reconstructed task.
        """
        payload = ctx.payload or {}
        return cls(
            task_id=ctx.task_id,
            engine_id=str(payload.get("engine_id", "")),
            text=str(payload.get("script_text", "")),
            output_path=str(payload.get("output_path", "")),
            voice_ref=payload.get("reference_audio_path") or None,  # type: ignore[arg-type]
            language=str(payload.get("language", "en")),
            caller_id=payload.get("caller_id") or None,  # type: ignore[arg-type]
        )
