"""Live effective cap for an engine, including the automatic default.

An unset global cap resolves to ``min(2, safe max)`` per engine at read time and
is never written to settings. The result is cached per engine because sampling can
shell out to nvidia-smi and admission and ETA call this on every tick.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable, Mapping, Optional

from app.orchestration.scheduler import cap_limits
from app.orchestration.scheduler.cap_safety import EngineLimits, engine_safe_max, global_safe_max
from app.orchestration.scheduler.cap_settings import (
    DEFAULT_GLOBAL_CAP,
    get_engine_caps,
    is_global_cap_explicit,
    resolve_effective_cap,
)

logger = logging.getLogger(__name__)

SAMPLE_TTL_SECONDS = 30.0

# engine_id -> (taken_at, auto). The result is cached, not the raw sample: a sample is
# only valid with the running-worker count seen when it was taken.
_cache: dict[str, tuple[float, int]] = {}
_cache_lock = threading.Lock()


def _cached_auto(engine_id: str, clock: Callable[[], float], compute: Callable[[], int]) -> int:
    with _cache_lock:
        started = clock()
        hit = _cache.get(engine_id)
        if hit is not None and started - hit[0] < SAMPLE_TTL_SECONDS:
            return hit[1]
    # Computed outside the lock: the sampler can shell out to nvidia-smi. Two threads
    # racing here both compute, which is harmless.
    auto = compute()
    with _cache_lock:
        _cache[engine_id] = (started, auto)
    return auto


def _default_sampler() -> Mapping[str, Any]:
    from app.engines.system_resources import sample_resources  # noqa: PLC0415

    return sample_resources()


def resolve_live_effective_cap(
    engine_id: str,
    manifest_max: int,
    *,
    clock: Callable[[], float] = time.monotonic,
    sampler: Optional[Callable[[], Mapping[str, Any]]] = None,
) -> int:
    """Effective cap for admission and ETA; samples memory only when the cap is automatic."""
    if engine_id in get_engine_caps() or is_global_cap_explicit():
        return resolve_effective_cap(engine_id=engine_id, manifest_max=manifest_max)

    def compute() -> int:
        try:
            # Lazy: resources and synthesis pull in the whole scheduler and task stack.
            from app.orchestration.scheduler.resources import (  # noqa: PLC0415
                CHAPTER_ADMISSION_ENGINE_CLASS,
                MAX_GLOBAL_CONCURRENT_SYNTHESIS,
                get_engine_id_semaphore,
            )
            from app.orchestration.tasks.synthesis import _manifest_resource_claim  # noqa: PLC0415

            if engine_id == CHAPTER_ADMISSION_ENGINE_CLASS:
                # No manifest of its own: chapters follow the one global value GET reports.
                sample = (sampler or _default_sampler)()
                return min(
                    DEFAULT_GLOBAL_CAP, global_safe_max(cap_limits.collect_limits(), sample, MAX_GLOBAL_CONCURRENT_SYNTHESIS)
                )

            claim = _manifest_resource_claim(engine_id)
            # Sample first, then count: a worker that releases mid-sample must not be added back.
            sample = (sampler or _default_sampler)()
            limits = EngineLimits(
                engine_id=engine_id,
                manifest_max=int(claim.manifest_max),
                footprint_mb=int(claim.vram_mb or 0),
                gpu=bool(claim.gpu),
                active_count=int(get_engine_id_semaphore(engine_id, claim.manifest_max).active_count),
            )
            safe, _ = engine_safe_max(limits, sample)
            return min(DEFAULT_GLOBAL_CAP, safe)
        except Exception:
            logger.warning("Could not measure memory for the automatic cap; using 1", exc_info=True)
            return 1

    auto = _cached_auto(engine_id, clock, compute)
    return resolve_effective_cap(engine_id=engine_id, manifest_max=manifest_max, auto_cap=auto)
