from __future__ import annotations
import queue
import threading
from typing import Dict
from ..state import get_settings
from ..config import BASELINE_XTTS_CPS

# Queues and Flags
job_queue: "queue.Queue[str]" = queue.Queue()
assembly_queue: "queue.Queue[str]" = queue.Queue()
cancel_flags: Dict[str, threading.Event] = {}
pause_flag = threading.Event()

# Progress Calculation Constants
# Preparing owns the true "0%" phase now. Status is authoritative.
PROGRESS_PREPARE_LIMIT = 0.0
PROGRESS_PREPARE_STEP = 0.005
PROGRESS_MAX_PREDICTED = 0.85
PROGRESS_STITCH_LIMIT = 0.98

# Default fallbacks
# BASELINE_XTTS_CPS moved to config.py

def paused() -> bool:
    return pause_flag.is_set()

def toggle_pause():
    from ..state import update_settings
    if pause_flag.is_set():
        pause_flag.clear()
        update_settings({"is_paused": False})
    else:
        pause_flag.set()
        update_settings({"is_paused": True})

def set_paused(value: bool):
    from ..state import update_settings
    if value:
        pause_flag.set()
        update_settings({"is_paused": True})
    else:
        pause_flag.clear()
        update_settings({"is_paused": False})

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

    return avg_cps, avg_sps, 4.0

def _estimate_seconds(text_chars: int, cps: float, group_count: int = 1, robust_params: tuple[float, float, float] | None = None) -> int:
    """Conservative estimation of synthesis time including startup and segment overhead."""
    if robust_params:
        eff_cps, eff_sps, eff_start = robust_params
    else:
        eff_cps, eff_sps, eff_start = cps, 3.0, 4.0

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
    if not getattr(job, 'synthesis_started_at', None) and getattr(job, 'engine', None) != "audiobook":
        # If it's still preparing, don't animate past the current progress floor
        if getattr(job, 'status', None) == 'preparing':
             return current_p
        return max(current_p, min(prepare_limit, predicted))

    return max(current_p, min(limit, predicted))
