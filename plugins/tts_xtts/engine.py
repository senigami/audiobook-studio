"""XTTS plugin engine for Studio 2.0.

Implements the ``StudioTTSEngine`` SDK contract.  This module runs inside the
TTS Server subprocess.  It must NOT import from ``app.api``, ``app.domain``,
``app.orchestration``, or ``app.db``.  All Studio internals are accessed via
the HTTP boundary.

The engine delegates actual synthesis to the legacy ``app.engines.xtts_generate``
helper (which manages the XTTS subprocess) via a late import so that loading
this module does not trigger model loading.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

# SDK contract types — the only app.* import allowed in plugin code.
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.engines.voice.base import StudioTTSEngine


class XttsPlugin(StudioTTSEngine):
    """XTTS voice synthesis plugin for Audiobook Studio."""

    def info(self) -> dict[str, Any]:
        """Return runtime environment metadata."""
        env_activate = os.environ.get("XTTS_ENV_ACTIVATE", "")
        env_python = os.environ.get("XTTS_ENV_PYTHON", "")
        return {
            "env_activate": env_activate,
            "env_python": env_python,
            "env_available": bool(env_activate and Path(env_activate).exists()),
        }

    def check_env(self) -> tuple[bool, str]:
        """Verify the XTTS virtual environment is configured."""
        env_activate = os.environ.get("XTTS_ENV_ACTIVATE", "")
        env_python = os.environ.get("XTTS_ENV_PYTHON", "")

        if not env_activate:
            return False, "XTTS_ENV_ACTIVATE environment variable is not set."
        if not Path(env_activate).exists():
            return (
                False,
                f"XTTS_ENV_ACTIVATE path does not exist: {env_activate}",
            )
        if not env_python:
            return False, "XTTS_ENV_PYTHON environment variable is not set."
        if not Path(env_python).exists():
            return (
                False,
                f"XTTS_ENV_PYTHON path does not exist: {env_python}",
            )

        return True, "OK"

    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Validate an XTTS synthesis request."""
        if not req.text or not req.text.strip():
            return False, "text must not be empty."

        if not req.output_path or not req.output_path.strip():
            return False, "output_path must not be empty."

        output_path = Path(req.output_path)
        if output_path.suffix.lower() not in (".wav", ".mp3"):
            return False, "output_path must end with .wav or .mp3."

        if req.voice_ref:
            voice_ref = Path(req.voice_ref)
            if not voice_ref.exists() or not voice_ref.is_file():
                return False, f"voice_ref path does not exist: {req.voice_ref}"
            if voice_ref.suffix.lower() != ".wav":
                return False, "voice_ref must be a .wav file for XTTS."

        return True, "OK"

    def settings_schema(self) -> dict[str, Any]:
        """Return the XTTS settings JSON Schema."""
        schema_path = Path(__file__).parent / "settings_schema.json"
        try:
            return json.loads(schema_path.read_text(encoding="utf-8"))
        except Exception:
            return {"type": "object", "properties": {}}

    def synthesize(self, req: TTSRequest) -> TTSResult:
        """Run XTTS synthesis and write audio to req.output_path."""
        ok, msg = self.check_request(req)
        if not ok:
            return TTSResult(ok=False, error=f"check_request failed: {msg}")

        output_path = Path(req.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_format = output_path.suffix.lower().lstrip(".")  # "wav" or "mp3"

        speed = float(req.settings.get("speed", 1.0))
        safe_mode = bool(req.settings.get("safe_mode", True))

        # Resolve the speaker WAV and optional voice profile directory.
        speaker_wav, voice_profile_dir = self._resolve_voice_inputs(req)
        if speaker_wav is None and voice_profile_dir is None:
            return TTSResult(
                ok=False,
                error=(
                    "XTTS requires voice_ref (a .wav reference) or a voice profile "
                    "directory to be configured."
                ),
            )

        render_wav_path = output_path
        temp_wav: Path | None = None

        if output_format == "mp3":
            fd, tmp = tempfile.mkstemp(
                prefix=f"{output_path.stem}_",
                suffix=".wav",
                dir=output_path.parent,
            )
            os.close(fd)
            temp_wav = Path(tmp)
            render_wav_path = temp_wav

        try:
            rc = self._xtts_generate(
                text=req.text.strip(),
                out_wav=render_wav_path,
                safe_mode=safe_mode,
                on_output=lambda _: None,
                cancel_check=lambda: False,
                speaker_wav=speaker_wav,
                speed=speed,
                voice_profile_dir=voice_profile_dir,
            )
        except Exception as exc:
            return TTSResult(ok=False, error=f"XTTS synthesis raised: {exc}")
        finally:
            if temp_wav and temp_wav.exists() and rc != 0:
                temp_wav.unlink(missing_ok=True)

        if rc != 0 or not render_wav_path.exists():
            return TTSResult(
                ok=False, error="XTTS synthesis did not produce an audio file."
            )

        if output_format == "mp3" and temp_wav is not None:
            mp3_rc = self._wav_to_mp3(temp_wav, output_path)
            try:
                temp_wav.unlink(missing_ok=True)
            except Exception:
                pass
            if mp3_rc != 0 or not output_path.exists():
                return TTSResult(
                    ok=False,
                    error="XTTS mp3 conversion did not produce a valid file.",
                )

        return TTSResult(
            ok=True,
            output_path=str(output_path),
        )

    def preview(self, req: TTSRequest) -> TTSResult:
        """Run a lightweight XTTS preview synthesis to a temp file."""
        ok, msg = self.check_request(req)
        if not ok:
            return TTSResult(ok=False, error=f"check_request failed: {msg}")

        speed = float(req.settings.get("speed", 1.0))
        safe_mode = bool(req.settings.get("safe_mode", True))

        speaker_wav, voice_profile_dir = self._resolve_voice_inputs(req)
        if speaker_wav is None and voice_profile_dir is None:
            return TTSResult(
                ok=False,
                error="XTTS preview requires voice_ref or a configured voice profile.",
            )

        try:
            rc = self._xtts_generate(
                text=req.text.strip(),
                out_wav=Path(req.output_path),
                safe_mode=safe_mode,
                on_output=lambda _: None,
                cancel_check=lambda: False,
                speaker_wav=speaker_wav,
                speed=speed,
                voice_profile_dir=voice_profile_dir,
            )
        except Exception as exc:
            return TTSResult(ok=False, error=f"XTTS preview raised: {exc}")

        output_path = Path(req.output_path)
        if rc != 0 or not output_path.exists():
            return TTSResult(
                ok=False, error="XTTS preview did not produce an audio file."
            )

        return TTSResult(ok=True, output_path=str(output_path))

    def shutdown(self) -> None:
        """No persistent resources to clean up for XTTS plugin."""
        pass

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _resolve_voice_inputs(
        self, req: TTSRequest
    ) -> tuple[str | None, Path | None]:
        """Resolve the speaker WAV and voice profile dir for a request."""
        if req.voice_ref:
            return req.voice_ref, None

        # Fall back to the legacy voice engine helper for profile resolution.
        try:
            from app.voice_engines import resolve_xtts_preview_inputs  # noqa: PLC0415

            profile_id = req.settings.get("voice_profile_id", "")
            if profile_id:
                speaker_wav, voice_profile_dir = resolve_xtts_preview_inputs(
                    str(profile_id)
                )
                return speaker_wav, voice_profile_dir
        except Exception:
            pass

        return None, None

    @staticmethod
    def _xtts_generate(
        *,
        text: str,
        out_wav: Path,
        safe_mode: bool,
        on_output,
        cancel_check,
        speaker_wav: str | None,
        speed: float,
        voice_profile_dir: Path | None,
    ) -> int:
        """Delegate synthesis to the legacy XTTS generator."""
        from app.engines import xtts_generate as _gen  # noqa: PLC0415

        return _gen(
            text=text,
            out_wav=out_wav,
            safe_mode=safe_mode,
            on_output=on_output,
            cancel_check=cancel_check,
            speaker_wav=speaker_wav,
            speed=speed,
            voice_profile_dir=voice_profile_dir,
        )

    @staticmethod
    def _wav_to_mp3(in_wav: Path, out_mp3: Path) -> int:
        """Delegate WAV→MP3 conversion to the legacy helper."""
        from app.engines import wav_to_mp3 as _conv  # noqa: PLC0415

        return _conv(in_wav=in_wav, out_mp3=out_mp3)
