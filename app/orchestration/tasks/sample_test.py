import time
from pathlib import Path
from typing import Any, Dict

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
        voice_job_settings: Dict[str, Any] | None = None,
        custom_title: str | None = None,
        resource_claim: ResourceClaim | None = None,
    ) -> None:
        self.task_id = task_id
        self.speaker_profile = speaker_profile
        self.engine_id = engine_id
        self.output_path = output_path
        self.test_text = test_text
        self.voice_job_settings = voice_job_settings or {}
        self.custom_title = custom_title
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
                "test_text": self.test_text,
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
            test_text=str(p.get("test_text", "")),
            voice_job_settings=p.get("voice_job_settings"),
            custom_title=p.get("custom_title"),
        )

    def run(self) -> TaskResult:
        """Execute sample-test flow."""
        from app.engines.bridge import create_voice_bridge
        from app.engines.audio_ops import wav_to_mp3
        from app.db.speakers import update_speaker_settings

        bridge = create_voice_bridge()

        # 1. Generate WAV
        temp_wav = self.output_path.with_suffix(".wav")
        request = {
            "engine_id": self.engine_id,
            "voice_profile_id": self.speaker_profile,
            "script_text": self.test_text,
            "output_path": str(temp_wav),
            "output_format": "wav",
        }
        request.update(self.voice_job_settings)

        try:
            res = bridge.synthesize(request)
            if res.get("status") != "ok":
                return TaskResult(status="failed", message=res.get("message", "Synthesis failed"))
        except Exception as e:
            return TaskResult(status="failed", message=f"Synthesis error: {e}")

        # 2. Convert to MP3
        if not self.output_path.parent.exists():
            self.output_path.parent.mkdir(parents=True, exist_ok=True)

        rc = wav_to_mp3(temp_wav, self.output_path)
        if rc == 0 and self.output_path.exists():
            try:
                temp_wav.unlink()
            except Exception:
                pass
        else:
            if not self.output_path.exists():
                return TaskResult(status="failed", message="MP3 conversion failed")

        # 3. Update Speaker Settings (Preview only)
        try:
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

        return TaskResult(status="completed")

    def on_cancel(self) -> None:
        """Cleanup on cancellation."""
        pass
