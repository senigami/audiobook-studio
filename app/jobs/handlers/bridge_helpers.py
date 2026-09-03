from __future__ import annotations
import logging
import shutil
from pathlib import Path
from typing import Any, Callable

from ...engines.bridge import create_voice_bridge
from ...engines.errors import EngineBridgeError

logger = logging.getLogger(__name__)


def _best_effort_profile_dir(profile_name: str) -> Path | None:
    """Resolve a profile's voice directory so engines can find reference audio.

    Engines never guess storage paths, so the dir must travel in the request;
    deriving it here means callers only need to know the profile name.
    """
    try:
        from app.db.speakers import get_profile_dir
        return get_profile_dir(profile_name)
    except Exception:
        logger.debug("Could not resolve voice profile dir for %r", profile_name, exc_info=True)
        return None


def generate_via_bridge(
    *,
    engine: str,
    text: str,
    out_wav: Path,
    profile_name: str | None = None,
    on_output: Callable[[str], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    speed: float = 1.0,
    voice_profile_dir: Path | None = None,
    voice_asset_id: str | None = None,
    reference_sample: str | None = None,
    model: str | None = None,
    safe_mode: bool = True,
    script: list[dict[str, Any]] | None = None,
    task_id: str | None = None,
    **kwargs,
) -> int:
    """Standardized bridge call for non-orchestrated job handlers.

    Returns 0 on success, or raises EngineBridgeError.
    """
    bridge = create_voice_bridge()

    request: dict[str, Any] = {
        "engine_id": engine,
        "voice_profile_id": profile_name or "default",
        "script_text": text,
        "output_path": str(out_wav),
        "output_format": "wav",
        "on_output": on_output,
        "cancel_check": cancel_check,
        "speed": speed,
        "safe_mode": safe_mode,
        "script": script,
    }

    if voice_asset_id:
        request["voice_asset_id"] = voice_asset_id
    if reference_sample:
        request["reference_sample"] = reference_sample
    if model:
        request["model"] = model
    if voice_profile_dir is None and profile_name:
        voice_profile_dir = _best_effort_profile_dir(profile_name)
    if voice_profile_dir:
        request["voice_profile_dir"] = str(voice_profile_dir)
    if task_id:
        request["task_id"] = task_id

    if kwargs:
        request.update(kwargs)

    try:
        response = bridge.synthesize(request)

        synthesis_duration = response.get("duration_sec") or response.get("tts_server_result", {}).get("duration_sec")
        if synthesis_duration is not None and task_id:
            # Best-effort bookkeeping: synthesis already succeeded, so a failure
            # here must not surface as a synthesis failure.
            try:
                from app.db.state import update_job
                update_job(task_id, synthesis_duration_seconds=synthesis_duration)
            except Exception:
                logger.warning("Failed to persist synthesis duration for task %s", task_id, exc_info=True)

        # If the bridge returned a different path (e.g. from a cache or temp file), move it to target
        audio_path = response.get("audio_path")
        if audio_path and Path(str(audio_path)) != out_wav:
            generated = Path(str(audio_path))
            if generated.exists():
                out_wav.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(generated), str(out_wav))

        return 0
    except EngineBridgeError:
        # Re-raise to let handler deal with it or mark job failed
        raise
    except Exception as exc:
        logger.error("Unexpected error in generate_via_bridge: %s", exc, exc_info=True)
        raise EngineBridgeError(f"Bridge synthesis failed: {exc}") from exc
