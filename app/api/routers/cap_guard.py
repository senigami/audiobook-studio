"""Save-time guard for parallel-render caps.

Every route that can raise an engine's effective cap calls in here BEFORE it
writes, so a refused save changes nothing. This module gathers the inputs
(registered engines, manifest claims, one memory sample) and leaves every
decision to ``app.orchestration.scheduler.cap_safety``.
"""

from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import asdict
from typing import Any, Callable, Mapping, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from ...db.state import get_settings
from ...engines.system_resources import sample_resources
from ...orchestration.scheduler.cap_limits import collect_limits
from ...orchestration.scheduler.cap_safety import CapViolation, find_cap_violations
from ...orchestration.scheduler.cap_settings import get_engine_caps, get_global_parallel_cap

logger = logging.getLogger(__name__)

PARALLEL_CAP_UNSAFE = "parallel_cap_unsafe"
PARALLEL_CAP_UNSAFE_MESSAGE = (
    "Your change was not saved. This computer can render at most {hard_maximum} at once right now. "
    "Lower the number, or close other apps and try again."
)

INVALID_CAP = "invalid_cap"
INVALID_CAP_MESSAGE = (
    "Your change was not saved because the value was not a whole number. "
    "Enter a whole number, such as 1 or 2."
)

_CAP_FIELDS = ("tts_parallel_cap", "tts_engine_caps")

# Held across check AND write on both routes, so two individually safe saves
# cannot interleave into an unsafe combined cap.
cap_write_lock = threading.RLock()


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


def _could_raise_a_cap(current: Mapping[str, Any], candidate: Mapping[str, Any]) -> bool:
    """Raw comparison used only when no engine is known (manifest ceilings are unknown then)."""
    cur_global = get_global_parallel_cap(current)
    new_global = get_global_parallel_cap(candidate)
    cur_over = get_engine_caps(current)
    new_over = get_engine_caps(candidate)
    if new_global > cur_global:
        return True
    return any(
        new_over.get(engine, new_global) > cur_over.get(engine, cur_global)
        for engine in set(cur_over) | set(new_over)
    )


def _refusal_detail(violations: list[CapViolation], sample: Mapping[str, Any]) -> dict:
    correlation_id = new_correlation_id()
    smallest_safe = min(v.safe_maximum for v in violations)
    smallest_hard = min(v.hard_maximum for v in violations)
    logger.warning(
        "Refused unsafe parallel cap [correlation_id=%s] violations=%s ram_available_gb=%s ram_total_gb=%s",
        correlation_id,
        [asdict(v) for v in violations],
        sample.get("ram_available_gb"),
        sample.get("ram_total_gb"),
    )
    return {
        "code": PARALLEL_CAP_UNSAFE,
        "message": (
            PARALLEL_CAP_UNSAFE_MESSAGE.replace("{safe_maximum}", str(smallest_safe)).replace(
                "{hard_maximum}", str(smallest_hard)
            )
        ),
        "correlation_id": correlation_id,
        "violations": [asdict(v) for v in violations],
    }


def _violations_for(build_updates: Callable[[dict], dict]) -> tuple[list[CapViolation], Mapping[str, Any]]:
    current = dict(get_settings() or {})
    candidate = {**current, **build_updates(current)}
    limits = collect_limits()
    if not limits:
        if not _could_raise_a_cap(current, candidate):
            return [], {}
        # No engine information at all would check nothing and let a raise through.
        raise HTTPException(
            status_code=503,
            detail="Cannot verify parallel cap safety: no engines are currently known.",
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
