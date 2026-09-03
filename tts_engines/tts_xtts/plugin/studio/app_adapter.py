"""XTTS engine adapter scaffold for Studio 2.0.

This module will wrap the existing XTTS behavior behind the standard engine
contract without leaking XTTS-specific process management into the scheduler.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from studio_plugin_sdk import (
    EngineExecutionError,
    EngineHealthModel,
    EngineManifestModel,
    EngineRequestError,
    SynthesisPlan,
    TTSRequest,
    TTSResult,
    VoiceProcessingHooks,
)
from studio_plugin_sdk.engine_adapter import (
    normalize_output_format,
    resolve_cancel_check,
    resolve_on_output,
    resolve_output_path,
)
from studio_plugin_sdk.plugin_utils import load_settings_schema

# The app-adapter contract (issue #200 Stage C): XttsVoiceEngine satisfies
# studio_plugin_sdk.VoiceEngineAdapter structurally and subclasses nothing
# host-side, so this module has zero app.* imports at any scope and the plugin
# can be extracted into its own repo (issue #189).
#
# Upstream: the Studio host's engine registry. Must not import
# app.orchestration / app.api.routers / app.jobs, or anything else app-side.


def _get_ctx():
    from studio_plugin_sdk import get_plugin_ctx  # noqa: PLC0415
    return get_plugin_ctx("xtts")


def _resolve_voice_inputs(voice_profile_id: str) -> tuple[str | None, Path | None]:
    """Resolve (speaker_wav, voice_profile_dir) for a profile via the SDK context.

    Wraps ctx.resolve_voice_preview_inputs's dict return shape
    ({"voice_ref": str|None, "voice_profile_dir": str|None}) back into the
    (str|None, Path|None) tuple this adapter's callers expect, and classifies
    any failure as EngineExecutionError so it doesn't escape this file's
    error contract unclassified.
    """
    try:
        preview_inputs = _get_ctx().resolve_voice_preview_inputs(voice_profile_id)
    except Exception as exc:
        raise EngineExecutionError(f"Failed to resolve voice profile inputs: {exc}") from exc
    speaker_wav = preview_inputs["voice_ref"]
    voice_profile_dir_str = preview_inputs["voice_profile_dir"]
    voice_profile_dir = Path(voice_profile_dir_str) if voice_profile_dir_str else None
    return speaker_wav, voice_profile_dir


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
    task_id: str | None = None,
) -> int:
    """Invoke the XTTS runtime generator lazily."""

    from ..core.implementation import (
        xtts_generate, xtts_generate_script, get_speaker_latent_path,
        migrate_speaker_latent_to_profile
    )

    return xtts_generate(
        text=text,
        out_wav=out_wav,
        safe_mode=safe_mode,
        on_output=on_output,
        cancel_check=cancel_check,
        speaker_wav=speaker_wav,
        speed=speed,
        voice_profile_dir=voice_profile_dir,
        task_id=task_id,
    )


def xtts_generate_script(
    *,
    script_json_path: Path,
    out_wav: Path,
    on_output,
    cancel_check,
    speed: float = 1.0,
    task_id: str | None = None,
) -> int:
    """Invoke the XTTS script generator lazily."""

    from ..core.implementation import xtts_generate_script as generate_script

    return generate_script(
        script_json_path=script_json_path,
        out_wav=out_wav,
        on_output=on_output,
        cancel_check=cancel_check,
        speed=speed,
        task_id=task_id,
    )


class XttsVoiceEngine:
    """Standard XTTS adapter placeholder."""

    def __init__(self, *, manifest: EngineManifestModel):
        self.manifest = manifest

    def hooks(self) -> VoiceProcessingHooks:
        """Return XTTS-specific processing hooks."""
        return XttsProcessingHooks()

    def describe_health(self) -> EngineHealthModel:
        """Summarize XTTS adapter readiness without triggering side effects.

        Delegates to ``xtts_env_ready()`` (the same filesystem-only check
        ``check_env()``/``info()`` use in the TTS Server process, see BUG 1
        / plugin-contract.md v1.8.0) rather than checking a ``.venv`` inside
        the plugin's own folder (never created by any provisioning path) or
        treating ``requirements.txt`` existing as "dependencies satisfied" --
        both were placeholder checks that never reflected real readiness.

        The env path constants for ``details`` are read from
        ``core.implementation`` (the same module ``xtts_env_ready()`` itself
        uses) rather than redefined in this file -- two independently
        evaluated copies of the same ``os.getenv()`` reads is how a future
        edit produces a readiness verdict from one copy and stale ``details``
        paths from the other.
        """
        from ..core import implementation as xtts_impl  # noqa: PLC0415

        ready, message = xtts_impl.xtts_env_ready()
        status = "ready" if ready else "needs_setup"

        return EngineHealthModel(
            engine_id=self.manifest.engine_id,
            available=ready,
            ready=ready,
            status=status,
            message=None if ready else message,
            dependencies_satisfied=ready,
            missing_dependencies=[],
            details={
                "env_activate": str(xtts_impl.XTTS_ENV_ACTIVATE),
                "env_python": str(xtts_impl.XTTS_ENV_PYTHON),
                "env_dir": str(xtts_impl.XTTS_ENV_DIR),
            },
        )

    def settings_schema(self) -> dict[str, object]:
        """Return the XTTS settings schema used by the Settings UI."""
        schema_path = Path(__file__).parents[2] / "settings_schema.json"
        schema = load_settings_schema(schema_path, engine_name="XTTS")
        return dict(schema) if isinstance(schema, dict) else {}

    def current_settings(self) -> dict[str, object]:
        """Return the adapter's persisted settings snapshot.

        Empty by design: XTTS settings are owned by the TTS Server's settings
        store and reach the host through the /engines detail payload, never
        through this adapter. Previously inherited from BaseVoiceEngine with
        the same empty return; declared here now that the adapter satisfies
        VoiceEngineAdapter structurally instead of by inheritance.
        """
        return {}

    def validate_environment(self) -> None:
        """Not implemented on the app side.

        Readiness for XTTS is a filesystem check of the external ~/xtts-env,
        reported through describe_health(). Kept on the contract, and raising,
        exactly as the inherited BaseVoiceEngine version did.
        """
        raise NotImplementedError("XTTS readiness is reported by describe_health(), not validate_environment().")

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Not implemented on the app side.

        XTTS voice assets are built through the TTS Server's own job path.
        Kept on the contract, and raising, exactly as the inherited
        BaseVoiceEngine version did.
        """
        raise NotImplementedError("XTTS does not build voice assets through the app adapter.")

    def validate_request(self, request: dict[str, object]) -> None:
        """Describe XTTS request validation."""
        if not isinstance(request, dict):
            raise EngineRequestError("XTTS requests must be provided as a mapping.")
        engine_id = str(request.get("engine_id") or "").strip()
        if engine_id and engine_id != self.manifest.engine_id:
            raise EngineRequestError("XTTS request is targeting a different engine.")
        if not str(request.get("voice_profile_id") or "").strip():
            raise EngineRequestError("XTTS requests must include voice_profile_id.")
        if not str(request.get("script_text") or "").strip() and not request.get("script"):
            raise EngineRequestError("XTTS requests must include script_text.")
        is_synthesis_request = bool(str(request.get("output_path") or "").strip())
        output_format = normalize_output_format(request, engine_name="XTTS", allow_mp3=is_synthesis_request)
        reference_audio_path = str(request.get("reference_audio_path") or "").strip()
        if reference_audio_path:
            reference_path = Path(reference_audio_path)
            if not reference_path.exists() or not reference_path.is_file():
                raise EngineRequestError("XTTS reference audio path does not exist.")
            if reference_path.suffix.lower() != ".wav":
                raise EngineRequestError("XTTS bridge preview requires reference_audio_path to be a .wav file.")
        output_path = str(request.get("output_path") or "").strip()
        if output_path and output_format == "wav" and Path(output_path).suffix.lower() != ".wav":
            raise EngineRequestError("XTTS wav synthesis output_path must end with .wav.")
        if output_path and output_format == "mp3" and Path(output_path).suffix.lower() != ".mp3":
            raise EngineRequestError("XTTS mp3 synthesis output_path must end with .mp3.")

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Run XTTS synthesis through the standard engine contract."""

        self.validate_request(request)

        script_text = str(request["script_text"]).strip()
        voice_profile_id = str(request["voice_profile_id"]).strip()
        output_format = normalize_output_format(request, engine_name="XTTS", allow_mp3=True)
        output_path = resolve_output_path(request, engine_name="XTTS")
        safe_mode = bool(request.get("safe_mode", True))
        speed = float(request.get("speed", 1.0) or 1.0)
        reference_audio_path = str(request.get("reference_audio_path") or "").strip() or None
        voice_asset_id = str(request.get("voice_asset_id") or "").strip() or None
        on_output = resolve_on_output(request, engine_name="XTTS")
        cancel_check = resolve_cancel_check(request, engine_name="XTTS")

        speaker_wav: str | None = None
        voice_profile_dir: Path | None = None

        # Priority 1: Resolved voice_id from hook
        if request.get("voice_id"):
            speaker_wav = str(request["voice_id"])
        # Priority 2: Explicit reference path
        elif reference_audio_path:
            speaker_wav = reference_audio_path
        # Priority 3: Resolve from profile
        else:
            speaker_wav, voice_profile_dir = _resolve_voice_inputs(voice_profile_id)
            if voice_profile_dir is None:
                raise EngineRequestError(
                    "XTTS synthesis requires an existing voice profile directory or reference_audio_path."
                )

        render_wav_path = output_path
        temp_wav: Path | None = None
        if output_format == "mp3":
            fd, temp_wav_path = tempfile.mkstemp(
                prefix=f"{output_path.stem}_",
                suffix=".wav",
                dir=output_path.parent,
            )
            os.close(fd)
            temp_wav = Path(temp_wav_path)
            render_wav_path = temp_wav

        synth_started = time.monotonic()
        try:
            if request.get("script"):
                # Handle script-based synthesis
                script_data = request["script"]
                # Write to a temp file because the generator expects a path.
                with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                    json.dump(script_data, f)
                    temp_script_path = Path(f.name)

                try:
                    rc = xtts_generate_script(
                        script_json_path=temp_script_path,
                        out_wav=render_wav_path,
                        on_output=on_output,
                        cancel_check=cancel_check,
                        speed=speed,
                        task_id=str(request.get("task_id") or "") or None,
                    )
                finally:
                    if temp_script_path.exists():
                        temp_script_path.unlink()
            else:
                # Fallback to single-text synthesis
                rc = xtts_generate(
                    text=script_text,
                    out_wav=render_wav_path,
                    safe_mode=safe_mode,
                    on_output=on_output,
                    cancel_check=cancel_check,
                    speaker_wav=speaker_wav,
                    speed=speed,
                    voice_profile_dir=voice_profile_dir,
                    task_id=str(request.get("task_id") or "") or None,
                )
        except Exception as exc:
            raise EngineExecutionError(f"XTTS synthesis failed - {exc}") from exc
        synthesis_duration_sec = max(0.001, time.monotonic() - synth_started)

        if rc != 0 or not render_wav_path.exists():
            raise EngineExecutionError("XTTS synthesis did not produce an audio file.")

        if output_format == "mp3":
            conversion_rc = _get_ctx().wav_to_mp3(
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
                raise EngineExecutionError("XTTS synthesis did not produce a playable mp3 output.")

        return {
            "status": "ok",
            "bridge": "voice-synthesis-bridge",
            "engine_id": self.manifest.engine_id,
            "ephemeral": False,
            "audio_path": str(output_path),
            "audio_format": output_format,
            "duration_sec": synthesis_duration_sec,
            "request_fingerprint": request.get("request_fingerprint"),
            "synthesis_request": {
                "voice_profile_id": voice_profile_id,
                "engine_id": self.manifest.engine_id,
                "script_text": script_text,
                "reference_audio_path": reference_audio_path,
                "reference_sample": request.get("reference_sample"),
                "voice_asset_id": voice_asset_id,
                "output_format": output_format,
                "output_path": str(output_path),
            },
        }

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run XTTS preview/test synthesis through the standard contract."""

        self.validate_request(request)

        script_text = str(request["script_text"]).strip()
        voice_profile_id = str(request["voice_profile_id"]).strip()
        output_format = normalize_output_format(request, engine_name="XTTS")
        safe_mode = bool(request.get("safe_mode", True))
        speed = float(request.get("speed", 1.0) or 1.0)
        reference_audio_path = str(request.get("reference_audio_path") or "").strip() or None
        voice_asset_id = str(request.get("voice_asset_id") or "").strip() or None

        speaker_wav: str | None = None
        voice_profile_dir: Path | None = None
        if reference_audio_path:
            speaker_wav = reference_audio_path
        else:
            speaker_wav, voice_profile_dir = _resolve_voice_inputs(voice_profile_id)
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
            raise EngineExecutionError(f"XTTS preview failed - {exc}") from exc

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
                "reference_sample": request.get("reference_sample"),
                "voice_asset_id": voice_asset_id,
                "output_format": output_format,
            },
        }

