"""Verification synthesis runner for the TTS Server.

Verification is an explicit user action from engine settings. It runs a short
test synthesis through the selected engine to confirm it can produce audio.
Automatic startup verification is intentionally avoided because plugin tests
may generate files such as ``test_output.wav`` and emit synthesis progress.
"""

from __future__ import annotations

import inspect
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
    from app.tts_server.settings_store import calculate_verification_metadata, load_settings, save_state # noqa: PLC0415

    engine_id = plugin.engine_id

    try:
        # Plugins are responsible for their own test execution and asset management.
        # This keeps them self-contained so they can be their own separate repos.
        wall_start = time.time()
        start_time = time.perf_counter()
        run_test = plugin.engine.run_test
        if _accepts_settings(run_test):
            result = run_test(settings=load_settings(plugin.plugin_dir))
        else:
            result = run_test()
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

        # Record a performance sample for calibration
        try:
            from app.db.performance import record_render_sample
            from app.tts_server.performance_settings import resolve_engine_settings_model

            test_text = plugin.manifest.get("test_text") or "Hello, verification test text."
            chars = len(test_text)
            sample_dur = max(0.1, duration)
            tts_model = resolve_engine_settings_model(engine_id)

            record_render_sample(
                engine=engine_id,
                tts_model=tts_model,
                chars=chars,
                word_count=len(test_text.split()),
                segment_count=1,
                duration_seconds=round(sample_dur, 2),
                cps=round(chars / sample_dur, 2),
                seconds_per_segment=round(sample_dur, 2),
                job_id=None,
                project_id=None,
                chapter_id=None,
                speaker_profile=None,
                render_group_count=0,
                started_at=wall_start,
                completed_at=wall_start + sample_dur,
                make_mp3=False,
                synthesis_duration_seconds=sample_dur,
                sample_type="verification"
            )
        except Exception:
            logger.exception("Failed to record verification performance sample")

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
            error="run_test() raised an unhandled exception (see server logs).",
        )


def _accepts_settings(callable_obj: object) -> bool:
    """Return True when a plugin method supports a settings keyword."""
    try:
        signature = inspect.signature(callable_obj)
    except (TypeError, ValueError):
        return False

    return any(
        param.kind == inspect.Parameter.VAR_KEYWORD or name == "settings"
        for name, param in signature.parameters.items()
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
