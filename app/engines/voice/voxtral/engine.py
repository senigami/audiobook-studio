"""Voxtral engine adapter scaffold for Studio 2.0.

This module will wrap the existing Voxtral behavior behind the standard engine
contract without leaking engine-specific request handling into orchestration.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

from app.config import VOICES_DIR
from app.engines.errors import EngineExecutionError, EngineRequestError
from app.engines.voice.base import BaseVoiceEngine
from app.engines.models import EngineHealthModel, EngineManifestModel

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


def resolve_mistral_api_key() -> str | None:
    """Resolve the Voxtral API key through the legacy helper lazily."""

    from app.engines_voxtral import resolve_mistral_api_key as legacy_resolver

    return legacy_resolver()


def resolve_voxtral_model() -> str:
    """Resolve the Voxtral model name through the legacy helper lazily."""

    from app.engines_voxtral import resolve_voxtral_model as legacy_resolver

    return legacy_resolver()


def voxtral_generate(
    *,
    text: str,
    out_wav: Path,
    profile_name: str,
    voice_id: str | None = None,
    model: str | None = None,
    reference_sample: str | None = None,
) -> int:
    """Invoke the legacy Voxtral generator lazily."""

    from app.engines_voxtral import voxtral_generate as legacy_generate

    return legacy_generate(
        text=text,
        out_wav=out_wav,
        profile_name=profile_name,
        voice_id=voice_id,
        model=model,
        reference_sample=reference_sample,
    )


class VoxtralVoiceEngine(BaseVoiceEngine):
    """Standard Voxtral adapter placeholder."""

    def __init__(self, *, manifest: EngineManifestModel):
        self.manifest = manifest

    def describe_health(self) -> EngineHealthModel:
        """Summarize Voxtral adapter readiness without triggering side effects."""

        api_key = resolve_mistral_api_key()
        available = bool(api_key)
        return EngineHealthModel(
            engine_id=self.manifest.engine_id,
            available=available,
            ready=available,
            status="ready" if available else "unavailable",
            message=(
                "Voxtral adapter is ready for bridge-backed preview execution."
                if available
                else "Voxtral adapter requires a configured Mistral API key."
            ),
            details={
                "module_path": self.manifest.module_path,
                "capabilities": list(self.manifest.capabilities),
                "model": resolve_voxtral_model(),
            },
        )

    def validate_environment(self) -> None:
        """Describe Voxtral environment validation."""
        raise NotImplementedError

    def validate_request(self, request: dict[str, object]) -> None:
        """Describe Voxtral request validation."""
        if not isinstance(request, dict):
            raise EngineRequestError("Voxtral requests must be provided as a mapping.")
        engine_id = str(request.get("engine_id") or "").strip()
        if engine_id and engine_id != self.manifest.engine_id:
            raise EngineRequestError("Voxtral request is targeting a different engine.")
        if not str(request.get("voice_profile_id") or "").strip():
            raise EngineRequestError("Voxtral preview requests must include voice_profile_id.")
        if not str(request.get("script_text") or "").strip():
            raise EngineRequestError("Voxtral preview requests must include script_text.")
        output_format = str(request.get("output_format") or "wav").strip().lower() or "wav"
        if output_format != "wav":
            raise EngineRequestError(
                "Voxtral bridge preview currently supports output_format='wav' only."
            )
        reference_audio_path = str(request.get("reference_audio_path") or "").strip()
        if reference_audio_path:
            reference_path = Path(reference_audio_path)
            if not reference_path.exists():
                raise EngineRequestError("Voxtral reference audio path does not exist.")

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Describe Voxtral synthesis through the standard engine contract."""
        raise NotImplementedError

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run Voxtral preview/test synthesis through the standard contract."""

        self.validate_request(request)

        script_text = str(request["script_text"]).strip()
        voice_profile_id = str(request["voice_profile_id"]).strip()
        output_format = str(request.get("output_format") or "wav").strip().lower() or "wav"
        voice_asset_id = str(request.get("voice_asset_id") or "").strip() or None
        reference_audio_path = str(request.get("reference_audio_path") or "").strip() or None

        cleanup_root: Path | None = None
        profile_name = voice_profile_id
        reference_sample: str | None = None
        if reference_audio_path:
            cleanup_root, profile_name, reference_sample = self._stage_reference_audio(
                voice_profile_id=voice_profile_id,
                reference_audio_path=Path(reference_audio_path),
            )

        safe_prefix = "".join(
            ch if ch.isalnum() or ch in {"-", "_"} else "_"
            for ch in voice_profile_id
        ) or "voxtral"
        fd, out_wav_path = tempfile.mkstemp(prefix=f"{safe_prefix}_preview_", suffix=".wav")
        os.close(fd)
        out_wav = Path(out_wav_path)
        try:
            from app.engines_voxtral import VoxtralError

            rc = voxtral_generate(
                text=script_text,
                out_wav=out_wav,
                profile_name=profile_name,
                voice_id=voice_asset_id,
                model=request.get("voxtral_model"),
                reference_sample=reference_sample,
            )
        except VoxtralError as exc:
            raise EngineExecutionError(f"Voxtral preview failed: {exc}") from exc
        finally:
            if cleanup_root is not None:
                shutil.rmtree(cleanup_root, ignore_errors=True)

        if rc != 0 or not out_wav.exists():
            raise EngineExecutionError("Voxtral preview did not produce an audio file.")

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
        """Describe Voxtral voice-asset build flow through the standard contract."""
        raise NotImplementedError

    def _stage_reference_audio(
        self, *, voice_profile_id: str, reference_audio_path: Path
    ) -> tuple[Path, str, str]:
        """Copy preview reference audio into a temporary voice profile folder."""

        if not reference_audio_path.exists() or not reference_audio_path.is_file():
            raise EngineRequestError("Voxtral reference audio path does not exist.")

        VOICES_DIR.mkdir(parents=True, exist_ok=True)
        cleanup_root = Path(tempfile.mkdtemp(prefix="preview_", dir=VOICES_DIR))
        profile_name = cleanup_root.name
        staged_name = reference_audio_path.name
        shutil.copy2(reference_audio_path, cleanup_root / staged_name)
        return cleanup_root, profile_name, staged_name
