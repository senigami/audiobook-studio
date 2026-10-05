import time
from pathlib import Path
from typing import Any, Dict, Optional, Union

from .base import StudioTask, TaskContext, TaskResult
from ..scheduler.resources import ResourceClaim


class SampleTestTask(StudioTask):
    """Queueable task for one-off preview or voice-test execution."""

    def __init__(
        self,
        *,
        task_id: str,
        speaker_profile: str,
        engine_id: str,
        output_path: Path,
        test_text: str,
        voice_job_settings: Optional[Dict[str, Any]] = None,
        custom_title: Optional[str] = None,
        voice_profile_dir: Optional[Union[Path, str]] = None,
        resource_claim: Optional[ResourceClaim] = None,
    ) -> None:
        self.task_id = task_id
        self.speaker_profile = speaker_profile
        self.engine_id = engine_id
        self.output_path = Path(output_path).with_suffix(".wav")
        self.test_text = test_text
        self.script_text = test_text
        self.voice_job_settings = voice_job_settings or {}
        self.custom_title = custom_title
        self.voice_profile_dir = Path(voice_profile_dir) if voice_profile_dir else None
        self.resource_claim = resource_claim or ResourceClaim.none()
        self.submitted_at = time.monotonic()

    def validate(self) -> None:
        """Validate sample-test inputs before scheduling."""
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.speaker_profile:
            raise ValueError("speaker_profile is required")
        if not self.engine_id:
            raise ValueError("engine_id is required")

    @property
    def is_marker_driven(self) -> bool:
        """Voice tests do not use marker-driven progress."""
        return False

    @property
    def prefers_local_execution(self) -> bool:
        """Voice test tasks execute run() locally and manage their own bridge calls."""
        return True

    def describe(self) -> TaskContext:
        """Describe sample-test identity and ownership."""
        return TaskContext(
            task_id=self.task_id,
            task_type="sample_test",
            source="ui",
            submitted_at=self.submitted_at,
            payload={
                "speaker_profile": self.speaker_profile,
                "engine_id": self.engine_id,
                "output_path": str(self.output_path),
                "voice_profile_dir": str(self.voice_profile_dir) if self.voice_profile_dir else None,
                "test_text": self.test_text,
                "script_text": self.script_text,
                "voice_job_settings": self.voice_job_settings,
                "custom_title": self.custom_title,
            },
        )

    @classmethod
    def from_task_context(cls, ctx: TaskContext) -> "SampleTestTask":
        """Reconstruct task from context."""
        p = ctx.payload or {}
        return cls(
            task_id=ctx.task_id,
            speaker_profile=str(p.get("speaker_profile", "")),
            engine_id=str(p.get("engine_id", "")),
            output_path=Path(str(p.get("output_path", ""))),
            voice_profile_dir=p.get("voice_profile_dir"),
            test_text=str(p.get("script_text", p.get("test_text", ""))),
            voice_job_settings=p.get("voice_job_settings"),
            custom_title=p.get("custom_title"),
        )

    def run(self) -> TaskResult:
        """Execute sample-test flow."""
        from app.engines.bridge import create_voice_bridge
        from app.db.speakers import update_speaker_settings

        bridge = create_voice_bridge()

        # 1. Generate WAV
        temp_wav = self.output_path
        request = {
            "engine_id": self.engine_id,
            "voice_profile_id": self.speaker_profile,
            "voice_profile_dir": str(self.voice_profile_dir) if self.voice_profile_dir else None,
            "script_text": self.test_text,
            "output_path": str(temp_wav),
            "output_format": "wav",
            "task_id": self.task_id,
        }
        request.update(self.voice_job_settings)

        res = {}
        try:
            from app.engines.bridge import create_voice_bridge
            bridge = create_voice_bridge()

            res = bridge.synthesize(request)

            if res.get("status") != "ok":
                return TaskResult(status="failed", message=res.get("message", "Synthesis failed"))
        except Exception as e:
            return TaskResult(status="failed", message=f"Synthesis error: {e}")


        self.report_progress(1.0, message="Preview synthesis finished.", reason_code="synthesis_finished")

        if not self.output_path.parent.exists():
            self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # 1b. Convert WAV → MP3 and delete WAV (voice samples are always MP3)
        from app.engines.audio_ops import finalize_sample_artifact
        final_path = finalize_sample_artifact(self.output_path)
        self.output_path = final_path

        # 2. Update Speaker Settings (Preview only)
        try:
            self.report_progress(1.0, message="Finalizing metadata...", reason_code="metadata_update")
            update_speaker_settings(
                self.speaker_profile,
                preview_test_text=self.test_text,
                preview_engine=self.engine_id,
                preview_reference_sample=self.voice_job_settings.get("reference_sample"),
                preview_voice_asset_id=self.voice_job_settings.get("voice_asset_id"),
                preview_model=self.voice_job_settings.get("model"),
            )
        except Exception as e:
             return TaskResult(status="failed", message=f"Metadata update failed: {e}")

        timing_payload = res.get("timing")
        if timing_payload is None and isinstance(res.get("tts_server_result"), dict):
            timing_payload = res["tts_server_result"].get("timing")
        return TaskResult(status="completed", timing=timing_payload)


    def on_cancel(self) -> None:
        """Cleanup on cancellation."""
        from app.engines.bridge import create_voice_bridge
        bridge = create_voice_bridge()
        bridge.cancel(self.task_id)
