"""ETA and duration estimation helpers for the Studio 2.0 TaskOrchestrator."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

from app.orchestration.progress.eta import estimate_eta_seconds

if TYPE_CHECKING:
    from app.orchestration.tasks.base import StudioTask, TaskContext


# ---------------------------------------------------------------------------
# Module-level pure functions (monkeypatching the mixin methods delegates here)
# ---------------------------------------------------------------------------

def estimate_task_duration(*, task: StudioTask, context: TaskContext) -> float | None:
    """Estimate render duration without publishing it during preparation."""
    try:
        text = context.payload.get("test_text") or context.payload.get("script_text", "")
        engine_id = context.payload.get("engine_id", "synthesis")
        duration = task.get_expected_duration(text, engine_id)
        return float(duration) if duration else None
    except Exception:
        return None


def duration_to_eta_seconds(duration: float | None) -> int | None:
    """Normalize an optional duration estimate for websocket payloads."""
    if duration is None or duration <= 0:
        return None
    return max(1, int(round(duration)))


def observed_remaining_seconds(
    *,
    started_at: float | None,
    progress: float,
    expected_duration: float | None = None,
) -> int | None:
    """Estimate remaining render time from raw engine progress."""
    if started_at is None or progress <= 0:
        return None
    if progress >= 0.995:
        return 1
    elapsed = max(0.0, time.time() - started_at)
    if elapsed <= 0:
        return None
    extrapolated = elapsed * (1.0 - progress) / progress

    if expected_duration is not None and progress < 0.15:
        alpha = progress / 0.15
        remaining = alpha * extrapolated + (1 - alpha) * expected_duration
    else:
        remaining = extrapolated

    return max(1, int(round(remaining)))


def estimate_active_segment_eta_seconds(
    *,
    expected_duration: float | None,
    total_weight: int | float,
    active_weight: int | float,
    active_progress: float,
    started_at: float | None = None,
    calibrated_cps: float | None = None,
) -> int | None:
    """Estimate ETA for the active render group, not the whole chapter."""
    active_total = max(int(active_weight), 0)
    if active_total <= 0:
        return duration_to_eta_seconds(expected_duration)

    progress = max(0.0, min(float(active_progress), 1.0))
    completed_units = max(0, min(int(round(active_total * progress)), active_total))

    baseline_cps = None
    if calibrated_cps is not None:
        baseline_cps = calibrated_cps
    elif expected_duration is not None and expected_duration > 0 and total_weight > 0:
        baseline_cps = float(total_weight) / float(expected_duration)
    else:
        from app.engines.behavior import DEFAULT_BASELINE_ENGINE_CPS
        baseline_cps = DEFAULT_BASELINE_ENGINE_CPS

    observed_cps = None
    if started_at is not None and progress > 0:
        elapsed = max(0.0, time.time() - started_at)
        if elapsed > 0:
            observed_cps = (active_total * progress) / elapsed

    return estimate_eta_seconds(
        completed_units=completed_units,
        total_units=active_total,
        observed_cps=observed_cps,
        baseline_cps=baseline_cps,
    )


# ---------------------------------------------------------------------------
# Mixin — delegates to module functions so monkeypatching the mixin works
# ---------------------------------------------------------------------------

class OrchestratorEtaMixin:
    """ETA and duration estimation mixin for TaskOrchestrator."""

    def _estimate_task_duration(self, *, task: StudioTask, context: TaskContext) -> float | None:
        return estimate_task_duration(task=task, context=context)

    @staticmethod
    def _duration_to_eta_seconds(duration: float | None) -> int | None:
        return duration_to_eta_seconds(duration)

    @staticmethod
    def _observed_remaining_seconds(
        *,
        started_at: float | None,
        progress: float,
        expected_duration: float | None = None,
    ) -> int | None:
        return observed_remaining_seconds(
            started_at=started_at,
            progress=progress,
            expected_duration=expected_duration,
        )

    @staticmethod
    def _estimate_active_segment_eta_seconds(
        *,
        expected_duration: float | None,
        total_weight: int | float,
        active_weight: int | float,
        active_progress: float,
        started_at: float | None = None,
        calibrated_cps: float | None = None,
    ) -> int | None:
        return estimate_active_segment_eta_seconds(
            expected_duration=expected_duration,
            total_weight=total_weight,
            active_weight=active_weight,
            active_progress=active_progress,
            started_at=started_at,
            calibrated_cps=calibrated_cps,
        )
