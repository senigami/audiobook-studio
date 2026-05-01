"""Voxtral engine adapter scaffold for Studio 2.0.

This module will wrap the existing Voxtral behavior behind the standard engine
contract without leaking engine-specific request handling into orchestration.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.config import VOICES_DIR
from app.engines.errors import EngineExecutionError, EngineRequestError
from app.engines.voice.base import BaseVoiceEngine
from app.engines.voice.sdk import TTSRequest, TTSResult, VoiceProcessingHooks, SynthesisPlan
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


def wav_to_mp3(in_wav: Path, out_mp3: Path, on_output=None, cancel_check=None) -> int:
    """Invoke the legacy audio conversion helper lazily."""

    from app.engines import wav_to_mp3 as legacy_wav_to_mp3

    return legacy_wav_to_mp3(
        in_wav=in_wav,
        out_mp3=out_mp3,
        on_output=on_output,
        cancel_check=cancel_check,
    )


def resolve_mistral_api_key() -> str | None:
    """Resolve the Voxtral API key through the legacy helper lazily."""

    from .implementation import resolve_mistral_api_key as legacy_resolver

    return legacy_resolver()


def resolve_voxtral_model() -> str:
    """Resolve the Voxtral model name through the legacy helper lazily."""

    from .implementation import resolve_voxtral_model as legacy_resolver

    return legacy_resolver()


def _load_settings_schema() -> dict[str, object]:
    from app.config import PLUGINS_DIR
    schema_path = PLUGINS_DIR / "tts_voxtral" / "settings_schema.json"
    try:
        return json.loads(schema_path.read_text(encoding="utf-8"))
    except Exception:
        # Fallback to local if plugin directory is missing (e.g. minimal dev environment)
        local_path = Path(__file__).with_name("settings_schema.json")
        if local_path.exists():
            return json.loads(local_path.read_text(encoding="utf-8"))
        return {}


def voxtral_generate(
    *,
    text: str,
    out_wav: Path,
    on_output=None,
    cancel_check=None,
    profile_name: str,
    voice_id: str | None = None,
    model: str | None = None,
    reference_sample: str | None = None,
) -> int:
    """Invoke the legacy Voxtral generator lazily."""

    from .implementation import voxtral_generate as legacy_generate

    return legacy_generate(
        text=text,
        out_wav=out_wav,
        on_output=on_output,
        cancel_check=cancel_check,
        profile_name=profile_name,
        voice_id=voice_id,
        model=model,
        reference_sample=reference_sample,
    )


class VoxtralVoiceEngine(BaseVoiceEngine):
    """Standard Voxtral adapter placeholder."""

    def __init__(self, *, manifest: EngineManifestModel):
        self.manifest = manifest

    def hooks(self) -> VoiceProcessingHooks:
        """Return Voxtral-specific processing hooks."""
        return VoxtralProcessingHooks()

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
                "model": resolve_voxtral_model(),
            },
        )

    def settings_schema(self) -> dict[str, object]:
        """Return the Voxtral settings schema used by the Settings UI."""
        schema = _load_settings_schema()
        return dict(schema) if isinstance(schema, dict) else {}

    def current_settings(self) -> dict[str, object]:
        """Return the current Voxtral-related settings snapshot."""
        from app.state import get_settings  # noqa: PLC0415

        settings = get_settings()
        return {
            "enabled": bool((settings.get("enabled_plugins") or {}).get("voxtral")),
            "mistral_api_key": str(settings.get("mistral_api_key") or ""),
            "voxtral_model": str(settings.get("voxtral_model") or ""),
        }

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
            raise EngineRequestError("Voxtral requests must include voice_profile_id.")
        if not str(request.get("script_text") or "").strip():
            raise EngineRequestError("Voxtral requests must include script_text.")
        is_synthesis_request = bool(str(request.get("output_path") or "").strip())
        output_format = self._normalize_output_format(request, allow_mp3=is_synthesis_request)
        reference_audio_path = str(request.get("reference_audio_path") or "").strip()
        _ = str(request.get("reference_sample") or "").strip()
        if reference_audio_path:
            reference_path = Path(reference_audio_path)
            if not reference_path.exists():
                raise EngineRequestError("Voxtral reference audio path does not exist.")
        output_path = str(request.get("output_path") or "").strip()
        if output_path and output_format == "wav" and Path(output_path).suffix.lower() != ".wav":
            raise EngineRequestError("Voxtral wav synthesis output_path must end with .wav.")
        if output_path and output_format == "mp3" and Path(output_path).suffix.lower() != ".mp3":
            raise EngineRequestError("Voxtral mp3 synthesis output_path must end with .mp3.")

    def verify(self, request: dict[str, Any]) -> TTSResult:
        """Lightweight verification for Voxtral: check API connectivity."""
        api_key = resolve_mistral_api_key()
        if not api_key:
            return TTSResult(ok=False, error="Voxtral requires a configured Mistral API key.")

        # We don't do a full render, just return success if the key exists 
        # (Ready for Phase 10 truthful reporting)
        return TTSResult(ok=True)

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Run Voxtral synthesis through the standard engine contract."""

        self.validate_request(request)

        script_text = str(request["script_text"]).strip()
        voice_profile_id = str(request["voice_profile_id"]).strip()
        output_format = self._normalize_output_format(request, allow_mp3=True)
        output_path = self._resolve_output_path(request)
        voice_asset_id = str(request.get("voice_asset_id") or "").strip() or None
        reference_audio_path = str(request.get("reference_audio_path") or "").strip() or None
        reference_sample = str(request.get("reference_sample") or "").strip() or None
        on_output = self._resolve_on_output(request)
        cancel_check = self._resolve_cancel_check(request)

        cleanup_root: Path | None = None
        temp_wav: Path | None = None
        profile_name = voice_profile_id

        # Priority 1: Resolved voice_id from hook (becomes voice_asset_id for Voxtral)
        if request.get("voice_id"):
             voice_asset_id = str(request["voice_id"])

        render_wav_path = output_path
        if reference_audio_path:
            cleanup_root, profile_name, reference_sample = self._stage_reference_audio(
                voice_profile_id=voice_profile_id,
                reference_audio_path=Path(reference_audio_path),
            )
        if output_format == "mp3":
            fd, temp_wav_path = tempfile.mkstemp(
                prefix=f"{output_path.stem}_",
                suffix=".wav",
                dir=output_path.parent,
            )
            os.close(fd)
            temp_wav = Path(temp_wav_path)
            render_wav_path = temp_wav

        try:
            from .implementation import VoxtralError

            rc = voxtral_generate(
                text=script_text,
                out_wav=render_wav_path,
                on_output=on_output,
                cancel_check=cancel_check,
                profile_name=profile_name,
                voice_id=voice_asset_id,
                model=request.get("voxtral_model"),
                reference_sample=reference_sample,
            )
        except VoxtralError as exc:
            raise EngineExecutionError(f"Voxtral synthesis failed: {exc}") from exc
        finally:
            if cleanup_root is not None:
                shutil.rmtree(cleanup_root, ignore_errors=True)

        if rc != 0 or not render_wav_path.exists():
            raise EngineExecutionError("Voxtral synthesis did not produce an audio file.")

        if output_format == "mp3":
            conversion_rc = wav_to_mp3(
                render_wav_path,
                output_path,
                on_output=on_output,
                cancel_check=cancel_check,
            )
            try:
                render_wav_path.unlink(missing_ok=True)
            except TypeError:
                if render_wav_path.exists():
                    render_wav_path.unlink()
            if conversion_rc != 0 or not output_path.exists():
                raise EngineExecutionError("Voxtral synthesis did not produce a playable mp3 output.")

        return {
            "status": "ok",
            "bridge": "voice-synthesis-bridge",
            "engine_id": self.manifest.engine_id,
            "ephemeral": False,
            "audio_path": str(output_path),
            "audio_format": output_format,
            "request_fingerprint": request.get("request_fingerprint"),
            "synthesis_request": {
                "voice_profile_id": voice_profile_id,
                "engine_id": self.manifest.engine_id,
                "script_text": script_text,
                "reference_audio_path": reference_audio_path,
                "reference_sample": reference_sample,
                "voice_asset_id": voice_asset_id,
                "output_format": output_format,
                "output_path": str(output_path),
            },
        }

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run Voxtral preview/test synthesis through the standard contract."""

        self.validate_request(request)

        script_text = str(request["script_text"]).strip()
        voice_profile_id = str(request["voice_profile_id"]).strip()
        output_format = self._normalize_output_format(request)
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
            from .implementation import VoxtralError

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
                "reference_sample": request.get("reference_sample"),
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

    def _normalize_output_format(
        self,
        request: dict[str, object],
        *,
        allow_mp3: bool = False,
    ) -> str:
        output_format = str(request.get("output_format") or "wav").strip().lower() or "wav"
        allowed_formats = {"wav", "mp3"} if allow_mp3 else {"wav"}
        if output_format not in allowed_formats:
            if allow_mp3:
                raise EngineRequestError(
                    "Voxtral bridge synthesis currently supports output_format='wav' or 'mp3' only."
                )
            raise EngineRequestError(
                "Voxtral bridge preview currently supports output_format='wav' only."
            )
        return output_format

    def _resolve_output_path(self, request: dict[str, object]) -> Path:
        output_path = str(request.get("output_path") or "").strip()
        if not output_path:
            raise EngineRequestError("Voxtral synthesis requests must include output_path.")
        resolved = Path(output_path)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        return resolved

    def _resolve_on_output(self, request: dict[str, object]) -> Callable[[str], None]:
        on_output = request.get("on_output")
        if on_output is None:
            return lambda _line: None
        if not callable(on_output):
            raise EngineRequestError("Voxtral on_output callback must be callable.")
        return on_output

    def _resolve_cancel_check(self, request: dict[str, object]) -> Callable[[], bool]:
        cancel_check = request.get("cancel_check")
        if cancel_check is None:
            return lambda: False
        if not callable(cancel_check):
            raise EngineRequestError("Voxtral cancel_check callback must be callable.")
        return cancel_check

class VoxtralProcessingHooks(VoiceProcessingHooks):
    """Voxtral-specific processing hooks for Studio 2.0."""

    def plan_synthesis(self, req: TTSRequest) -> SynthesisPlan:
        """Return a synthesis plan for Voxtral.

        Voxtral handles long context well, so we don't enforce small chunks.
        """
        return SynthesisPlan(metadata={"engine": "voxtral"})

    def preprocess_request(self, request: dict[str, Any]) -> None:
        """Apply Voxtral-specific logic to the raw request."""
        # 1. Resolve reference audio path if not provided
        if not request.get("reference_audio_path"):
            profile_id = request.get("voice_profile_id")
            if profile_id:
                from app.jobs.speaker import get_speaker_wavs
                from app.jobs.worker_voice import _resolve_voxtral_reference_audio_path
                try:
                    sw = get_speaker_wavs(str(profile_id))
                    # Fallback to output_path parent for pdir if needed
                    pdir = Path(str(request.get("output_path", "."))).parent
                    resolved = _resolve_voxtral_reference_audio_path(
                        pdir=pdir,
                        reference_sample=request.get("reference_sample"),
                        speaker_wavs=sw
                    )
                    if resolved:
                        request["reference_audio_path"] = resolved
                except Exception:
                    pass

        # 2. Apply model from settings if not in request
        if not request.get("voxtral_model"):
            from app.state import get_settings
            settings = get_settings()
            request["voxtral_model"] = settings.get("voxtral_model")

    def select_voice(self, profile_id: str, settings: dict[str, Any]) -> str | None:
        """Resolve a Voxtral speaker profile into a voice ID."""
        from app.jobs.speaker import get_speaker_settings
        try:
            spk = get_speaker_settings(profile_id)
            return spk.get("voxtral_voice_id")
        except Exception:
            return None

    def check_readiness(self, profile_id: str, settings: dict[str, Any], profile_dir: str | None) -> tuple[bool, str]:
        """Voxtral is ready if it has a voice ID, a reference sample, or raw samples."""
        import os

        if settings.get("voxtral_voice_id"):
            return True, "OK"

        ref_sample = settings.get("reference_sample")
        if ref_sample and profile_dir and os.path.exists(os.path.join(profile_dir, ref_sample)):
            return True, "OK"

        if profile_dir and os.path.isdir(profile_dir):
            wavs = [f for f in os.listdir(profile_dir) if f.lower().endswith(".wav") and f != "sample.wav"]
            if wavs:
                return True, "OK"

        return False, "Add at least one sample or a voice ID before using this voice."
