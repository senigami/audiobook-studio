"""API Synthesis task for Studio 2.0.

Represents TTS synthesis requests originating from the external Local TTS API.
These tasks participate in the same scheduler queue as Studio-originated tasks
and are prioritized according to the active priority mode (STUDIO_FIRST,
EQUAL, or API_FIRST).

Priority badges on the queue UI use the ``source="api"`` field to identify
these tasks with an API badge.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult

logger = logging.getLogger(__name__)


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
        self.resource_claim = resource_claim or ResourceClaim.exclusive_claim()
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

    def _assert_voice_ref_containment(self) -> None:
        """Belt-and-braces containment check for voice_ref paths (defense in depth).

        Called immediately before dispatching to the bridge.  Logs and raises
        on any path that was not already caught at the API boundary.
        """
        if not self.voice_ref:
            return
        if "/" not in self.voice_ref and "\\" not in self.voice_ref:
            # Plain profile name — no filesystem traversal possible.
            return
        import os  # noqa: PLC0415
        from app.core.config import VOICES_DIR, TRANSIENT_DIR  # noqa: PLC0415
        candidate = os.path.normpath(self.voice_ref)
        voices_norm = os.path.normpath(str(VOICES_DIR))
        transient_norm = os.path.normpath(str(TRANSIENT_DIR))
        in_voices = candidate == voices_norm or candidate.startswith(voices_norm + os.sep)
        in_transient = candidate == transient_norm or candidate.startswith(transient_norm + os.sep)
        if not (in_voices or in_transient):
            logger.error(
                "api_synthesis: voice_ref %r is outside allowed dirs for task %s — failing task",
                self.voice_ref, self.task_id,
            )
            raise ValueError(f"voice_ref path is not within an allowed directory: {self.voice_ref}")

    def run(self) -> TaskResult:
        """Execute the synthesis via VoiceBridge.

        .. note::

           The orchestrator should call this method after reserving resources.
           This method builds the bridge request and delegates to the bridge.
           The orchestrator handles progress publication, not this method.

        Returns:
            TaskResult: Synthesis outcome.
        """
        # Belt-and-braces: re-assert voice_ref containment before dispatching
        # (defense in depth in case the API boundary check was bypassed).
        try:
            self._assert_voice_ref_containment()
        except ValueError as exc:
            return TaskResult(status="failed", message=str(exc), retriable=False)

        # Import lazily to avoid circular deps and stay behind the bridge boundary.
        from app.engines.bridge import create_voice_bridge  # noqa: PLC0415

        bridge = create_voice_bridge()
        try:
            result = bridge.synthesize(self.to_bridge_request())
            status = result.get("status", "ok")
            synthesis_duration = result.get("duration_sec")
            if synthesis_duration is not None:
                # Best-effort bookkeeping: synthesis already succeeded, so a
                # failure here must not flip the result to failed.
                try:
                    from app.db.state import update_job  # noqa: PLC0415
                    update_job(self.task_id, synthesis_duration_seconds=synthesis_duration)
                except Exception:
                    logger.warning("Failed to persist synthesis duration for task %s", self.task_id, exc_info=True)
            return TaskResult(
                status="completed" if status == "ok" else "failed",
                message=result.get("message"),
            )
        except Exception as exc:
            from app.engines.bridge_remote import EngineUnavailableError
            is_retriable = isinstance(exc, EngineUnavailableError)
            return TaskResult(status="failed", message=str(exc), retriable=is_retriable)

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

        This is the external-gateway shape, used by the ``/api/v1/tts``
        external API: it includes ``caller_id`` for attribution and spreads
        ``**self.request_settings`` — a differently-named settings bag from
        the other two builders' ``synthesis_settings``. See also the other
        two ``to_bridge_request`` builders, which cover different task
        shapes: ``app/orchestration/tasks/synthesis.py`` (full chapter/book
        render) and ``app/orchestration/tasks/segment_synthesis.py``
        (single-group fan-out child).

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
            "caller_id": self.caller_id,
            "task_id": self.task_id,
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
            request_settings={
                k: v for k, v in payload.items()
                if k not in {
                    "engine_id", "script_text", "output_path", "reference_audio_path",
                    "language", "source", "caller_id"
                }
            }
        )
