"""Pure safe-cap math: how many parallel renders can this machine run.

No I/O and no import-time work. Callers pass in the memory sample and the
per-engine limits; this module never reads settings, the registry or psutil.
Used at save time only. Runtime admission (resolve_effective_cap) is unchanged.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

from app.orchestration.scheduler.cap_settings import (
    get_engine_caps,
    get_global_parallel_cap,
    resolve_effective_cap,
)

# Keep this share of TOTAL RAM (and VRAM) free for the OS and other apps.
HEADROOM_FRACTION = 0.20
_MB_PER_GB = 1024

BASIS_MEMORY = "memory"
BASIS_UNMEASURABLE = "unmeasurable"


@dataclass(frozen=True)
class EngineLimits:
    """What one engine costs and how far its manifest lets it go."""

    engine_id: str
    manifest_max: int
    footprint_mb: int
    gpu: bool = False
    active_count: int = 0


@dataclass(frozen=True)
class CapViolation:
    setting: str  # "tts_parallel_cap" or "tts_engine_caps"
    engine: Optional[str]
    requested: int
    safe_maximum: int
    basis: str  # BASIS_MEMORY or BASIS_UNMEASURABLE


def _usable_ram(sample: Mapping[str, Any]) -> Optional[tuple]:
    avail = sample.get("ram_available_gb")
    total = sample.get("ram_total_gb")
    try:
        avail_f = float(avail)
        total_f = float(total)
    except (TypeError, ValueError):
        return None
    if total_f <= 0 or avail_f < 0 or avail_f > total_f:
        return None
    return avail_f * _MB_PER_GB, total_f * _MB_PER_GB


def is_memory_measurable(sample: Mapping[str, Any]) -> bool:
    """False when the RAM figures are missing or nonsense (the UI says so honestly)."""
    return _usable_ram(sample) is not None


def memory_budget_mb(sample: Mapping[str, Any], limits: EngineLimits) -> tuple:
    """Return (budget_mb, basis). An unusable sample is budget 0, never a guess.

    Renders already running hold memory that ``available`` no longer counts,
    so their footprint is added back; otherwise raising 1 to 2 mid-render
    would look unsafe when it fits.
    """
    ram = _usable_ram(sample)
    if ram is None:
        return 0.0, BASIS_UNMEASURABLE
    avail_mb, total_mb = ram
    resident_mb = max(0, limits.active_count) * max(0, limits.footprint_mb)
    budget = avail_mb - HEADROOM_FRACTION * total_mb + resident_mb

    vram_total = sample.get("vram_total_gb")
    vram_used = sample.get("vram_used_gb")
    if limits.gpu and vram_total is not None and vram_used is not None and float(vram_total) > 0:
        vt_mb = float(vram_total) * _MB_PER_GB
        free_mb = vt_mb - float(vram_used) * _MB_PER_GB
        budget = min(budget, free_mb - HEADROOM_FRACTION * vt_mb + resident_mb)
    return max(0.0, budget), BASIS_MEMORY


def safe_cap_ceiling(*, footprint_mb: int, manifest_max: int, budget_mb: float) -> int:
    """max(1, min(manifest_max, floor(budget / footprint))). Footprint 0 means no memory term."""
    ceiling = max(1, int(manifest_max))
    if footprint_mb <= 0:
        return ceiling
    return max(1, min(ceiling, math.floor(budget_mb / footprint_mb)))


def engine_safe_max(limits: EngineLimits, sample: Mapping[str, Any]) -> tuple:
    """Return (safe_max, basis) for one engine."""
    budget, basis = memory_budget_mb(sample, limits)
    safe = safe_cap_ceiling(
        footprint_mb=limits.footprint_mb, manifest_max=limits.manifest_max, budget_mb=budget
    )
    return safe, basis


def global_safe_max(limits: Sequence[EngineLimits], sample: Mapping[str, Any], hard_cap: int) -> int:
    """Largest global cap no engine would exceed its own safe maximum under.

    An engine only constrains the global value when memory (not its manifest
    ceiling) is what limits it. Conservative: ignores that an engine with its
    own override does not inherit the global value.
    """
    best = max(1, int(hard_cap))
    for lim in limits:
        safe, _ = engine_safe_max(lim, sample)
        if safe < min(lim.manifest_max, hard_cap):
            best = min(best, safe)
    return max(1, best)


def find_cap_violations(
    *,
    current_settings: Mapping[str, Any],
    candidate_settings: Mapping[str, Any],
    limits: Sequence[EngineLimits],
    sample: Mapping[str, Any],
) -> list:
    """Refuse only where an engine's EFFECTIVE cap goes up and ends above its safe maximum.

    Effective caps are compared (not raw settings) so a string "8", an
    override removal that re-exposes the global value, and a global value no
    engine inherits are all handled by the same rule. Lowering, re-saving the
    current value and unrelated saves can never violate. Every engine passed
    in is checked; the caller passes every REGISTERED engine, enabled or not.
    """
    candidate_overrides = get_engine_caps(candidate_settings)
    violations: list = []
    for lim in sorted(limits, key=lambda item: item.engine_id):
        before = resolve_effective_cap(
            engine_id=lim.engine_id, manifest_max=lim.manifest_max, settings=current_settings
        )
        after = resolve_effective_cap(
            engine_id=lim.engine_id, manifest_max=lim.manifest_max, settings=candidate_settings
        )
        safe, basis = engine_safe_max(lim, sample)
        if after <= before or after <= safe:
            continue
        if lim.engine_id in candidate_overrides:
            setting, requested = "tts_engine_caps", candidate_overrides[lim.engine_id]
        else:
            setting, requested = "tts_parallel_cap", get_global_parallel_cap(candidate_settings)
        violations.append(
            CapViolation(
                setting=setting,
                engine=lim.engine_id,
                requested=requested,
                safe_maximum=safe,
                basis=basis,
            )
        )
    return violations
