import json
import logging
import time
import dataclasses
from dataclasses import asdict
from typing import Dict, Any, Optional

from ..utils.render_trace import trace
from .models import Job
from .state_helpers import (
    _STATE_LOCK, _JOB_LISTENERS, _LISTENER_SNAPSHOT_SUPPORT, _load_state_no_lock, _atomic_write_text, get_state_file,
    _cache_listener_snapshot_support, STATE_FILE, SAFE_OUTPUT_FILE_RE
)
from ..utils.subprocess_utils import probe_audio_duration

logger = logging.getLogger(__name__)

ETA_PROJECTION_SKIP_REASONS = {
    "heartbeat",
    "synthesis_progress",
    "synthesis_finished",
    "post_processing",
    "metadata_update",
    "segment_start",
    "segment_saved",
    "START_SEGMENT",
    "SEGMENT_PROGRESS",
    "SEGMENT_SAVED",
}


def _resolve_caller(depth: int = 1) -> Optional[str]:
    try:
        import sys
        while True:
            frame = sys._getframe(depth)
            module = frame.f_globals.get("__name__", "")
            function = frame.f_code.co_name
            if module == "app.db.state_jobs" or function == "update_job":
                depth += 1
                continue
            if module and function:
                return f"{module}.{function}"
            depth += 1
    except (AttributeError, ValueError):
        return None


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
        if job.status == "finalizing":
            job.status = "running"
        if job.updated_at is None:
            job.updated_at = job.created_at

        # Check for terminal-to-active reset
        existing_job = state["jobs"].get(job.id)
        is_terminal_reset = False
        if existing_job:
            old_status = existing_job.get("status")
            if old_status in ("done", "failed", "cancelled") and job.status in ("queued", "preparing"):
                is_terminal_reset = True

        state["jobs"][job.id] = asdict(job)
        _atomic_write_text(get_state_file(), json.dumps(state, indent=2))

    if is_terminal_reset:
        try:
            from ..api.ws import broadcast_chapter_updated, broadcast_queue_update
            chapter_id = job.chapter_id
            if chapter_id:
                broadcast_chapter_updated(
                    chapter_id,
                    reason="JOB_RESET_TO_ACTIVE",
                    job_id=job.id,
                    project_id=job.project_id,
                    changed_fields=["status"]
                )
            broadcast_queue_update(
                reason="JOB_RESET_TO_ACTIVE",
                job_id=job.id,
                project_id=job.project_id,
                changed_fields=["status"]
            )
        except Exception:
            logger.warning("Failed to broadcast terminal reset for %s", job.id, exc_info=True)

    try:
        from ..api.ws import broadcast_job_updated
        broadcast_job_updated(
            job.id,
            {
                "skip_job_updated": True,
                "terminal_reset": is_terminal_reset,
                "reason_code": "JOB_RESET_TO_ACTIVE" if is_terminal_reset else None,
                "previous_status": existing_job.get("status") if existing_job else None,
                "status_changed": bool(existing_job and existing_job.get("status") != job.status),
            },
            current_job=asdict(job),
        )
    except Exception:
        pass



