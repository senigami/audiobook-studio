"""Pure guard functions for update_job decision logic.

Each function takes current job fields (a dict) and the incoming updates (a dict)
and returns either an adjusted updates dict or a rejection verdict (bool/None).

No I/O, no locks, no side effects — suitable for direct unit testing.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple


# ---------------------------------------------------------------------------
# Status priority map (shared with update_job for consistency)
# ---------------------------------------------------------------------------

STATUS_PRIORITY: Dict[Optional[str], int] = {
    "done": 5,
    "failed": 5,
    "cancelled": 5,
    "finalizing": 4,
    "running": 3,
    "preparing": 2,
    "queued": 1,
    None: 0,
}

TERMINAL_STATUSES = frozenset({"done", "failed", "cancelled"})
ACTIVE_STATUSES = frozenset({"queued", "preparing"})


# ---------------------------------------------------------------------------
# 1. Stale-update detection
# ---------------------------------------------------------------------------

def should_drop_terminal_update(current_status: Optional[str], updates: Dict[str, Any], force_broadcast: bool) -> bool:
    """Return True when the update should be silently dropped.

    Updates to jobs already in a terminal state are dropped unless:
    - ``force_broadcast`` is True, or
    - the incoming status is a reset to an active state (queued/preparing).
    """
    if force_broadcast:
        return False
    if current_status not in TERMINAL_STATUSES:
        return False
    incoming_status = updates.get("status")
    if incoming_status in ACTIVE_STATUSES:
        return False
    return True


# ---------------------------------------------------------------------------
# 2. Status-regression protection
# ---------------------------------------------------------------------------

def apply_status_regression_guard(
    current_status: Optional[str],
    new_status: str,
    force_broadcast: bool,
) -> Tuple[bool, Optional[str]]:
    """Decide whether a status change should be applied.

    Returns (apply: bool, reason: Optional[str]).
    ``reason`` is a human-readable debug string when blocked.
    """
    if force_broadcast:
        return True, None

    new_p = STATUS_PRIORITY.get(new_status, 0)
    old_p = STATUS_PRIORITY.get(current_status, 0)

    if new_p >= old_p:
        return True, None

    # Allow terminal → queued/preparing (clean-slate reset, spec §3.5)
    if new_status in ACTIVE_STATUSES and current_status in TERMINAL_STATUSES:
        return True, None

    # Block any other regression
    return False, f"regression {current_status!r} -> {new_status!r}"


# ---------------------------------------------------------------------------
# 3. Segment / batch field normalization
# ---------------------------------------------------------------------------

def normalize_segment_fields(j: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    """Clear segment and batch progress fields when their respective IDs are None.

    Does NOT mutate the inputs; returns a new dict merging updates with the
    normalised overrides.
    """
    result = dict(updates)

    effective_active_seg_id = (
        updates["active_segment_id"] if "active_segment_id" in updates else j.get("active_segment_id")
    )
    if effective_active_seg_id is None:
        result["active_segment_progress"] = 0.0
        result["active_segment_eta_seconds"] = None
        result["active_segment_eta_basis"] = None
        result["active_segment_updated_at"] = None

    effective_active_batch_id = (
        updates["active_render_batch_id"] if "active_render_batch_id" in updates else j.get("active_render_batch_id")
    )
    if effective_active_batch_id is None:
        result["active_render_batch_progress"] = None

    return result


# ---------------------------------------------------------------------------
# 4. Terminal-status ETA cleanup
# ---------------------------------------------------------------------------

def apply_terminal_eta_cleanup(updates: Dict[str, Any], j: Dict[str, Any]) -> Dict[str, Any]:
    """Clear ETA fields when the effective post-update status is terminal.

    Returns a new dict with the ETA fields set to None when applicable.
    """
    result = dict(updates)
    target_status = result.get("status") or j.get("status")
    if target_status in TERMINAL_STATUSES:
        result["eta_seconds"] = None
        result["eta_basis"] = None
        result["estimated_end_at"] = None
        result["eta_updated_at"] = None
    return result


# ---------------------------------------------------------------------------
# 5. Terminal-reset detection
# ---------------------------------------------------------------------------

def is_terminal_reset(current_status: Optional[str], updates: Dict[str, Any]) -> bool:
    """Return True when the update transitions a terminal job back to active."""
    return current_status in TERMINAL_STATUSES and updates.get("status") in ACTIVE_STATUSES
