"""XTTS engine adapter scaffold for Studio 2.0.

This module will wrap the existing XTTS behavior behind the standard engine
contract without leaking XTTS-specific process management into the scheduler.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from app.config import XTTS_ENV_ACTIVATE, XTTS_ENV_PYTHON
from app.engines.errors import EngineExecutionError, EngineRequestError
from app.engines.voice.base import BaseVoiceEngine
from app.engines.models import EngineHealthModel, EngineManifestModel
from app.infra.subprocess import run_managed_subprocess_async
from app.voice_engines import resolve_xtts_preview_inputs

INTENDED_UPSTREAM_CALLERS = (
    "app.engines.registry",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.engines.voice.base.BaseVoiceEngine",
    "app.infra.subprocess.run_managed_subprocess",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.orchestration",
    "app.api.routers",
    "app.jobs",
)


def xtts_generate(
    *,
    text: str,
    out_wav: Path,
    safe_mode: bool,
    on_output,
    cancel_check,
    speaker_wav: str | None = None,
    speed: float = 1.0,
    voice_profile_dir: Path | None = None,
) -> int:
    """Invoke the legacy XTTS generator lazily."""

    from app.engines import xtts_generate as legacy_generate

    return legacy_generate(
        text=text,
        out_wav=out_wav,
        safe_mode=safe_mode,
        on_output=on_output,
        cancel_check=cancel_check,
        speaker_wav=speaker_wav,
        speed=speed,
        voice_profile_dir=voice_profile_dir,
    )


class XttsVoiceEngine(BaseVoiceEngine):
    """Standard XTTS adapter placeholder."""

    def __init__(self, *, manifest: EngineManifestModel):
        self.manifest = manifest

    def describe_health(self) -> EngineHealthModel:
        """Summarize XTTS adapter readiness without triggering side effects."""

        available = XTTS_ENV_ACTIVATE.exists() and XTTS_ENV_PYTHON.exists()
        return EngineHealthModel(
            engine_id=self.manifest.engine_id,
            available=available,
            ready=available,
            status="ready" if available else "scaffold",
            message=(
                "XTTS adapter is ready for bridge-backed preview execution."
                if available
                else "XTTS adapter requires a configured XTTS environment."
            ),
            details={
                "module_path": self.manifest.module_path,
                "capabilities": list(self.manifest.capabilities),
                "env_activate": str(XTTS_ENV_ACTIVATE),
                "env_python": str(XTTS_ENV_PYTHON),
            },
        )

    def validate_environment(self) -> None:
        """Describe XTTS environment validation."""
        raise NotImplementedError

    def validate_request(self, request: dict[str, object]) -> None:
        """Describe XTTS request validation."""
        if not isinstance(request, dict):
            raise EngineRequestError("XTTS requests must be provided as a mapping.")
        engine_id = str(request.get("engine_id") or "").strip()
        if engine_id and engine_id != self.manifest.engine_id:
            raise EngineRequestError("XTTS request is targeting a different engine.")
        if not str(request.get("voice_profile_id") or "").strip():
            raise EngineRequestError("XTTS preview requests must include voice_profile_id.")
        if not str(request.get("script_text") or "").strip():
            raise EngineRequestError("XTTS preview requests must include script_text.")
        output_format = str(request.get("output_format") or "wav").strip().lower() or "wav"
        if output_format != "wav":
            raise EngineRequestError("XTTS bridge preview currently supports output_format='wav' only.")
        reference_audio_path = str(request.get("reference_audio_path") or "").strip()
        if reference_audio_path:
            reference_path = Path(reference_audio_path)
            if not reference_path.exists() or not reference_path.is_file():
                raise EngineRequestError("XTTS reference audio path does not exist.")
            if reference_path.suffix.lower() != ".wav":
                raise EngineRequestError("XTTS bridge preview requires reference_audio_path to be a .wav file.")

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Describe XTTS synthesis through the standard engine contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run XTTS preview/test synthesis through the standard contract."""

        self.validate_request(request)

        script_text = str(request["script_text"]).strip()
        voice_profile_id = str(request["voice_profile_id"]).strip()
        output_format = "wav"
        safe_mode = bool(request.get("safe_mode", True))
        speed = float(request.get("speed", 1.0) or 1.0)
        reference_audio_path = str(request.get("reference_audio_path") or "").strip() or None
        voice_asset_id = str(request.get("voice_asset_id") or "").strip() or None

        speaker_wav: str | None = None
        voice_profile_dir: Path | None = None
        if reference_audio_path:
            speaker_wav = reference_audio_path
        else:
            speaker_wav, voice_profile_dir = resolve_xtts_preview_inputs(voice_profile_id)
            if voice_profile_dir is None:
                raise EngineRequestError(
                    "XTTS preview requires an existing voice profile directory or reference_audio_path."
                )

        safe_prefix = "".join(
            ch if ch.isalnum() or ch in {"-", "_"} else "_"
            for ch in voice_profile_id
        ) or "xtts"
        fd, out_wav_path = tempfile.mkstemp(prefix=f"{safe_prefix}_preview_", suffix=".wav")
        os.close(fd)
        out_wav = Path(out_wav_path)

        def _noop_output(*_args) -> None:
            return None

        def _never_cancel() -> bool:
            return False

        try:
            rc = xtts_generate(
                text=script_text,
                out_wav=out_wav,
                safe_mode=safe_mode,
                on_output=_noop_output,
                cancel_check=_never_cancel,
                speaker_wav=speaker_wav,
                speed=speed,
                voice_profile_dir=voice_profile_dir,
            )
        except Exception as exc:
            raise EngineExecutionError(f"XTTS preview failed: {exc}") from exc

        if rc != 0 or not out_wav.exists():
            raise EngineExecutionError("XTTS preview did not produce an audio file.")

        return {
            "status": "ok",
            "bridge": "voice-preview-bridge",
            "engine_id": self.manifest.engine_id,
            "ephemeral": True,
            "audio_path": str(out_wav),
            "audio_format": output_format,
            "preview_request": {
                "voice_profile_id": voice_profile_id,
                "engine_id": self.manifest.engine_id,
                "script_text": script_text,
                "reference_text": request.get("reference_text"),
                "reference_audio_path": reference_audio_path,
                "voice_asset_id": voice_asset_id,
                "output_format": output_format,
            },
        }

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Describe XTTS voice-asset build flow through the standard contract."""
        _ = run_managed_subprocess_async
        raise NotImplementedError
