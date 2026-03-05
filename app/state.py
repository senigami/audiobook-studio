import json
import os
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Dict, Any
from json import JSONDecodeError

from .models import Job
from .config import BASE_DIR

STATE_FILE = Path(os.getenv("STATE_FILE", str(BASE_DIR / "state.json")))

# IMPORTANT: RLock prevents deadlock when a function that holds the lock calls another that also locks.
_STATE_LOCK = threading.RLock()
_JOB_LISTENERS = []

def add_job_listener(callback):
    """Register a callback to be notified of job updates."""
    _JOB_LISTENERS.append(callback)


def _default_state() -> Dict[str, Any]:
    return {
        "jobs": {},
        "settings": {
            "safe_mode": True,
            "make_mp3": False,
            "default_engine": "xtts"
        },
        "performance_metrics": {
            "audiobook_speed_multiplier": 1.0,
            "xtts_cps": 16.7
        }
    }


def _atomic_write_text(path: Path, text: str) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(text, encoding="utf-8")
    os.replace(tmp_path, path)


def _load_state_no_lock() -> Dict[str, Any]:
    """
    Internal helper: assumes caller already holds _STATE_LOCK.
    """
    if not STATE_FILE.exists():
        state = _default_state()
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
        return state

    raw = STATE_FILE.read_text(encoding="utf-8", errors="replace").strip()
    if not raw:
        state = _default_state()
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
        return state

    try:
        return json.loads(raw)
    except JSONDecodeError:
        # Backup corrupt file and reset
        backup = STATE_FILE.with_name("state.json.corrupt")
        try:
            os.replace(STATE_FILE, backup)
        except Exception:
            pass
        state = _default_state()
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
        return state


def load_state() -> Dict[str, Any]:
    with _STATE_LOCK:
        return _load_state_no_lock()


def save_state(state: Dict[str, Any]) -> None:
    with _STATE_LOCK:
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def get_settings() -> Dict[str, Any]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        return state.get("settings", {})


def update_settings(**updates) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state.setdefault("settings", {})
        state["settings"].update(updates)
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def get_performance_metrics() -> Dict[str, Any]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        # Fallback to defaults if missing in older state files
        metrics = state.get("performance_metrics", {})
        defaults = _default_state()["performance_metrics"]
        for k, v in defaults.items():
            metrics.setdefault(k, v)
        return metrics


def update_performance_metrics(**updates) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        metrics = state.setdefault("performance_metrics", {})
        metrics.update(updates)
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def get_jobs() -> Dict[str, Job]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        raw = state.get("jobs", {})
        # Safety: only pass keys that exist in the current Job dataclass
        import dataclasses
        job_fields = {f.name for f in dataclasses.fields(Job)}

        jobs = {}
        for jid, jdata in raw.items():
            filtered = {k: v for k, v in jdata.items() if k in job_fields}
            jobs[jid] = Job(**filtered)
        return jobs


def put_job(job: Job) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state.setdefault("jobs", {})
        state["jobs"][job.id] = asdict(job)
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def update_job(job_id: str, force_broadcast: bool = False, **updates) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.setdefault("jobs", {})
        j = jobs.get(job_id)
        if not j:
            return

        # Apply updates with protection
        changed_fields = []
        for k, v in updates.items():
            # 1. Status regression protection
            if k == "status":
                current_status = j.get("status")
                # Higher number = more advanced state
                status_priority = {
                    "done": 5, "failed": 5, "cancelled": 5, 
                    "finalizing": 4, "running": 3, "preparing": 2, "queued": 1, None: 0
                }
                new_p = status_priority.get(v, 0)
                old_p = status_priority.get(current_status, 0)
                if new_p < old_p:
                    # Allow regression only if explicitly resetting (e.g. back to queued)
                    # But if we're in the middle of a run, don't let a stray 'queued' msg win.
                    if not (v == "queued" and current_status in ("preparing", "running", "finalizing")):
                         print(f"DEBUG: Allowing status regression for {job_id}: {current_status} -> {v}")
                    else:
                        print(f"DEBUG: Preventing status regression for {job_id}: {current_status} -> {v}")
                        continue

            # 2. Progress regression protection
            if k == "progress":
                current_status = j.get("status")
                if current_status not in ("queued", "preparing"):
                    if v < (j.get("progress") or 0.0):
                        print(f"DEBUG: Skipping progress regression for {job_id}: {j.get('progress')} -> {v}")
                        continue

            if j.get(k) != v:
                j[k] = v
                changed_fields.append(k)
        if not changed_fields and not force_broadcast:
            return

        if changed_fields:
            jobs[job_id] = j
            _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))

        # Sync with SQLite DB if this job corresponds to a processing_queue item
        if "status" in changed_fields:
            try:
                from .db import update_queue_item
                from .config import XTTS_OUT_DIR
                import subprocess

                audio_length = 0.0
                output_file = None
                if updates["status"] == "done":
                    # Try to extract the true duration using ffprobe for the synchronized database record
                    # We need the filename, which is usually constructed in DB as sqlite_{job_id}_{part}.mp3
                    # But jobs.py usually tells us output_mp3 if it set it in updates, else we check the job itself
                    output_file = updates.get("output_mp3", j.get("output_mp3"))
                    if not output_file:
                        output_file = updates.get("output_wav", j.get("output_wav"))

                    if output_file:
                        project_id = updates.get("project_id", j.get("project_id"))
                        if project_id:
                            from .config import get_project_audio_dir
                            pdir = get_project_audio_dir(project_id)
                        else:
                            pdir = XTTS_OUT_DIR

                        mp3_path = pdir / output_file
                        if mp3_path.exists():
                            try:
                                result = subprocess.run(
                                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(mp3_path)],
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT,
                                    text=True,
                                    timeout=2
                                )
                                audio_length = float(result.stdout.strip())
                            except Exception as e:
                                print(f"Warning: Could not get duration for {output_file}: {e}")

                result_code = update_queue_item(job_id, updates["status"], audio_length_seconds=audio_length, force_chapter_id=j.get("chapter_id"), output_file=output_file)

                # print(f"DEBUG: SQLite sync for {job_id}: status={updates['status']}, len={audio_length}, result={result_code}")

                try:
                    from .web import broadcast_queue_update
                    broadcast_queue_update()
                except ImportError:
                    pass

            except Exception as e:
                print(f"Warning: Failed to sync job status to SQLite for {job_id}: {e}")

        # Notify listeners
        for callback in _JOB_LISTENERS:
            try:
                callback(job_id, updates)
            except Exception as e:
                print(f"Error in job listener: {e}")


def delete_jobs(job_ids: list[str]) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.get("jobs", {})
        for jid in job_ids:
            if jid in jobs:
                del jobs[jid]
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def clear_all_jobs() -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state["jobs"] = {}
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
