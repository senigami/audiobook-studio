"""Per-engine cap inputs gathered from manifests on disk and the engine registry.

Shared by the save-time guard (API) and the automatic cap default (scheduler), so
it lives below both. Decisions stay in ``cap_safety``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.orchestration.scheduler.cap_safety import EngineLimits

logger = logging.getLogger(__name__)


def limits_for(engine_id: str, claim: Any, active_count: int) -> EngineLimits:
    """Footprint is the manifest's vram_mb. RAM is always charged; VRAM too when it is measurable (see cap_safety)."""
    return EngineLimits(
        engine_id=engine_id,
        manifest_max=int(claim.manifest_max),
        footprint_mb=int(claim.vram_mb or 0),
        gpu=bool(claim.gpu),
        active_count=int(active_count),
    )


def local_engine_ids() -> list[str]:
    """Engine ids with a plugin manifest on disk, whether or not the TTS Server loaded them.

    Read from the same plugins directory the scheduler's manifest claim uses, so a
    plugin that failed to load (or a server that is down) is still checked.
    """
    from app.core.config import PLUGINS_DIR  # noqa: PLC0415
    from app.tts_server.plugin_loader import _PLUGIN_FOLDER_RE  # noqa: PLC0415 (same folder rule as the loader)

    try:
        entries = sorted(Path(PLUGINS_DIR).iterdir())
    except OSError:
        return []
    return [
        entry.name[len("tts_"):]
        for entry in entries
        if entry.is_dir() and _PLUGIN_FOLDER_RE.match(entry.name) and (entry / "manifest.json").is_file()
    ]


def collect_limits() -> list[EngineLimits]:
    """Limits for EVERY known engine (on disk or reported by the server), enabled or not."""
    # Lazy: resources and synthesis import cap_default, which imports this module.
    from app.engines.registry import load_engine_registry  # noqa: PLC0415
    from app.orchestration.scheduler.resources import get_engine_id_semaphore  # noqa: PLC0415
    from app.orchestration.tasks.synthesis import _manifest_resource_claim  # noqa: PLC0415

    engine_ids = set(local_engine_ids())
    try:
        engine_ids.update(load_engine_registry().keys())
    except Exception:
        logger.warning("Engine registry unavailable while checking a cap; using manifests on disk", exc_info=True)

    limits: list[EngineLimits] = []
    for engine_id in sorted(engine_ids):
        claim = _manifest_resource_claim(engine_id)
        active = get_engine_id_semaphore(engine_id, claim.manifest_max).active_count
        limits.append(limits_for(engine_id, claim, active))
    return limits
