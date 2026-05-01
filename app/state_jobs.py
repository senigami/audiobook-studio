import json
import logging
import time
import dataclasses
from dataclasses import asdict
from typing import Dict, Any, Optional

from .models import Job
from .state_helpers import (
    _STATE_LOCK, _JOB_LISTENERS, _LISTENER_SNAPSHOT_SUPPORT, _load_state_no_lock, _atomic_write_text, get_state_file,
    _cache_listener_snapshot_support, STATE_FILE, SAFE_OUTPUT_FILE_RE
)
from .subprocess_utils import probe_audio_duration

logger = logging.getLogger(__name__)


def get_jobs() -> Dict[str, Job]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        raw = state.get("jobs", {})
        # Safety: only pass keys that exist in the current Job dataclass
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
        if job.updated_at is None:
            job.updated_at = job.created_at
        state["jobs"][job.id] = asdict(job)
        _atomic_write_text(get_state_file(), json.dumps(state, indent=2))


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
                if not force_broadcast and new_p < old_p:
                    # Allow regression only if explicitly resetting (e.g. back to queued from a terminal state)
                    # But if we're in the middle of a run, don't let a stray 'queued' msg win.
                    is_reset = v == "queued" and current_status in ("done", "failed", "cancelled")
                    if not is_reset and (v == "queued" and current_status in ("preparing", "running", "finalizing")):
                        logger.debug("Preventing status regression for %s: %s -> %s", job_id, current_status, v)
                        continue
                    elif not is_reset:
                        logger.debug("Preventing status regression for %s: %s -> %s", job_id, current_status, v)
                        continue

            # 2. Progress regression protection
            if k == "progress":
                if v is not None:
                    v = round(float(v), 2)

                target_status = updates.get("status") or j.get("status")
                current_p = j.get("progress") or 0.0

                # Strictly prevent regression once running, UNLESS forced.
                # Only allow backward movement if status is being reset to a pre-running state (e.g. back to 'queued').
                if target_status in ("running", "finalizing", "done"):
                    # 0.01 floor removal: Allow regression to 0.0 if we are only at the very start (< 0.03)
                    # This allows the 'preparing -> running 0.0' handoff to happen cleanly.
                    if not force_broadcast and v is not None and v < current_p and current_p >= 0.03:
                        logger.debug("Preventing progress regression for %s during %s: %s -> %s", job_id, target_status, current_p, v)
                        # Clamp to current progress instead of skipping entirely
                        v = current_p

            if j.get(k) != v:
                j[k] = v
                changed_fields.append(k)

        # 4. ETA basis/end_at hardening & Observed Progress Projection
        event_updated_at = float(updates.get("updated_at") or time.time())
        status = updates.get("status") or j.get("status")
        progress = updates.get("progress") if "progress" in updates else j.get("progress")
        started_at = updates.get("started_at") or j.get("started_at")

        # Explicit ETA check or Observed projection
        if "eta_seconds" in updates:
            eta_val = updates.get("eta_seconds")
            if eta_val is not None:
                sanitized_eta = max(0, int(eta_val))
                j["eta_seconds"] = sanitized_eta
                updates["eta_seconds"] = sanitized_eta

                if (updates.get("eta_basis") or j.get("eta_basis")) is None:
                    j["eta_basis"] = "remaining_from_update"
                    updates["eta_basis"] = "remaining_from_update"
                    if "eta_basis" not in changed_fields:
                        changed_fields.append("eta_basis")

                # Recompute anchor relative to this specific update event
                if (updates.get("eta_basis") or j.get("eta_basis")) == "remaining_from_update":
                    end_at = event_updated_at + sanitized_eta
                    j["estimated_end_at"] = end_at
                    updates["estimated_end_at"] = end_at
                    if "estimated_end_at" not in changed_fields:
                        changed_fields.append("estimated_end_at")
                    if "eta_seconds" not in changed_fields:
                        changed_fields.append("eta_seconds")
            else:
                # Explicitly clear ETA metadata
                for k in ("eta_seconds", "eta_basis", "estimated_end_at"):
                    if j.get(k) is not None:
                        j[k] = None
                        updates[k] = None
                        if k not in changed_fields:
                            changed_fields.append(k)
        elif status == "running" and started_at and progress is not None and 0.03 <= progress < 0.98:
            # Observed progress projection
            # Only compute if we don't have a fresh explicit ETA update in this payload
            elapsed = event_updated_at - started_at
            if elapsed > 1:
                import math
                remaining = math.ceil(elapsed * (1 - progress) / progress)
                # Omit if remaining is absurdly huge (> 24 hours) or if progress stagnant
                if 1 <= remaining <= 86400:
                    j["eta_seconds"] = remaining
                    updates["eta_seconds"] = remaining
                    j["eta_basis"] = "remaining_from_update"
                    updates["eta_basis"] = "remaining_from_update"
                    end_at = event_updated_at + remaining
                    j["estimated_end_at"] = end_at
                    updates["estimated_end_at"] = end_at
                    for k in ("eta_seconds", "eta_basis", "estimated_end_at"):
                        if k not in changed_fields:
                            changed_fields.append(k)

        auto_updated_at = None
        if changed_fields or force_broadcast:
            auto_updated_at = event_updated_at
            if j.get("updated_at") != auto_updated_at:
                j["updated_at"] = auto_updated_at
                if "updated_at" not in changed_fields:
                    changed_fields.append("updated_at")
        if not changed_fields and not force_broadcast:
            return

        if changed_fields:
            jobs[job_id] = j
            _atomic_write_text(get_state_file(), json.dumps(state, indent=2))
            from .engines.behavior import has_behavior
            if has_behavior(j.get("engine"), "verbose_logging"):
                logger.info(
                    "[%s-debug %s] update_job id=%s changed=%s status=%s progress=%s started_at=%s finished_at=%s output_wav=%s output_mp3=%s",
                    j.get("engine"),
                    time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
                    job_id,
                    changed_fields,
                    j.get("status"),
                    j.get("progress"),
                    j.get("started_at"),
                    j.get("finished_at"),
                    j.get("output_wav"),
                    j.get("output_mp3"),
                )

        # 3. Broadcast updates to listeners (e.g. WebSockets)
        if "status" in changed_fields or "started_at" in changed_fields or force_broadcast:
            try:
                from .db import update_queue_item
                from .config import XTTS_OUT_DIR

                audio_length = 0.0
                output_file = None
                new_status = updates.get("status", j.get("status"))

                if new_status == "done":
                    # Try to extract the true duration using ffprobe for the synchronized database record
                    output_file = updates.get("output_mp3", j.get("output_mp3"))
                    if not output_file:
                        output_file = updates.get("output_wav", j.get("output_wav"))

                    if output_file:
                        project_id = updates.get("project_id") or j.get("project_id")
                        if project_id:
                            from .config import get_project_audio_dir
                            pdir = get_project_audio_dir(project_id)
                        else:
                            pdir = XTTS_OUT_DIR

                        full_audio_path = None
                        if isinstance(output_file, str) and SAFE_OUTPUT_FILE_RE.fullmatch(output_file):
                            for entry in pdir.iterdir():
                                if entry.is_file() and entry.name == output_file:
                                    full_audio_path = entry.resolve()
                                    break
                        if full_audio_path and full_audio_path.exists():
                            try:
                                audio_length = probe_audio_duration(full_audio_path)
                            except Exception:
                                logger.warning("Could not get duration for %s", output_file, exc_info=True)

                update_queue_item(
                    job_id, 
                    new_status, 
                    audio_length_seconds=audio_length, 
                    force_chapter_id=j.get("chapter_id"), 
                    output_file=output_file,
                    chapter_scoped=not bool(j.get("segment_ids")),
                )

                try:
                    from .api.ws import broadcast_chapter_updated, broadcast_queue_update
                    chapter_id = j.get("chapter_id")
                    if chapter_id:
                        broadcast_chapter_updated(chapter_id)
                    broadcast_queue_update()
                except ImportError:
                    logger.debug("broadcast_queue_update is unavailable during state sync")

            except Exception:
                logger.warning("Failed to sync job status to SQLite for %s", job_id, exc_info=True)

        broadcast_dict = {k: v for k, v in updates.items() if k != "log"}
        if auto_updated_at is not None:
            broadcast_dict.setdefault("updated_at", auto_updated_at)
        if broadcast_dict or force_broadcast:
            job_snapshot = dict(j)
            try:
                from . import state as state_module
            except Exception:
                state_module = None

            listeners = getattr(state_module, "_JOB_LISTENERS", _JOB_LISTENERS)
            snapshot_support = getattr(state_module, "_LISTENER_SNAPSHOT_SUPPORT", _LISTENER_SNAPSHOT_SUPPORT)
            cache_snapshot_support = getattr(state_module, "_cache_listener_snapshot_support", _cache_listener_snapshot_support)

            for listener in listeners:
                try:
                    supports_snapshot = snapshot_support.get(listener)
                    if supports_snapshot is None:
                        supports_snapshot = cache_snapshot_support(listener)

                    if supports_snapshot:
                        listener(job_id, broadcast_dict, job_snapshot)
                    else:
                        listener(job_id, broadcast_dict)
                except Exception:
                    logger.warning("Job listener failed for %s", job_id, exc_info=True)

        # PRUNING: If job is done/failed/cancelled, we can remove it from state.json
        if updates.get("status", j.get("status")) in ("done", "failed", "cancelled"):
            prune_completed_jobs()