def update_job(job_id: str, force_broadcast: bool = False, source: Optional[str] = None, **updates) -> None:
    skip_studio_job_event = updates.pop("skip_studio_job_event", False)
    skip_job_updated = updates.pop("skip_job_updated", False)
    if source is None:
        source = _resolve_caller()
    if "status" in updates and updates["status"] == "finalizing":
        updates["status"] = "running"
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.setdefault("jobs", {})
        j = jobs.get(job_id)
        if not j:
            return

        # Normalize segment and batch progress when their respective IDs are None
        effective_active_seg_id = updates.get("active_segment_id") if "active_segment_id" in updates else j.get("active_segment_id")
        if effective_active_seg_id is None:
            updates["active_segment_progress"] = 0.0
            updates["active_segment_eta_seconds"] = None
            updates["active_segment_eta_basis"] = None
            updates["active_segment_updated_at"] = None

        effective_active_batch_id = updates.get("active_render_batch_id") if "active_render_batch_id" in updates else j.get("active_render_batch_id")
        if effective_active_batch_id is None:
            updates["active_render_batch_progress"] = None

        current_status = j.get("status")
        terminal_reset = current_status in ("done", "failed", "cancelled") and updates.get("status") in ("queued", "preparing")
        if not force_broadcast and current_status in ("done", "failed", "cancelled"):
            incoming_status = updates.get("status")
            if incoming_status not in ("queued", "preparing"):
                # Drop updates to terminal jobs
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

            if terminal_reset and k in ("finished_at", "started_at", "eta_seconds", "eta_basis", "estimated_end_at", "active_segment_id", "active_segment_progress", "active_render_batch_id", "active_render_batch_progress", "active_segment_eta_seconds", "active_segment_eta_basis", "active_segment_updated_at", "reason_code", "error"):
                # A rerun of a terminal job should come back as a clean active job record.
                if j.get(k) is not None:
                    j[k] = None
                    changed_fields.append(k)
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
        progress = j.get("progress")
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
        elif (
            status == "running"
            and started_at
            and progress is not None
            and 0.03 <= progress < 0.98
            and updates.get("reason_code") not in ETA_PROJECTION_SKIP_REASONS
        ):
            # Observed progress projection
            # Only compute if we don't have a fresh explicit ETA update in this payload
            elapsed = event_updated_at - started_at
            if elapsed > 1:
                import math
                extrapolated = math.ceil(elapsed * (1 - progress) / progress)
                previous_eta = j.get("eta_seconds")
                if previous_eta is not None and progress < 0.15:
                    alpha = progress / 0.15
                    remaining = math.ceil(alpha * extrapolated + (1 - alpha) * previous_eta)
                else:
                    remaining = extrapolated
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

        trace(
            "state.update_job",
            job_id=job_id,
            status=j.get("status"),
            progress=j.get("progress"),
            reason_code=j.get("reason_code"),
            eta_seconds=j.get("eta_seconds"),
            eta_basis=j.get("eta_basis"),
            estimated_end_at=j.get("estimated_end_at"),
            started_at=j.get("started_at"),
            active_segment_id=j.get("active_segment_id"),
            active_segment_progress=j.get("active_segment_progress"),
            changed_fields=changed_fields,
            incoming_updates=updates,
        )

        if changed_fields:
            jobs[job_id] = j
            _atomic_write_text(get_state_file(), json.dumps(state, indent=2))
            from ..engines.behavior import has_behavior
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
                from ..db import update_queue_item

                audio_length = 0.0
                output_file = None
                queue_error = None
                new_status = updates.get("status", j.get("status"))
                project_id = updates.get("project_id", j.get("project_id"))

                if new_status == "done":
                    # Try to extract the true duration using ffprobe for the synchronized database record
                    output_file = updates.get("output_mp3", j.get("output_mp3"))
                    if not output_file:
                        output_file = updates.get("output_wav", j.get("output_wav"))

                    if output_file and project_id and j.get("chapter_id"):
                        from ..core.config import resolve_chapter_asset_path
                        asset_type = "segment" if j.get("segment_ids") else "audio"
                        full_audio_path = resolve_chapter_asset_path(project_id, j.get("chapter_id"), asset_type, filename=output_file)

                        if full_audio_path and full_audio_path.exists():
                            try:
                                audio_length = probe_audio_duration(full_audio_path)
                            except Exception:
                                logger.warning("Could not get duration for %s", output_file, exc_info=True)
                elif new_status in ("failed", "cancelled"):
                    queue_error = updates.get("error") or j.get("error")

                update_queue_item(
                    job_id, 
                    new_status, 
                    audio_length_seconds=audio_length, 
                    force_chapter_id=j.get("chapter_id"), 
                    output_file=output_file,
                    error=queue_error,
                    chapter_scoped=not bool(j.get("segment_ids")),
                )

                try:
                    from ..api.ws import broadcast_chapter_updated, broadcast_queue_update
                    # Gate chapter invalidation broadcasts to terminal status transitions or explicit force_broadcast.
                    if new_status in ("done", "failed", "cancelled") or terminal_reset or force_broadcast:
                        chapter_id = j.get("chapter_id")
                        if chapter_id:
                            broadcast_chapter_updated(
                                chapter_id,
                                reason="job_terminal_status" if new_status in ("done", "failed", "cancelled") else ("JOB_RESET_TO_ACTIVE" if terminal_reset else "chapter_updated"),
                                job_id=job_id,
                                project_id=project_id,
                                changed_fields=["status"]
                            )
                    # For terminal updates, do not emit queue invalidation. Only emit on reset or explicit force_broadcast for non-terminal statuses.
                    if (terminal_reset or force_broadcast) and new_status not in ("done", "failed", "cancelled"):
                        broadcast_queue_update(
                            reason="JOB_RESET_TO_ACTIVE" if terminal_reset else "QUEUE_INVALIDATED",
                            job_id=job_id,
                            project_id=project_id,
                            changed_fields=["status"]
                        )
                except ImportError:
                    logger.debug("broadcast_queue_update is unavailable during state sync")

            except Exception:
                logger.warning("Failed to sync job status to SQLite for %s", job_id, exc_info=True)

        broadcast_dict = {k: v for k, v in updates.items() if k != "log"}
        if skip_studio_job_event:
            broadcast_dict["skip_studio_job_event"] = True
        if skip_job_updated:
            broadcast_dict["skip_job_updated"] = True
        if terminal_reset:
            broadcast_dict["terminal_reset"] = True
            broadcast_dict.setdefault("reason_code", "JOB_RESET_TO_ACTIVE")
        broadcast_dict["previous_status"] = current_status
        broadcast_dict["status_changed"] = current_status != j.get("status")
        if source is not None:
            broadcast_dict["source"] = source
        if auto_updated_at is not None:
            broadcast_dict.setdefault("updated_at", auto_updated_at)
        if broadcast_dict or force_broadcast:
            job_snapshot = dict(j)
            try:
                from ..db import state as state_module
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
def requeue(job_id: str) -> None:
    """Wipes job metadata and resets status to queued (Clean Slate Protocol)."""
    update_job(
        job_id,
        status="queued",
        progress=0.0,
        log="",
        started_at=None,
        finished_at=None,
        error=None,
        warning_count=0,
        force_broadcast=True
    )