class XttsProcessingHooks(VoiceProcessingHooks):
    """XTTS-specific processing hooks for Studio 2.0."""

    def plan_synthesis(self, req: TTSRequest) -> SynthesisPlan:
        """Return a synthesis plan optimized for XTTS.

        XTTS performs best with shorter sentences; we leverage the established
        SENT_CHAR_LIMIT for chunking.
        """
        limit = _get_ctx().get_text_chunk_limit("xtts")
        return SynthesisPlan(
            chunk_size=limit,
            metadata={"engine": "xtts"}
        )

    def preprocess_request(self, request: dict[str, Any]) -> None:
        """Apply XTTS-specific defaults to the raw request."""
        if "safe_mode" not in request:
            request["safe_mode"] = True
        if "speed" not in request:
            # Attempt to resolve speed from profile if available
            profile_id = request.get("voice_profile_id")
            if profile_id:
                try:
                    spk = _get_ctx().get_voice_settings(str(profile_id))
                    request["speed"] = spk.get("speed", 1.0)
                except Exception:
                    request["speed"] = 1.0
            else:
                request["speed"] = 1.0

    def select_voice(self, profile_id: str, settings: dict[str, Any]) -> str | None:
        """Resolve an XTTS speaker profile into a reference WAV path."""
        try:
            wavs = _get_ctx().get_speaker_wavs(profile_id)
        except Exception:
            return None
        # ctx hands back the split list; this hook's contract is a single
        # string, and the consumer still parses it as comma-separated.
        return ",".join(wavs) if wavs else None

    def check_readiness(self, profile_id: str, settings: dict[str, Any], profile_dir: str | None) -> tuple[bool, str]:
        """XTTS is ready if it has raw samples or a latent."""
        import os
        from pathlib import Path

        # Check for samples
        if profile_dir and os.path.isdir(profile_dir):
            wavs = [f for f in os.listdir(profile_dir) if f.lower().endswith(".wav") and f != "sample.wav"]
            if wavs:
                return True, "OK"

            # Check for latent
            if (Path(profile_dir) / "latent.pth").exists():
                return True, "OK"

        return False, "Add at least one sample or keep a latent before using this voice."
