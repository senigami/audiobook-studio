from __future__ import annotations
import logging
import shutil
from pathlib import Path
from typing import Any, Callable

from ...engines.bridge import create_voice_bridge
from ...engines.errors import EngineBridgeError

logger = logging.getLogger(__name__)

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
    voxtral_model: str | None = None,
    safe_mode: bool = True,
    script: list[dict[str, Any]] | None = None,
) -> int:
    """Standardized bridge call for legacy-style job handlers.
    
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
    if voxtral_model:
        request["voxtral_model"] = voxtral_model
    if voice_profile_dir:
        request["voice_profile_dir"] = str(voice_profile_dir)

    try:
        response = bridge.synthesize(request)

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
