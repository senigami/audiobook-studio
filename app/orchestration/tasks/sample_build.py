import time
from pathlib import Path
from typing import Any, Dict

from .base import StudioTask, TaskContext, TaskResult
from ..scheduler.resources import ResourceClaim


class SampleBuildTask(StudioTask):
    """Queueable task for reusable voice-sample generation."""

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
        voice_profile_dir: Path | str | None = None,
        resource_claim: ResourceClaim | None = None,
    ) -> None:
        self.task_id = task_id
        self.speaker_profile = speaker_profile
        self.engine_id = engine_id
        self.output_path = output_path
        self.test_text = test_text
        self.voice_job_settings = voice_job_settings or {}
        self.custom_title = custom_title
        self.voice_profile_dir = Path(voice_profile_dir) if voice_profile_dir else None
        self.resource_claim = resource_claim or ResourceClaim.none()
        self.submitted_at = time.monotonic()

    def validate(self) -> None:
        """Validate sample-build inputs before scheduling."""
        if not self.task_id:
            raise ValueError("task_id is required")
        if not self.speaker_profile:
            raise ValueError("speaker_profile is required")
        if not self.engine_id:
            raise ValueError("engine_id is required")

    def describe(self) -> TaskContext:
        """Describe sample-build identity and ownership."""
        return TaskContext(
            task_id=self.task_id,
            task_type="sample_build",
            source="ui",
            submitted_at=self.submitted_at,
            payload={
                "speaker_profile": self.speaker_profile,
                "engine_id": self.engine_id,
                "output_path": str(self.output_path),
                "voice_profile_dir": str(self.voice_profile_dir) if self.voice_profile_dir else None,
                "test_text": self.test_text,
                "voice_job_settings": self.voice_job_settings,
                "custom_title": self.custom_title,
            },
        )

    @classmethod
    def from_task_context(cls, ctx: TaskContext) -> "SampleBuildTask":
        """Reconstruct task from context."""
        p = ctx.payload or {}
        return cls(
            task_id=ctx.task_id,
            speaker_profile=str(p.get("speaker_profile", "")),
            engine_id=str(p.get("engine_id", "")),
            output_path=Path(str(p.get("output_path", ""))),
            voice_profile_dir=p.get("voice_profile_dir"),
            test_text=str(p.get("test_text", "")),
            voice_job_settings=p.get("voice_job_settings"),
            custom_title=p.get("custom_title"),
        )

    def run(self) -> TaskResult:
        """Execute sample-build flow."""
        from app.engines.bridge import create_voice_bridge
        from app.engines.audio_ops import wav_to_mp3
        from app.db.speakers import update_speaker_settings

        bridge = create_voice_bridge()

        vdir = self.voice_profile_dir
        if not vdir:
            from app.db.speakers import get_profile_dir
            try:
                vdir = get_profile_dir(self.speaker_profile)
            except Exception:
                vdir = None

        # 1. Generate WAV
        temp_wav = self.output_path.with_suffix(".wav")
        request = {
            "engine_id": self.engine_id,
            "voice_profile_id": self.speaker_profile,
            "voice_profile_dir": str(vdir) if vdir else None,
            "script_text": self.test_text,
            "output_path": str(temp_wav),
            "output_format": "wav",
        }
        request.update(self.voice_job_settings)

        try:
            from app.engines.bridge import create_voice_bridge
            bridge = create_voice_bridge()

            # Use historical metrics to inform heartbeat duration
            expected_duration = self.get_expected_duration(self.test_text, self.engine_id)

            self.report_progress(0.0, message="Preparing synthesis request...")

            # Note: We use a non-advancing heartbeat (0.0 -> 0.0) so the UI stays at 0%
            # while synthesis is blocking, but keeps 'active' pulses arriving.
            with self.progress_heartbeat(0.0, 0.0, advance_progress=False, expected_duration=expected_duration, message="Synthesizing voice sample..."):
                res = bridge.synthesize(request)

            if res.get("status") != "ok":
                return TaskResult(status="failed", message=res.get("message", "Synthesis failed"))
        except Exception as e:
            return TaskResult(status="failed", message=f"Synthesis error: {e}")

        self.report_progress(0.70, message="Synthesis finished.")

        # 2. Convert to MP3
        if not self.output_path.parent.exists():
            self.output_path.parent.mkdir(parents=True, exist_ok=True)

        self.report_progress(0.82, message="Converting audio to MP3...")
        rc = wav_to_mp3(temp_wav, self.output_path)
        if rc == 0 and self.output_path.exists():
            try:
                temp_wav.unlink()
            except Exception:
                pass
        else:
            if not self.output_path.exists():
                return TaskResult(status="failed", message="MP3 conversion failed")

        self.report_progress(0.92, message="Finalizing sample...")

        # 3. Update Speaker Settings
        try:
            self.report_progress(0.92, message="Updating speaker metadata...")
            built_samples = []
            vdir_path = Path(vdir) if vdir else None
            if vdir_path and vdir_path.exists():
                built_samples = sorted([
                    f.name for f in vdir_path.iterdir()
                    if f.is_file() and f.suffix.lower() == ".wav" and f.name != "sample.wav"
                ])

            update_speaker_settings(
                self.speaker_profile,
                test_text=self.test_text,
                engine=self.engine_id,
                preview_test_text=self.test_text,
                preview_engine=self.engine_id,
                built_samples=built_samples,
                reference_sample=self.voice_job_settings.get("reference_sample"),
                voice_asset_id=self.voice_job_settings.get("voice_asset_id"),
                model=self.voice_job_settings.get("model"),
            )
        except Exception as e:
             return TaskResult(status="failed", message=f"Metadata update failed: {e}")

        return TaskResult(status="completed")

    def on_cancel(self) -> None:
        """Cleanup on cancellation."""
        pass