def prune_completed_jobs() -> None:
    """
    Removes jobs from the state if they are in a terminal state.
    We keep a small buffer of recent completions (e.g. 50) to allow UI transitions.
    """
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.get("jobs", {})

        terminal_jobs = [
            (jid, jdata.get("finished_at", 0) or jdata.get("created_at", 0))
            for jid, jdata in jobs.items()
            if jdata.get("status") in ("done", "failed", "cancelled")
        ]

        # Sort by completion time, keep the most recent 50
        terminal_jobs.sort(key=lambda x: x[1], reverse=True)
        to_prune = [jid for jid, _ in terminal_jobs[50:]]

        if to_prune:
            for jid in to_prune:
                del jobs[jid]
            _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
            logger.debug("Pruned %s terminal jobs from state.json", len(to_prune))


def delete_jobs(job_ids: list[str]) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.get("jobs", {})
        for jid in job_ids:
            if jid in jobs:
                del jobs[jid]
        _atomic_write_text(get_state_file(), json.dumps(state, indent=2))


def clear_all_jobs() -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state["jobs"] = {}
        _atomic_write_text(get_state_file(), json.dumps(state, indent=2))


def purge_jobs_for_chapter(chapter_id: str) -> None:
    """Removes all existing jobs for a specific chapter from the state."""
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.get("jobs", {})
        to_delete = [jid for jid, jdata in jobs.items() if jdata.get("chapter_id") == chapter_id]
        if to_delete:
            for jid in to_delete:
                del jobs[jid]
            _atomic_write_text(get_state_file(), json.dumps(state, indent=2))
            logger.debug("Purged %s stale jobs for chapter %s", len(to_delete), chapter_id)
