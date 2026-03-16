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

def _estimate_seconds(text_chars: int, cps: float) -> int:
    return max(5, int(text_chars / max(1.0, cps)))

def format_seconds(seconds: int) -> str:
    """Formats seconds into readable string (e.g. 1h 2m 3s or 45s)."""
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m {secs}s"

def calculate_predicted_progress(job, now: float, start_time: float, eta: int, limit: float = 0.85, prepare_limit: float = 0.05, prepare_step: float = 0.005) -> float:
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
        return max(current_p, min(prepare_limit, predicted))

    return max(current_p, min(limit, predicted))
