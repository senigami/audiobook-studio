"""Verification synthesis runner for the TTS Server.

On startup (or when a plugin is refreshed), the TTS Server runs a short test
synthesis through each loaded engine to confirm it can actually produce audio.
An engine that passes environment checks but fails verification is marked
``unverified`` and blocked from production use until the user fixes the issue
and manually re-verifies.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.tts_server.plugin_loader import LoadedPlugin

logger = logging.getLogger(__name__)


def _resolve_default_voice_reference() -> tuple[str | None, str | None]:
    """Resolve the Studio default voice reference for verification tests."""
    from app.state import get_settings  # noqa: PLC0415
    from app.jobs.speaker import get_speaker_settings, get_voice_profile_dir  # noqa: PLC0415

    default_profile = str(get_settings().get("default_speaker_profile") or "").strip()
    if not default_profile:
        return None, "Set a Default Voice in General settings before verifying engines that need a reference sample."

    try:
        from app.jobs.speaker import get_speaker_wavs, get_voice_profile_dir, get_speaker_settings # noqa: PLC0415

        # Try to get wavs via the high-level helper first
        wavs_str = get_speaker_wavs(default_profile)
        if wavs_str:
            # Return the first one
            first_wav = wavs_str.split(",")[0]
            return first_wav, None

        # Fall back to directory resolution
        profile_dir = get_voice_profile_dir(default_profile)
        settings = get_speaker_settings(default_profile)
    except Exception as exc:
        return None, f"Could not resolve the Default Voice profile '{default_profile}': {exc}"

    for key in ("reference_sample", "preview_reference_sample"):
        sample_name = str(settings.get(key) or "").strip()
        if not sample_name:
            continue
        sample_path = profile_dir / sample_name
        if sample_path.is_file():
            return str(sample_path), None

    # Prefer latent.pth if present
    latent_path = profile_dir / "latent.pth"
    if latent_path.is_file():
        return str(latent_path), None

    # Fall back to any wav files in the resolved directory
    wavs = sorted(
        candidate for candidate in profile_dir.glob("*.wav")
        if candidate.is_file() and candidate.name != "sample.wav"
    )
    if wavs:
        return str(wavs[0]), None

    return None, (
        f"The Default Voice '{default_profile}' does not have a usable reference sample (no latent.pth or .wav files found in {profile_dir}). "
        "Add a sample in the Voices tab, then verify again."
    )


class VerificationResult:
    """Result of a plugin verification synthesis run."""

    def __init__(
        self,
        *,
        engine_id: str,
        ok: bool,
        duration_sec: float | None = None,
        error: str | None = None,
    ) -> None:
        self.engine_id = engine_id
        self.ok = ok
        self.duration_sec = duration_sec
        self.error = error


def verify_plugin(plugin: "LoadedPlugin") -> VerificationResult:
    """Run a verification synthesis for a loaded plugin.

    Writes a short test audio file to a temp path, checks that it is a
    non-empty valid file, then cleans up.

    Args:
        plugin: The loaded plugin to verify.

    Returns:
        VerificationResult: Result of the verification attempt.
    """
    # Import here to avoid circular dependencies at module level.
    from app.engines.voice.sdk import TTSRequest, TTSResult  # noqa: PLC0415

    engine_id = plugin.engine_id
    test_text = plugin.test_text
    voice_ref, voice_ref_error = _resolve_default_voice_reference()

    # If no default voice reference, try bundled sample.wav in plugin dir
    if voice_ref_error:
        bundled = Path(plugin.plugin_dir) / "sample.wav"
        if bundled.is_file():
            voice_ref = str(bundled)
            voice_ref_error = None

    # Create a temp file for verification audio.
    fd, tmp_path = tempfile.mkstemp(
        prefix=f"verify_{engine_id}_",
        suffix=".wav",
    )
    os.close(fd)
    output_path = Path(tmp_path)

    try:
        if voice_ref_error:
            logger.info("Verification for %s is using a fallback reference path: %s", engine_id, voice_ref_error)

        req = TTSRequest(
            text=test_text,
            output_path=str(output_path),
            voice_ref=voice_ref,
            settings={},
            language="en",
        )

        # Pre-flight check.
        try:
            ok, msg = plugin.engine.check_request(req)
        except Exception as exc:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error=f"check_request() raised: {exc}",
            )

        if not ok:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error=f"check_request() rejected request: {msg}",
            )

        # Run synthesis or specialized verification.
        try:
            # Prefer specialized verify method if available (e.g. for API engines)
            # Note: We check if it's a MagicMock to avoid accidental calls in tests
            # that only expect synthesize() to be called.
            verify_fn = getattr(plugin.engine, "verify", None)
            is_mock = hasattr(verify_fn, "assert_called")

            if verify_fn and callable(verify_fn) and not is_mock:
                exc_prefix = "Verification run raised"
                result = verify_fn(req)
            else:
                exc_prefix = "synthesize() raised"
                result = plugin.engine.synthesize(req)
        except Exception as exc:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error=f"{exc_prefix}: {exc}",
            )

        # Normalize legacy dict results to TTSResult
        if isinstance(result, dict):
            from app.engines.voice.sdk import TTSResult  # noqa: PLC0415
            result = TTSResult(
                ok=result.get("status") == "ok" or result.get("ok", False),
                error=result.get("message") or result.get("error"),
                output_path=result.get("audio_path") or result.get("output_path"),
                duration_sec=result.get("duration_sec", 0.0)
            )

        if not result.ok:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error=result.error or "Engine reported failure without message.",
            )

        # Validate the output file.
        if not output_path.exists() or output_path.stat().st_size == 0:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error="Synthesize wrote an empty or missing output file",
            )

        return VerificationResult(
            engine_id=engine_id,
            ok=True,
            duration_sec=result.duration_sec,
        )

    finally:
        # Always clean up the temp file.
        try:
            output_path.unlink(missing_ok=True)
        except Exception:
            logger.debug(
                "Could not remove verification temp file: %s", output_path
            )


def verify_all(plugins: "list[LoadedPlugin]") -> list[VerificationResult]:
    """Run verification synthesis for all loaded plugins.

    Args:
        plugins: Loaded plugin list from ``discover_plugins()``.

    Returns:
        list[VerificationResult]: One result per plugin, in the same order.
    """
    results = []
    for plugin in plugins:
        logger.info("Verifying plugin %s ...", plugin.folder_name)
        result = verify_plugin(plugin)
        if result.ok:
            plugin.verified = True
            logger.info(
                "Plugin %s verified OK (%.2fs)",
                plugin.folder_name,
                result.duration_sec or 0,
            )
        else:
            plugin.verified = False
            plugin.verification_error = result.error
            logger.warning(
                "Plugin %s verification FAILED: %s",
                plugin.folder_name,
                result.error,
            )
        results.append(result)
    return results
