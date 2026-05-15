"""Voxtral plugin engine for Studio 2.0.

Implements the ``StudioTTSEngine`` SDK contract.  This module runs inside the
TTS Server subprocess.  It must NOT import from ``app.api``, ``app.domain``,
``app.orchestration``, or ``app.db``.

Delegates to plugin-owned implementation helpers via late imports.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from app.engines.voice.sdk import TTSRequest, TTSResult, VerificationResult
from app.engines.voice.base import StudioTTSEngine


class VoxtralPlugin(StudioTTSEngine):
    """Voxtral (Mistral AI) speech synthesis plugin for Audiobook Studio."""

    def verify(self, req: TTSRequest) -> VerificationResult:
        """Perform a real API connectivity check by listing models."""
        from ..core.implementation import list_mistral_models  # noqa: PLC0415

        api_key = self._resolve_api_key()
        if not api_key:
            return VerificationResult(
                ok=False,
                message="Mistral API key is missing. Set it in settings or environment.",
            )

        try:
            models = list_mistral_models(strict=True)
        except Exception as exc:
            return VerificationResult(
                ok=False,
                message=f"Could not validate API key with Mistral. Please check your key and connectivity. ({exc})",
            )

        return VerificationResult(
            ok=True,
            message=f"Successfully connected to Mistral AI. Detected {len(models)} models.",
        )

    def run_test(self) -> VerificationResult:
        """Run a self-contained synthesis test."""
        ok, msg = self.check_env()
        if not ok:
            return VerificationResult(ok=False, message=msg)

        plugin_dir = Path(__file__).parents[2]
        assets_dir = plugin_dir / "assets"
        assets_dir.mkdir(exist_ok=True)

        # 1. Resolve input asset
        voice_ref = None
        for name in ["voice.wav", "voice.mp3", "sample.wav", "sample.mp3"]:
            cand = assets_dir / name
            if cand.is_file():
                voice_ref = str(cand)
                break

        if not voice_ref:
            return VerificationResult(ok=False, message="No test assets found in assets/ folder.")

        # 2. Setup output path inside plugin folder
        output_path = assets_dir / "test_output.wav"

        # 3. Create request
        manifest_path = plugin_dir / "manifest.json"
        test_text = "This is an internal Voxtral verification test."
        try:
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                test_text = manifest.get("test_text") or test_text
        except Exception:
            pass

        req = TTSRequest(
            text=test_text,
            output_path=str(output_path),
            voice_ref=voice_ref,
        )

        # 4. Run synthesis
        result = self.synthesize(req)
        if result.ok:
            return VerificationResult(ok=True, message=f"Test passed. Output: {output_path.name}")
        return VerificationResult(ok=False, message=f"Test failed: {result.error}")

    def info(self) -> dict[str, Any]:
        """Return runtime metadata including detected model and available models."""
        from ..core.implementation import list_mistral_models  # noqa: PLC0415
        model = self._resolve_model()
        api_key_set = bool(self._resolve_api_key())
        available_models = list_mistral_models() if api_key_set else []

        return {
            "model": model,
            "api_key_configured": api_key_set,
            "available_models": available_models,
            "source": "Mistral AI Cloud API",
        }

    def check_env(self) -> tuple[bool, str]:
        """Verify that a Mistral API key is available."""
        api_key = self._resolve_api_key()
        if not api_key:
            return (
                False,
                "Voxtral requires MISTRAL_API_KEY environment variable.",
            )
        return True, "OK"

    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Validate a Voxtral synthesis request."""
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

        return True, "OK"

    def settings_schema(self) -> dict[str, Any]:
        """Return the Voxtral settings JSON Schema, injecting discovered models."""
        schema_path = Path(__file__).parents[2] / "settings_schema.json"
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))

            # Inject available models into the enum if possible
            from ..core.implementation import list_mistral_models  # noqa: PLC0415
            models = list_mistral_models()
            if models and "model" in schema.get("properties", {}):
                schema["properties"]["model"]["enum"] = models
                if "mistral-tts-latest" in models:
                    schema["properties"]["model"]["default"] = "mistral-tts-latest"

            return schema
        except Exception:
            return {"type": "object", "properties": {}}

    def synthesize(self, req: TTSRequest) -> TTSResult:
        """Run Voxtral synthesis and write audio to req.output_path."""
        ok, msg = self.check_request(req)
        if not ok:
            return TTSResult(ok=False, error=f"check_request failed: {msg}")

        output_path = Path(req.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_format = output_path.suffix.lower().lstrip(".")

        model = req.settings.get("model") or self._resolve_model(req.settings)

        profile_name: str = ""
        reference_sample: str | None = None
        voice_asset_id: str | None = req.settings.get("voice_asset_id") or None
        voice_profile_dir: Path | None = None

        vdir = req.settings.get("voice_profile_dir")
        if req.voice_ref:
            vref_path = Path(req.voice_ref)
            voice_profile_dir = vref_path.parent
            reference_sample = vref_path.name
        elif vdir:
             profile_name = str(req.settings.get("voice_profile_id", ""))
             voice_profile_dir = Path(vdir)
             reference_sample = req.settings.get("reference_sample") or None
        else:
            profile_name = str(req.settings.get("voice_profile_id", ""))
            reference_sample = req.settings.get("reference_sample") or None

        if not profile_name and not voice_profile_dir:
            return TTSResult(
                ok=False,
                error=(
                    "Voxtral requires voice_ref, voice_profile_dir, or voice_profile_id in settings."
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
            rc = self._voxtral_generate(
                text=req.text.strip(),
                out_wav=render_wav_path,
                profile_name=profile_name,
                voice_id=voice_asset_id,
                model=model,
                reference_sample=reference_sample,
                task_id=req.task_id,
                voice_profile_dir=voice_profile_dir,
                settings=req.settings,
            )
        except Exception as exc:
            return TTSResult(ok=False, error=f"Voxtral synthesis raised: {exc}")

        if rc != 0 or not render_wav_path.exists():
            return TTSResult(
                ok=False, error="Voxtral synthesis did not produce an audio file."
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
                    error="Voxtral mp3 conversion did not produce a valid file.",
                )

        return TTSResult(ok=True, output_path=str(output_path))

    def preview(self, req: TTSRequest) -> TTSResult:
        """Run a Voxtral preview synthesis."""
        ok, msg = self.check_request(req)
        if not ok:
            return TTSResult(ok=False, error=f"check_request failed: {msg}")

        profile_name = str(req.settings.get("voice_profile_id", ""))
        voice_asset_id: str | None = req.settings.get(
            "voice_asset_id"
        ) or None

        reference_sample: str | None = None
        voice_profile_dir: Path | None = None

        if req.voice_ref:
            vref_path = Path(req.voice_ref)
            voice_profile_dir = vref_path.parent
            reference_sample = vref_path.name
        else:
            reference_sample = req.settings.get("reference_sample") or None
            vdir = req.settings.get("voice_profile_dir")
            if vdir:
                voice_profile_dir = Path(vdir)

        if not profile_name and not voice_profile_dir:
            return TTSResult(
                ok=False,
                error="Voxtral preview requires voice_ref or voice_profile_id.",
            )

        model = req.settings.get("model") or self._resolve_model(req.settings)

        try:
            rc = self._voxtral_generate(
                text=req.text.strip(),
                out_wav=Path(req.output_path),
                profile_name=profile_name,
                voice_id=voice_asset_id,
                model=model,
                reference_sample=reference_sample,
                task_id=req.task_id,
                voice_profile_dir=voice_profile_dir,
                settings=req.settings,
            )
        except Exception as exc:
            return TTSResult(ok=False, error=f"Voxtral preview raised: {exc}")

        output_path = Path(req.output_path)
        if rc != 0 or not output_path.exists():
            return TTSResult(
                ok=False, error="Voxtral preview did not produce an audio file."
            )

        return TTSResult(ok=True, output_path=str(output_path))

    def shutdown(self) -> None:
        """No persistent resources to clean up for Voxtral plugin."""
        pass

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_api_key(settings: dict[str, Any] | None = None) -> str | None:
        try:
            from ..core.implementation import resolve_mistral_api_key  # noqa: PLC0415

            return resolve_mistral_api_key(settings=settings)
        except Exception:
            return os.environ.get("MISTRAL_API_KEY") or None

    @staticmethod
    def _resolve_model(settings: dict[str, Any] | None = None) -> str:
        try:
            from ..core.implementation import resolve_voxtral_model  # noqa: PLC0415

            return resolve_voxtral_model(settings=settings)
        except Exception:
            return "mistral-tts-1"



    @staticmethod
    def _voxtral_generate(
        *,
        text: str,
        out_wav: Path,
        profile_name: str,
        voice_id: str | None,
        model: str | None,
        reference_sample: str | None,
        task_id: str | None = None,
        voice_profile_dir: Path | None = None,
        settings: dict[str, Any] | None = None,
    ) -> int:
        from ..core.implementation import voxtral_generate as _gen  # noqa: PLC0415

        return _gen(
            text=text,
            out_wav=out_wav,
            profile_name=profile_name,
            voice_id=voice_id,
            model=model,
            reference_sample=reference_sample,
            task_id=task_id,
            voice_profile_dir=voice_profile_dir,
            settings=settings,
        )

    @staticmethod
    def _wav_to_mp3(in_wav: Path, out_mp3: Path) -> int:
        from app.engines.audio_ops import wav_to_mp3 as _conv  # noqa: PLC0415

        return _conv(in_wav=in_wav, out_mp3=out_mp3)
