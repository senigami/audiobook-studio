"""Save-time guard for parallel-render caps.

Every route that can raise an engine's effective cap calls in here BEFORE it
writes, so a refused save changes nothing. This module gathers the inputs
(registered engines, manifest claims, one memory sample) and leaves every
decision to ``app.orchestration.scheduler.cap_safety``.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import asdict
from typing import Any, Callable, Mapping, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from ...db.state import get_settings
from ...engines.system_resources import sample_resources
from ...orchestration.scheduler.cap_safety import CapViolation, EngineLimits, find_cap_violations

logger = logging.getLogger(__name__)

PARALLEL_CAP_UNSAFE = "parallel_cap_unsafe"
PARALLEL_CAP_UNSAFE_MESSAGE = (
    "Your change was not saved. Studio estimates this computer can render up to "
    "{safe_maximum} at once right now. Lower the number, or close other apps and try again."
)

INVALID_CAP = "invalid_cap"
INVALID_CAP_MESSAGE = (
    "Your change was not saved because the value was not a whole number. "
    "Enter a whole number, such as 1 or 2."
)

_CAP_FIELDS = ("tts_parallel_cap", "tts_engine_caps")


def new_correlation_id() -> str:
    return uuid.uuid4().hex[:12]


def invalid_cap_error(field: str, raw_value: Any) -> HTTPException:
    """A coded 422 for a non-numeric cap. The raw value goes to the log only."""
    correlation_id = new_correlation_id()
    logger.warning(
        "Refused non-numeric cap [correlation_id=%s] field=%s value=%.80r", correlation_id, field, raw_value
    )
    return HTTPException(
        status_code=422,
        detail={"code": INVALID_CAP, "message": INVALID_CAP_MESSAGE, "correlation_id": correlation_id},
    )


def limits_for(engine_id: str, claim: Any, active_count: int) -> EngineLimits:
    """Footprint is the manifest's vram_mb, charged to RAM when VRAM is unmeasurable (see cap_safety)."""
    return EngineLimits(
        engine_id=engine_id,
        manifest_max=int(claim.manifest_max),
        footprint_mb=int(claim.vram_mb or 0),
        gpu=bool(claim.gpu),
        active_count=int(active_count),
    )


def collect_limits() -> list[EngineLimits]:
    """Limits for EVERY registered engine, enabled or not."""
    from ...engines.registry import load_engine_registry  # noqa: PLC0415
    from ...orchestration.scheduler.resources import get_engine_id_semaphore  # noqa: PLC0415
    from ...orchestration.tasks.synthesis import _manifest_resource_claim  # noqa: PLC0415

    limits: list[EngineLimits] = []
    for engine_id in sorted(load_engine_registry().keys()):
        claim = _manifest_resource_claim(engine_id)
        active = get_engine_id_semaphore(engine_id, claim.manifest_max).active_count
        limits.append(limits_for(engine_id, claim, active))
    return limits


def _refusal_detail(violations: list[CapViolation], sample: Mapping[str, Any]) -> dict:
    correlation_id = new_correlation_id()
    smallest = min(v.safe_maximum for v in violations)
    logger.warning(
        "Refused unsafe parallel cap [correlation_id=%s] violations=%s ram_available_gb=%s ram_total_gb=%s",
        correlation_id,
        [asdict(v) for v in violations],
        sample.get("ram_available_gb"),
        sample.get("ram_total_gb"),
    )
    return {
        "code": PARALLEL_CAP_UNSAFE,
        "message": PARALLEL_CAP_UNSAFE_MESSAGE.replace("{safe_maximum}", str(smallest)),
        "correlation_id": correlation_id,
        "violations": [asdict(v) for v in violations],
    }


def _violations_for(build_updates: Callable[[dict], dict]) -> tuple[list[CapViolation], Mapping[str, Any]]:
    current = dict(get_settings() or {})
    candidate = {**current, **build_updates(current)}
    try:
        limits = collect_limits()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Cannot verify parallel cap safety: engine registry is unavailable.",
        ) from exc
    if not limits:
        # An empty registry would check nothing and let any value through.
        raise HTTPException(
            status_code=503,
            detail="Cannot verify parallel cap safety: no engines are currently loaded.",
        )
    sample = sample_resources()
    violations = find_cap_violations(
        current_settings=current, candidate_settings=candidate, limits=limits, sample=sample
    )
    return violations, sample


def refuse_if_unsafe_settings(updates: Mapping[str, Any]) -> None:
    """For ``POST /api/settings``: raise a 422 when the cap fields in *updates* are unsafe.

    ``updates["tts_engine_caps"]`` replaces the stored map wholesale, exactly as
    ``update_settings`` will apply it, so the candidate matches what is stored.
    """
    if not any(field in updates for field in _CAP_FIELDS):
        return
    violations, sample = _violations_for(
        lambda _current: {field: updates[field] for field in _CAP_FIELDS if field in updates}
    )
    if violations:
        raise HTTPException(status_code=422, detail=_refusal_detail(violations, sample))


def unsafe_engine_cap_response(engine_id: str, cap: Optional[int]) -> Optional[JSONResponse]:
    """For ``PUT /api/engines/{id}/concurrency``: a 422 response, or None when the change is safe.

    Mirrors ``set_engine_cap``: one key merged into (or, for None, removed from)
    the STORED map. Clearing an override can re-expose the global value, so a
    ``None`` cap is checked too.
    """

    def build(current: dict) -> dict:
        stored = current.get("tts_engine_caps")
        caps = dict(stored) if isinstance(stored, dict) else {}
        if cap is None:
            caps.pop(str(engine_id), None)
        else:
            caps[str(engine_id)] = max(1, int(cap))
        return {"tts_engine_caps": caps}

    violations, sample = _violations_for(build)
    if not violations:
        return None
    return JSONResponse({"detail": _refusal_detail(violations, sample)}, status_code=422)
