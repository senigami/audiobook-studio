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
import logging
from typing import Any, Callable, Dict, List, Optional

from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult

logger = logging.getLogger(__name__)


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
        is_bake: bool = False,
        segment_ids: list[str] | None = None,
        custom_title: str | None = None,
        make_mp3: bool = False,
        safe_mode: bool = True,
        synthesis_settings: dict[str, Any] | None = None,
        script: list[dict[str, Any]] | None = None,
        force_rerender: bool = False,
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
        self.resource_claim = resource_claim or (
            ResourceClaim.none() if engine_id == "mixed" else ResourceClaim.exclusive_claim()
        )
        self.requested_revision = requested_revision or {}
        self.render_batch_id = render_batch_id
        self.is_bake = is_bake
        self.segment_ids = segment_ids
        self.custom_title = custom_title
        self.make_mp3 = make_mp3
        self.safe_mode = safe_mode
        self.synthesis_settings = synthesis_settings or {}
        self.script = script
        self.force_rerender = force_rerender
        self.submitted_at = time.monotonic()
        self._cancelled = False

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
        if not self.chapter_id and not self.script_text.strip():
            raise ValueError("script_text must not be empty for non-chapter tasks")
        if not self.output_path:
            raise ValueError("output_path is required")

    @property
    def is_marker_driven(self) -> bool:
        """Synthesis tasks use log markers to track render start."""
        return True

    @property
    def prefers_local_execution(self) -> bool:
        """Synthesis tasks for the 'mixed' engine execute locally via handle_mixed_job."""
        return self.engine_id == "mixed"

    def describe(self) -> TaskContext:
        """Return the identifying metadata needed for scheduling.

        Returns:
            TaskContext: Scheduler-compatible context with revision payload.
        """
        # Resolve char_count once at context-build time so _publish never needs
        # a per-frame DB query.  Resolution order (first non-zero wins):
        #   a) len(script_text) when the task carries its own text
        #   b) chapter.char_count from the DB when routed via segment_ids
        #   c) unset/None — both computed and observed ETA remain unavailable
        _char_count: int | None = None
        if self.script_text:
            _text_len = len(self.script_text)
            if _text_len > 0:
                _char_count = _text_len
        if _char_count is None and self.chapter_id:
            try:
                from app.db.chapters import get_chapter  # noqa: PLC0415
                _chap = get_chapter(self.chapter_id)
                if _chap is not None:
                    _raw = _chap.get("char_count")
                    if isinstance(_raw, int) and _raw > 0:
                        _char_count = _raw
            except Exception:
                pass

        payload: dict[str, Any] = {
            "engine_id": self.engine_id,
            "script_text": self.script_text,
            "output_path": self.output_path,
            "voice_profile_id": self.voice_profile_id,
            "reference_audio_path": self.voice_ref,
            "language": self.language,
            "source": self.source,
            "render_batch_id": self.render_batch_id,
            "is_bake": self.is_bake,
            "segment_ids": self.segment_ids,
            "custom_title": self.custom_title,
            "make_mp3": self.make_mp3,
            "safe_mode": self.safe_mode,
            "synthesis_settings": self.synthesis_settings,
            "script": self.script,
            "force_rerender": self.force_rerender,
            # Phase 4 reconciliation context — the orchestrator reads
            # these fields when calling reconcile_work_item().
            "requested_revision": self.requested_revision,
            "task_revision_id": self.requested_revision.get(
                "source_revision_id", self.task_id
            ),
            "scope": "chapter" if self.chapter_id and not self.segment_ids else "job",
        }
        if _char_count is not None:
            payload["char_count"] = _char_count

        return TaskContext(
            task_id=self.task_id,
            task_type="synthesis",
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            source=self.source,
            submitted_at=self.submitted_at,
            payload=payload,
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
            is_bake=payload.get("is_bake", False),
            segment_ids=payload.get("segment_ids"),
            custom_title=payload.get("custom_title"),
            make_mp3=payload.get("make_mp3", False),
            safe_mode=payload.get("safe_mode", True),
            synthesis_settings=payload.get("synthesis_settings"),
            script=payload.get("script"),
            force_rerender=bool(payload.get("force_rerender", False)),
        )

    def run(self) -> TaskResult:
        """Execute synthesis locally (only for 'mixed' engine)."""
        if self.engine_id != "mixed":
            return TaskResult(
                status="failed",
                message=f"Task type synthesis does not support local execution for engine {self.engine_id}."
            )

        from app.db.models import Job  # noqa: PLC0415
        from plugins.tts_mixed.handler import handle_mixed_job, set_ctx as _set_mixed_ctx  # noqa: PLC0415
        from app.studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415

        # Construct and inject the engine-scoped ctx before dispatch so the
        # handler uses the dispatcher's context (enables mock injection in tests).
        _set_mixed_ctx(StudioPluginContext(engine_id="mixed"))

        # Reconstruct a Job-like object for the local handler
        j = Job(
            id=self.task_id,
            engine=self.engine_id,
            status="running",
            created_at=self.submitted_at,
            project_id=self.project_id,
            chapter_id=self.chapter_id,
            chapter_file=self.output_path,
            speaker_profile=self.voice_profile_id,
            safe_mode=self.safe_mode,
            make_mp3=self.make_mp3,
            is_bake=self.is_bake,
            segment_ids=self.segment_ids,
            custom_title=self.custom_title,
        )

        try:
            status, message = handle_mixed_job(
                jid=self.task_id,
                j=j,
                start=time.time(),
                on_output=self._relay_output,
                cancel_check=lambda: self._cancelled,
            )
            return TaskResult(
                status="completed" if status == "done" else status,
                message=message,
            )
        except Exception as exc:
            logger.exception("Mixed synthesis failed for task %s", self.task_id)
            return TaskResult(status="failed", message=str(exc))

    def on_cancel(self) -> None:
        """Release task-level resources on cancellation."""
        self._cancelled = True
        if self.engine_id != "mixed":
            from app.engines.bridge import create_voice_bridge
            bridge = create_voice_bridge()
            bridge.cancel(self.task_id)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def to_bridge_request(self) -> dict[str, Any] | None:
        """Build a VoiceBridge-compatible synthesis request."""
        if self.engine_id == "mixed":
            return None

        # Apply project lexicon before the text reaches the engine.
        # Load once per task; zero-impact when the project has no entries.
        script_text = self.script_text
        if self.project_id:
            try:
                from app.db.lexicon import get_lexicon  # noqa: PLC0415
                from app.utils.text.lexicon import apply_lexicon  # noqa: PLC0415
                entries = get_lexicon(self.project_id)
                if entries:
                    script_text = apply_lexicon(script_text, entries)
            except Exception:
                logger.warning(
                    "Failed to apply lexicon for project %s; using original text.",
                    self.project_id,
                    exc_info=True,
                )

        return {
            "engine_id": self.engine_id,
            "script_text": script_text,
            "output_path": self.output_path,
            "project_id": self.project_id,
            "chapter_id": self.chapter_id,
            "voice_profile_id": self.voice_profile_id,
            "reference_audio_path": self.voice_ref,
            "language": self.language,
            "source": self.source,
            "render_batch_id": self.render_batch_id,
            "is_bake": self.is_bake,
            "segment_ids": self.segment_ids,
            "custom_title": self.custom_title,
            "make_mp3": self.make_mp3,
            "safe_mode": self.safe_mode,
            "task_id": self.task_id,
            "script": self.script,
            **self.synthesis_settings,
        }

    def _relay_output(self, line: str) -> None:
        """Relay output to the orchestrator's log listener."""
        # The orchestrator's log_listener is registered with the watchdog.
        # But for local tasks, we need to manually trigger it if we want
        # markers like [START_SYNTHESIS] to be processed.
        from app.engines.watchdog import get_watchdog
        wd = get_watchdog()
        if wd:
            wd._broadcast_log(line, task_id=self.task_id)
