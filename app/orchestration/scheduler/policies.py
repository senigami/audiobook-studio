"""Scheduler policy helpers.

This module owns queue ordering, fairness, and resource-priority policy
separately from task execution code.

Priority modes
--------------
STUDIO_FIRST
    Studio synthesis and UI-driven tasks run before API synthesis tasks.
    This is the default.  API tasks are deprioritized but not starved.

EQUAL
    All tasks are scheduled FIFO regardless of source.

API_FIRST
    API synthesis tasks run before Studio UI tasks.  Useful when the Studio
    is being used primarily as a synthesis engine by external automation.

The active mode is read from the ``TTS_API_PRIORITY`` environment variable.
Valid values: ``studio_first`` (default), ``equal``, ``api_first``.
"""

from __future__ import annotations

import os

from app.orchestration.tasks.base import TaskContext

# Priority mode constants.
STUDIO_FIRST = "studio_first"
EQUAL = "equal"
API_FIRST = "api_first"

_VALID_MODES = {STUDIO_FIRST, EQUAL, API_FIRST}

# Sources that identify API-originated tasks.
_API_SOURCES = {"api", "external"}


def get_priority_mode() -> str:
    """Return the current task priority mode.

    Read from the ``TTS_API_PRIORITY`` environment variable.  Defaults to
    ``studio_first`` when the variable is unset or invalid.

    Returns:
        str: One of ``"studio_first"``, ``"equal"``, or ``"api_first"``.
    """
    raw = os.environ.get("TTS_API_PRIORITY", "").strip().lower()
    if raw in _VALID_MODES:
        return raw
    return STUDIO_FIRST


def _task_sort_key(context: TaskContext, mode: str) -> tuple[int, float]:
    """Return a sort key for a task context under the given priority mode.

    Lower values run first (higher priority).

    Args:
        context: Task context to sort.
        mode: Active priority mode constant.

    Returns:
        tuple[int, float]: (priority_bucket, submission_order).
    """
    is_api = getattr(context, "source", None) in _API_SOURCES
    submitted_at = getattr(context, "submitted_at", 0.0) or 0.0

    if mode == EQUAL:
        priority_bucket = 0
    elif mode == API_FIRST:
        # API tasks get bucket 0 (highest), Studio tasks get bucket 1.
        priority_bucket = 0 if is_api else 1
    else:
        # STUDIO_FIRST — default.
        priority_bucket = 1 if is_api else 0

    return (priority_bucket, submitted_at)


def choose_next_task(*, queued_tasks: list[TaskContext]) -> TaskContext | None:
    """Select the next task to run according to the active priority mode.

    Tasks that come earlier in priority bucket order (and started earlier
    within a bucket) are selected first.

    Args:
        queued_tasks: Waiting task contexts eligible to run.

    Returns:
        TaskContext | None: The highest-priority eligible task, or None when
        the queue is empty.
    """
    if not queued_tasks:
        return None

    mode = get_priority_mode()
    eligible = [t for t in queued_tasks if t is not None]

    if not eligible:
        return None

    return min(eligible, key=lambda t: _task_sort_key(t, mode))
