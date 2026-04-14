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

    # Create a temp file for verification audio.
    fd, tmp_path = tempfile.mkstemp(
        prefix=f"verify_{engine_id}_",
        suffix=".wav",
    )
    os.close(fd)
    output_path = Path(tmp_path)

    try:
        req = TTSRequest(
            text=test_text,
            output_path=str(output_path),
            voice_ref=None,
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

        # Run synthesis.
        try:
            result: TTSResult = plugin.engine.synthesize(req)
        except Exception as exc:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error=f"synthesize() raised: {exc}",
            )

        if not result.ok:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error=result.error or "synthesize() returned ok=False",
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
