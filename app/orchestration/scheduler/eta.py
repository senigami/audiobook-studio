"""ETA and progress prediction utilities for Studio 2.0.

These utilities provide robust estimation of synthesis time and progress
based on historical performance and current work scope. They replace the
ad-hoc calculations previously found in the legacy worker loop.
"""

from __future__ import annotations
import logging

logger = logging.getLogger(__name__)

# Progress Calculation Constants
# Preparing owns the true "0%" phase now. Status is authoritative.
PROGRESS_PREPARE_LIMIT = 0.0
PROGRESS_PREPARE_STEP = 0.005
PROGRESS_MAX_PREDICTED = 0.85
PROGRESS_STITCH_LIMIT = 0.98

def _trimmed_mean(values: list[float], fallback: float) -> float:
    if not values:
        return fallback

    ordered = sorted(values)
    trim = int(len(ordered) * 0.15) if len(ordered) >= 5 else 0
    effective = ordered[trim:len(ordered) - trim] if trim else ordered
    return sum(effective) / len(effective)


def get_robust_eta_params(history: list[dict], fallback_cps: float) -> tuple[float, float, float] | None:
    """Derive robust CPS, per-segment overhead, and base startup overhead from history."""
    if not history:
        return None

    cps_values = sorted([s["cps"] for s in history if s.get("cps", 0) > 0])
    if not cps_values:
        return None

    avg_cps = _trimmed_mean(cps_values, fallback_cps)

    sps_values = sorted([
        s.get("seconds_per_segment", 0)
        for s in history
        if s.get("seconds_per_segment", 0) > 0
    ])
    avg_sps = _trimmed_mean(sps_values, 3.0)

    return avg_cps, avg_sps, 0.1

def _estimate_seconds(text_chars: int, cps: float, group_count: int = 1, robust_params: tuple[float, float, float] | None = None) -> int:
    """Conservative estimation of synthesis time including startup and segment overhead."""
    if robust_params:
        eff_cps, eff_sps, eff_start = robust_params
    else:
        eff_cps, eff_sps, eff_start = cps, 3.0, 0.1

    base_run_time = text_chars / max(1.0, eff_cps)

    if robust_params:
        # Historical seconds-per-segment already includes the character cost for
        # those samples. Use the stronger model instead of double-counting both.
        return int(max(base_run_time, max(1, group_count) * eff_sps) + eff_start)

    return int(base_run_time + (max(1, group_count) * eff_sps) + eff_start)

def format_seconds(seconds: int) -> str:
    """Formats seconds into readable string (e.g. 1h 2m 3s or 45s)."""
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m {secs}s"

def calculate_predicted_progress(job, now: float, start_time: float, eta: int, limit: float = PROGRESS_MAX_PREDICTED, prepare_limit: float = PROGRESS_PREPARE_LIMIT, prepare_step: float = PROGRESS_PREPARE_STEP) -> float:
    """Safely calculates the predicted progress floor for a job."""
    current_p = getattr(job, 'progress', 0.0)

    if getattr(job, 'status', None) == 'finalizing':
        return current_p

    # Use the provided start_time (which is already adjusted for resumption/progress in the worker)
    actual_elapsed = now - start_time
    predicted = actual_elapsed / max(1, eta)

    # If synthesis hasn't started yet, cap progress (Preparing phase)
    # UNLESS we are already resuming from a point past the cap.
    if not getattr(job, 'started_at', None) and getattr(job, 'engine', None) != "audiobook":
        # If it's still preparing, don't animate past the current progress floor (0.0)
        if getattr(job, 'status', None) == 'preparing':
             return current_p
        return max(current_p, min(prepare_limit, predicted))

    return max(current_p, min(limit, predicted))


def calculate_segment_eta(chars: int, cps: float) -> int:
    """Segment ETA is based strictly on remaining characters and pure model CPS, excluding overhead."""
    if cps <= 0:
        return 0
    return max(1, int(round(chars / cps)))


def calculate_chapter_startup_eta(chars: int, cps: float, group_count: int, inter_group_overhead: float) -> int:
    """Startup Chapter ETA adds transition overhead for (Group_Count - 1) boundaries."""
    if cps <= 0:
        return 0
    synthesis_time = chars / cps
    overhead_groups = max(0, group_count - 1)
    total_time = synthesis_time + (overhead_groups * inter_group_overhead)
    return max(1, int(round(total_time)))


def calculate_chapter_remaining_eta(
    active_group_remaining_chars: int,
    remaining_chars: int,
    cps: float,
    groups_remaining: int,
    inter_group_overhead: float
) -> int:
    """Live Chapter Remaining ETA avoids active group double-counting and adds remaining overhead."""
    if cps <= 0:
        return 0
    total_chars = active_group_remaining_chars + remaining_chars
    synthesis_time = total_chars / cps
    total_time = synthesis_time + (groups_remaining * inter_group_overhead)
    return max(1, int(round(total_time)))


def get_calibrated_model_params(history: list[dict]) -> tuple[float, float] | None:
    """Computes robust model CPS and inter-group overhead from render performance history."""
    if not history:
        return None
    cps_values = [s["cps"] for s in history if s.get("cps", 0) > 0]
    if not cps_values:
        return None
    overhead_values = [s.get("inter_group_overhead_seconds", 0.0) for s in history]
    calibrated_cps = _trimmed_mean(cps_values, 1.0)
    calibrated_overhead = _trimmed_mean(overhead_values, 0.0)
    return calibrated_cps, calibrated_overhead


def get_calibration_confidence(history: list[dict]) -> int | None:
    """Compute calibration confidence from render performance history."""
    if not history:
        return None
    cps_values = [s["cps"] for s in history if s.get("cps", 0) > 0]
    n = len(cps_values)
    if n < 5:
        return None

    ordered = sorted(cps_values)
    trim = int(n * 0.15)
    effective = ordered[trim : n - trim] if trim else ordered

    if not effective:
        return None

    mean = sum(effective) / len(effective)
    if mean <= 0:
        return 0

    variance = sum((x - mean) ** 2 for x in effective) / len(effective)
    stddev = variance ** 0.5
    cv = stddev / mean

    w_count = min(1.0, n / 15.0)
    c_cal = w_count * max(0.0, 1.0 - 2.0 * cv)
    return int(round(c_cal * 100))
