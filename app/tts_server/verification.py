"""Verification synthesis runner for the TTS Server.

On startup (or when a plugin is refreshed), the TTS Server runs a short test
synthesis through each loaded engine to confirm it can actually produce audio.
An engine that passes environment checks but fails verification is marked
``unverified`` and blocked from production use until the user fixes the issue
and manually re-verifies.
"""

from __future__ import annotations

import logging
import time
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

    Delegates the actual test run to the plugin's own ``run_test()`` method
    to ensure plugins remain self-contained and agnostic of Studio paths.

    Args:
        plugin: The loaded plugin to verify.

    Returns:
        VerificationResult: Result of the verification attempt.
    """
    from app.tts_server.settings_store import calculate_verification_metadata, save_state # noqa: PLC0415

    engine_id = plugin.engine_id

    try:
        # Plugins are responsible for their own test execution and asset management.
        # This keeps them self-contained so they can be their own separate repos.
        start_time = time.perf_counter()
        result = plugin.engine.run_test()
        duration = time.perf_counter() - start_time

        # Normalize SDK VerificationResult to internal VerificationResult
        if not result.ok:
            return VerificationResult(
                engine_id=engine_id,
                ok=False,
                error=result.message or "Engine reported failure without message.",
            )

        # Persist verification state
        state = {
            "verified": True,
            "verification_error": None,
            "last_verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "metadata": calculate_verification_metadata(plugin.plugin_dir, plugin.manifest)
        }
        save_state(plugin.plugin_dir, state)

        return VerificationResult(
            engine_id=engine_id,
            ok=True,
            duration_sec=duration,
        )

    except Exception as exc:
        logger.exception("Plugin %s run_test() raised an unhandled exception", engine_id)
        return VerificationResult(
            engine_id=engine_id,
            ok=False,
            error=f"run_test() raised: {exc}",
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

            # Persist failure state
            from app.tts_server.settings_store import calculate_verification_metadata, save_state # noqa: PLC0415
            state = {
                "verified": False,
                "verification_error": result.error,
                "last_verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "metadata": calculate_verification_metadata(plugin.plugin_dir, plugin.manifest)
            }
            save_state(plugin.plugin_dir, state)
        results.append(result)
    return results
