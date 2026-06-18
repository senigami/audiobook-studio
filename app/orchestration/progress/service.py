"""Progress service boundary.

This module owns weighted progress math, ETA smoothing, and meaningful-event
gating for the live websocket path.
"""

from __future__ import annotations

import threading
import time
import sys
from collections.abc import Callable, Mapping

from .broadcaster import broadcast_progress
from .eta import (
    EtaSampleRing,
    apply_eta_ceiling,
    compute_eta_confidence,
    crossfade_eta,
    estimate_eta_seconds,
)
from .reconciliation import reconcile_work_item

INTENDED_UPSTREAM_CALLERS = (
    "app.orchestration.scheduler.orchestrator",
    "app.orchestration.tasks",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.orchestration.progress.reconciliation.reconcile_work_item",
    "app.orchestration.progress.eta.estimate_eta_seconds",
    "app.orchestration.progress.broadcaster.broadcast_progress",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.api.routers",
    "app.engines",
    "app.db.queue",
)


def _resolve_source(default: str, depth: int = 1) -> str:
    try:
        while True:
            frame = sys._getframe(depth)
            module = frame.f_globals.get("__name__", "")
            function = frame.f_code.co_name
            if module == "app.orchestration.progress.service" or function in ("publish", "_build_progress_payload"):
                depth += 1
                continue
            if module and function:
                return f"{module}.{function}"
            depth += 1
    except (AttributeError, ValueError):
        return default


class ProgressService:
    """Progress-service entry points.

    Intended flow:
    - reconcile work before execution
    - compute weighted progress and ETA
    - broadcast normalized progress events
    """

    def __init__(
        self,
        *,
        reconcile_fn,
        eta_fn,
        broadcaster,
        monotonic_clock: Callable[[], float] | None = None,
        wall_clock: Callable[[], float] | None = None,
        min_progress_delta: float = 0.01,
        max_silence_seconds: float = 10.0,
    ):
        self.reconcile_fn = reconcile_fn
        self.eta_fn = eta_fn
        self.broadcaster = broadcaster
        self.monotonic_clock = monotonic_clock or time.monotonic
        self.wall_clock = wall_clock or time.time
        self.min_progress_delta = max(0.0, float(min_progress_delta))
        self.max_silence_seconds = float(max_silence_seconds)
        self._last_payload_by_job: dict[str, dict[str, object]] = {}
        self._last_emit_tick_by_job: dict[str, float] = {}
        self._last_progress_by_job: dict[str, float] = {}
        # Per-job ETA velocity sample ring for §4A.2 numeric confidence.
        self._eta_rings: dict[str, EtaSampleRing] = {}
        # Per-job timestamp of last ETA sample (wall seconds).
        self._eta_last_sample_time: dict[str, float] = {}
        # RLock guards per-job state R-M-W (leaf lock — MUST NOT be held while
        # calling into app.db.state_jobs or any function that acquires _STATE_LOCK;
        # see D7 deadlock constraint in the task spec).
        self._lock = threading.RLock()

    def reconcile(
        self,
        *,
        job_id: str,
        task_revision_id: str,
        artifact_hash: str | None = None,
        scope: str = "job",
        requested_revision: Mapping[str, object] | None = None,
        artifact_manifest: object | None = None,
        artifact_lookup: Callable[[dict[str, object]], object | None] | None = None,
    ) -> dict[str, object]:
        """Reconcile queued work with current revision-safe artifacts.

        Args:
            job_id: Stable job identifier being reconciled.
            task_revision_id: Revision identifier that the job intends to
                satisfy.
            artifact_hash: Optional artifact hash already linked to the job.
            scope: Requested work scope such as job, chapter, block, or export.
            requested_revision: Revision context used to validate artifacts.
            artifact_manifest: Optional manifest already resolved by caller.
            artifact_lookup: Optional callback used to resolve a manifest when
                the caller only has a job snapshot or identifier context.

        Returns:
            dict[str, object]: Reconciliation result payload.
        """
        return self.reconcile_fn(
            job_id=job_id,
            task_revision_id=task_revision_id,
            artifact_hash=artifact_hash,
            scope=scope,
            requested_revision=requested_revision,
            artifact_manifest=artifact_manifest,
            artifact_lookup=artifact_lookup,
        )

    def estimate_eta(
        self,
        *,
        job_id: str,
        completed_units: int,
        total_units: int,
        observed_cps: float | None = None,
    ) -> int | None:
        """Estimate ETA from current progress and historical throughput.

        Args:
            job_id: Stable job identifier being estimated.
            completed_units: Number of completed progress units.
            total_units: Total number of progress units.
        observed_cps: Optional observed characters-per-second or equivalent
            throughput measurement from the active run.

        Returns:
            int | None: Estimated remaining seconds, or None when insufficient
            data is available.
        """
        return self.eta_fn(
            completed_units=completed_units,
            total_units=total_units,
            observed_cps=observed_cps,
        )

    def publish(
        self,
        *,
        job_id: str,
        status: str,
        scope: str = "job",
        parent_job_id: str | None = None,
        chapter_id: str | None = None,
        progress: float | None = None,
        eta_seconds: int | None = None,
        eta_confidence: str | float | None = None,
        message: str | None = None,
        reason_code: str | None = None,
        waiting_reason: str | None = None,
        started_at: float | None = None,
        updated_at: float | None = None,
        active_render_batch_id: str | None = None,
        active_render_batch_progress: float | None = None,
        active_segment_eta_seconds: int | None = None,
        active_segment_id: str | None = None,
        active_segment_progress: float | None = None,
        has_segment_support: bool | None = None,
        render_group_count: int | None = None,
        completed_render_groups: int | None = None,
        active_render_group_index: int | None = None,
        total_render_weight: int | None = None,
        completed_render_weight: int | None = None,
        active_render_group_weight: int | None = None,
        grouped_progress: float | None = None,
        source: str | None = None,
        allow_progress_regression: bool = False,
        force: bool = False,
        eta_updated_at: float | None = None,
        char_count: int | None = None,
    ) -> dict[str, object] | None:
        """Publish normalized progress updates for queue and chapter surfaces.

        Args:
            job_id: Stable job identifier being updated.
            status: Canonical live job status.
            scope: Normalized event scope.
            parent_job_id: Optional parent task/job identifier.
            chapter_id: Optional chapter identifier.
            progress: Optional normalized progress percentage or ratio.
            eta_seconds: Optional remaining seconds estimate.
            eta_confidence: Optional ETA confidence hint.
            message: Optional user-facing status message.
            reason_code: Optional machine-readable reason for the current state.
            waiting_reason: Optional resource wait explanation for queue UI.
            started_at: Optional run start timestamp.
            updated_at: Optional event timestamp.
            active_render_batch_id: Optional active grouped-render identifier.
            active_render_batch_progress: Optional progress for the active batch.
            allow_progress_regression: Allow an explicit recovery/reset event to
                move progress backward instead of clamping to the previous floor.
            force: Emit even if the payload is unchanged.

        Returns:
            dict[str, object] | None: The emitted payload, or ``None`` when the
            update was coalesced as non-meaningful.
        """
        # Prevent status rollback to preparing if synthesis has already started.
        # D7 leaf-lock: snapshot _last_payload_by_job — no state_jobs call inside.
        with self._lock:
            previous = self._last_payload_by_job.get(job_id)
        if not allow_progress_regression and previous and previous.get("started_at") is not None and status == "preparing":
            status = "running"

        lifecycle_status = status
        if status == "finalizing":
            status = "running"
        payload = self._build_progress_payload(
            job_id=job_id,
            scope=scope,
            parent_job_id=parent_job_id,
            status=status,
            progress=progress,
            eta_seconds=eta_seconds,
            eta_confidence=eta_confidence,
            message=message,
            reason_code=reason_code,
            waiting_reason=waiting_reason,
            started_at=started_at,
            updated_at=updated_at,
            active_render_batch_id=active_render_batch_id,
            active_render_batch_progress=active_render_batch_progress,
            active_segment_eta_seconds=active_segment_eta_seconds,
            active_segment_id=active_segment_id,
            active_segment_progress=active_segment_progress,
            render_group_count=render_group_count,
            completed_render_groups=completed_render_groups,
            active_render_group_index=active_render_group_index,
            total_render_weight=total_render_weight,
            completed_render_weight=completed_render_weight,
            active_render_group_weight=active_render_group_weight,
            grouped_progress=grouped_progress,
            source=source,
            eta_updated_at=eta_updated_at,
            char_count=char_count,
        )
        if not force and not self._should_emit(payload, allow_progress_regression=allow_progress_regression):
            return None

        # Capture the previous active segment state before mutating self._last_payload_by_job.
        # D7 leaf-lock: snapshot only — no state_jobs call inside.
        with self._lock:
            previous = self._last_payload_by_job.get(job_id)
        prev_status = previous.get("status") if previous else None
        status_changed = (prev_status != status)
        prev_active_segment_id = previous.get("active_segment_id") if previous else None
        new_active_segment_id = payload.get("active_segment_id")

        inferred_has_segment_support = any(
            value is not None
            for value in (
                active_segment_id,
                active_segment_eta_seconds,
                active_segment_progress,
            )
        ) or scope == "segment"
        resolved_has_segment_support = (
            inferred_has_segment_support
            if has_segment_support is None
            else bool(has_segment_support)
        )

        if status_changed or previous is None:
            from app.api.contracts.events import build_job_lifecycle_event  # noqa: PLC0415
            lifecycle_event = build_job_lifecycle_event(
                job_id=job_id,
                status=lifecycle_status,
                reason_code=reason_code or waiting_reason,
                message=message,
                project_id=parent_job_id,
                chapter_id=chapter_id,
                parent_job_id=parent_job_id,
                source=payload.get("source"),
                started_at=started_at,
                updated_at=updated_at,
                has_segment_support=resolved_has_segment_support,
                confidence=payload.get("eta_confidence"),
            )
            self.broadcaster(payload=lifecycle_event, channel="jobs")

            # queue.items is the frontend's sole row-status authority
            # (live-events.md §"Queue row authority"), and orchestrated
            # transitions suppress the legacy ws job listener
            # (skip_job_updated), so every status transition MUST be mirrored
            # here — otherwise queue rows freeze at their snapshot status.
            # voice_test scope emits its own richer queue event below.
            if scope != "voice_test":
                from app.api.contracts.events import build_queue_item_status_event  # noqa: PLC0415
                queue_status = {"completed": "done", "cancelling": "cancelled"}.get(status, status)
                existing_title = None
                existing_engine = None
                try:
                    from app.db.state import get_jobs  # noqa: PLC0415
                    existing_job = get_jobs().get(job_id)
                    if existing_job is not None:
                        existing_title = getattr(existing_job, "custom_title", None)
                        existing_engine = getattr(existing_job, "engine", None)
                except Exception:
                    pass
                queue_event = build_queue_item_status_event(
                    job_id=job_id,
                    status=queue_status,
                    progress=payload.get("progress") if payload.get("progress") is not None else 0.0,
                    eta_seconds=payload.get("eta_seconds"),
                    message=message,
                    reason_code=reason_code,
                    classification="job",
                    project_id=parent_job_id,
                    chapter_id=chapter_id,
                    started_at=started_at,
                    completed_at=self.wall_clock() if queue_status in ("done", "failed", "cancelled") else None,
                    custom_title=existing_title,
                    engine=existing_engine,
                    source=payload.get("source"),
                    has_segment_support=resolved_has_segment_support,
                    confidence=payload.get("eta_confidence"),
                )
                self.broadcaster(payload=queue_event, channel="jobs")

        if prev_active_segment_id and prev_active_segment_id != new_active_segment_id:
            from app.api.contracts.events import build_segment_progress_event  # noqa: PLC0415
            seg_status = status if status in ("failed", "cancelled") else "done"
            seg_progress = 1.0
            seg_reason_code = "SEGMENT_SAVED" if seg_status == "done" else reason_code
            seg_event = build_segment_progress_event(
                segment_id=prev_active_segment_id,
                status=seg_status,
                progress=seg_progress,
                segment_index=previous.get("active_render_group_index") or active_render_group_index,
                segment_count=render_group_count or previous.get("render_group_count"),
                message=message,
                reason_code=seg_reason_code,
                job_id=job_id,
                chapter_id=chapter_id,
                project_id=parent_job_id,
                source=payload.get("source"),
                eta_seconds=None,
                has_segment_support=resolved_has_segment_support,
                confidence=payload.get("eta_confidence"),
            )
            self.broadcaster(payload=seg_event, channel="jobs")

        # D7 leaf-lock: post-emit bookkeeping writes — no state_jobs call inside.
        with self._lock:
            self._last_payload_by_job[job_id] = payload
            self._last_emit_tick_by_job[job_id] = float(self.monotonic_clock())
            if isinstance(payload.get("progress"), (int, float)):
                self._last_progress_by_job[job_id] = float(payload["progress"])
            elif status == "queued":
                self._last_progress_by_job.pop(job_id, None)
            if status == "queued":
                self._last_payload_by_job.pop(job_id, None)
                self._eta_rings.pop(job_id, None)
                self._eta_last_sample_time.pop(job_id, None)

        # 1. Segment progress tick (first)
        if new_active_segment_id is not None or scope == "segment":
            from app.api.contracts.events import build_segment_progress_event  # noqa: PLC0415
            seg_p = payload.get("active_segment_progress") if new_active_segment_id is not None else payload.get("progress")
            if seg_p is None:
                seg_p = 0.0
            segment_eta_seconds = (
                payload.get("active_segment_eta_seconds")
                if new_active_segment_id is not None
                else payload.get("eta_seconds")
            )
            seg_event = build_segment_progress_event(
                segment_id=new_active_segment_id or job_id,
                status=status,
                progress=seg_p,
                segment_index=active_render_group_index,
                segment_count=render_group_count,
                message=message,
                reason_code=reason_code,
                job_id=job_id,
                chapter_id=chapter_id,
                project_id=parent_job_id,
                source=payload.get("source"),
                eta_seconds=segment_eta_seconds,
                updated_at=payload.get("updated_at"),
                has_segment_support=resolved_has_segment_support,
                eta_updated_at=payload.get("eta_updated_at"),
                confidence=payload.get("eta_confidence"),
            )
            self.broadcaster(payload=seg_event, channel="jobs")

        # 2. Voice test progress (second)
        if scope == "voice_test":
            from app.api.contracts.events import build_queue_item_status_event, build_voice_test_progress_event  # noqa: PLC0415
            from app.db.state import get_jobs  # noqa: PLC0415
            from app.api.routers.voices_helpers import _voice_job_title  # noqa: PLC0415

            existing_job = get_jobs().get(job_id)
            voice_name = "default"
            existing_started_at = None
            existing_completed_at = None
            existing_custom_title = None
            existing_engine = None
            if existing_job:
                if hasattr(existing_job, "speaker_profile"):
                    voice_name = existing_job.speaker_profile or "default"
                elif isinstance(existing_job, dict) and existing_job.get("speaker_profile"):
                    voice_name = existing_job["speaker_profile"]
                if hasattr(existing_job, "started_at"):
                    existing_started_at = existing_job.started_at
                elif isinstance(existing_job, dict):
                    existing_started_at = existing_job.get("started_at")
                    existing_completed_at = existing_job.get("finished_at") or existing_job.get("completed_at")
                if hasattr(existing_job, "finished_at"):
                    existing_completed_at = existing_job.finished_at
                if hasattr(existing_job, "custom_title"):
                    existing_custom_title = existing_job.custom_title
                elif isinstance(existing_job, dict):
                    existing_custom_title = existing_job.get("custom_title")
                if hasattr(existing_job, "engine"):
                    existing_engine = existing_job.engine
                elif isinstance(existing_job, dict):
                    existing_engine = existing_job.get("engine")

            resolved_custom_title = existing_custom_title or _voice_job_title(voice_name, action="Voice Test:", include_variant=False)
            resolved_engine = existing_engine or "voice_test"

            queue_event = build_queue_item_status_event(
                job_id=job_id,
                status=status,
                progress=payload.get("progress") if payload.get("progress") is not None else 0.0,
                eta_seconds=payload.get("eta_seconds"),
                message=message,
                reason_code=reason_code,
                classification="job",
                project_id=parent_job_id,
                chapter_id=chapter_id,
                started_at=started_at or existing_started_at,
                completed_at=existing_completed_at if status in ("done", "failed", "cancelled") else None,
                custom_title=resolved_custom_title,
                engine=resolved_engine,
                produced_audio_length=None,
                produced_chars=None,
                produced_segment_count=None,
                source=payload.get("source"),
                has_segment_support=resolved_has_segment_support,
                confidence=payload.get("eta_confidence"),
            )
            self.broadcaster(payload=queue_event, channel="jobs")

            voice_event = build_voice_test_progress_event(
                voice_name=voice_name,
                status=status,
                progress=payload.get("progress") if payload.get("progress") is not None else 0.0,
                started_at=started_at or (existing_job.started_at if existing_job and hasattr(existing_job, "started_at") else None) or (existing_job.get("started_at") if existing_job and isinstance(existing_job, dict) else None) or time.time(),
                job_id=job_id,
                message=message,
                source=payload.get("source"),
            )

            self.broadcaster(payload=voice_event, channel="jobs")

        # 3. Chapter progress (third)
        is_chapter_progress = (
            scope == "chapter"
            or (chapter_id is not None and scope != "segment")
        )
        if is_chapter_progress:
            from app.api.contracts.events import build_chapter_progress_event  # noqa: PLC0415
            chap_event = build_chapter_progress_event(
                chapter_id=chapter_id or "",
                status=status,
                progress=payload.get("progress") if payload.get("progress") is not None else 0.0,
                grouped_progress=payload.get("grouped_progress"),
                eta_seconds=payload.get("eta_seconds"),
                message=payload.get("message"),
                reason_code=payload.get("reason_code"),
                render_group_count=payload.get("render_group_count"),
                completed_render_groups=payload.get("completed_render_groups"),
                job_id=job_id,
                project_id=parent_job_id,
                source=payload.get("source"),
                updated_at=payload.get("updated_at"),
                has_segment_support=resolved_has_segment_support,
                eta_updated_at=payload.get("eta_updated_at"),
                confidence=payload.get("eta_confidence"),
            )
            self.broadcaster(payload=chap_event, channel="jobs")

        # D7 leaf-lock: final payload write — no state_jobs call inside.
        with self._lock:
            self._last_payload_by_job[job_id] = payload
        return payload


    def _normalize_monotonic_progress(
        self,
        *,
        job_id: str,
        completed_units: int,
        total_units: int,
        persist: bool = True,
    ) -> float:
        """Describe the monotonic-progress contract used by the UI.

        Args:
            job_id: Stable job identifier being updated.
            completed_units: Number of completed units reported so far.
            total_units: Total number of expected progress units.

        Returns:
            float: Monotonic progress value suitable for UI smoothing.

        The return value never moves backward relative to the last accepted
        value for the same job.
        """
        total = max(int(total_units), 0)
        completed = max(min(int(completed_units), total), 0)
        if total == 0:
            normalized = 0.0
        else:
            normalized = completed / total
        normalized = max(0.0, min(normalized, 1.0))

        # D7 leaf-lock: _last_progress_by_job R-M-W — no state_jobs call inside.
        with self._lock:
            previous = self._last_progress_by_job.get(job_id)
            if previous is not None and normalized < previous:
                normalized = previous

            normalized = round(normalized, 2)
            if persist:
                self._last_progress_by_job[job_id] = normalized
        return normalized

    def enrich(self, job_id: str, payload: dict, *, sample: bool = True) -> dict:
        """Apply §4A progress-contract math to an in-progress payload dict.

        Mutates and returns *payload* with the contract-correct values for
        ``progress``, ``grouped_progress``, ``eta_seconds``, ``eta_basis``,
        ``estimated_end_at``, ``eta_updated_at``, and ``eta_confidence``.

        Args:
            job_id: Stable job identifier — used for per-job ETA ring/floor state.
            payload: Mutable dict that must already contain at minimum ``status``
                and optionally ``progress``, ``eta_seconds``, ``grouped_progress``,
                ``eta_confidence``, ``eta_updated_at``, and ``updated_at``.
            sample: When ``True`` (live path), a velocity sample is pushed into the
                per-job ETA ring and ``_eta_last_sample_time`` is stamped.  Exactly
                one push per call — no double-push.  When ``False`` (snapshot /
                hydration path), all ETA values are computed from the current ring
                state WITHOUT mutating it or the monotonic floor.

        Returns:
            The enriched *payload* dict (same object, mutated in place).

        Future home of ``crossfade_eta`` / ``apply_eta_ceiling`` wiring (§4A.8 /
        §4A.4).  Those helpers are imported but not yet activated here.
        """
        status = str(payload.get("status", ""))
        is_terminal = status in {"done", "failed", "error", "cancelled"}
        now = float(payload.get("updated_at") or self.wall_clock())

        # --- §4A terminal clearing -------------------------------------------
        if is_terminal:
            payload["eta_seconds"] = None
            payload["eta_updated_at"] = None

        # --- §4A progress rounding + clamp ------------------------------------
        raw_progress = payload.get("progress")
        normalized_progress: float | None = None
        if raw_progress is not None:
            normalized_progress = round(max(0.0, min(float(raw_progress), 1.0)), 2)
            payload["progress"] = normalized_progress

        # --- §4A eta_updated_at dedupe ----------------------------------------
        eta_seconds = payload.get("eta_seconds")
        eta_updated_at = payload.get("eta_updated_at")
        resolved_eta_updated_at: float | None = None
        if eta_seconds is not None and not is_terminal:
            resolved_eta_updated_at = eta_updated_at if eta_updated_at is not None else now
            # D7 leaf-lock: _last_payload_by_job R-M-W — no state_jobs call inside.
            with self._lock:
                previous = self._last_payload_by_job.get(job_id)
            if previous is not None:
                prev_eta = previous.get("eta_seconds")
                prev_progress = previous.get("progress")
                if prev_eta == eta_seconds and prev_progress == normalized_progress:
                    resolved_eta_updated_at = previous.get("eta_updated_at") or previous.get("updated_at") or now

        # --- §4A ETA field assembly + §4A.8 crossfade ----------------------------
        # eta_observed: the raw incoming estimate (from orchestrator timing math)
        eta_observed: float | None = float(eta_seconds) if eta_seconds is not None else None

        # --- §4A.2 numeric confidence + ETA ring sampling ---------------------
        eta_confidence = payload.get("eta_confidence")
        now_wall = self.wall_clock()
        # D7 leaf-lock: _eta_rings + _eta_last_sample_time R-M-W — no state_jobs call inside.
        with self._lock:
            if isinstance(eta_confidence, float):
                # Caller pre-computed the numeric confidence — pass through.
                ring = self._eta_rings.setdefault(job_id, EtaSampleRing())
            else:
                ring = self._eta_rings.setdefault(job_id, EtaSampleRing())
                if (
                    sample
                    and normalized_progress is not None
                    and normalized_progress > 0
                    and eta_observed is not None
                    and eta_observed > 0
                    and not is_terminal
                ):
                    # velocity proxy: progress / elapsed_est (one push per enrich call)
                    # elapsed_est = eta * progress / (1 - progress)
                    elapsed_est = max(
                        0.0,
                        (eta_observed * normalized_progress) / max(1.0 - normalized_progress, 1e-6),
                    )
                    if elapsed_est > 0:
                        velocity_sample = normalized_progress / elapsed_est
                        ring.push(velocity_sample)
                    self._eta_last_sample_time[job_id] = now_wall

                last_sample_time = self._eta_last_sample_time.get(job_id)
                age_ms = (now_wall - last_sample_time) * 1000.0 if last_sample_time is not None else 0.0

                p = float(normalized_progress) if normalized_progress is not None else 0.0
                if is_terminal or p >= 1.0:
                    numeric_conf = 1.0
                else:
                    numeric_conf = compute_eta_confidence(
                        progress=p,
                        age_ms=age_ms,
                        cv=ring.cv(),
                    )
                payload["eta_confidence"] = numeric_conf

        # §4A.8 ETA crossfade: blend calculated (cold-start baseline) with observed.
        if is_terminal:
            payload["eta_seconds"] = None
            payload["eta_basis"] = None
            payload["estimated_end_at"] = None
            payload["eta_updated_at"] = None
        else:
            p = float(normalized_progress) if normalized_progress is not None else 0.0

            # Compute eta_calculated from character count + engine baseline.
            # char_count is threaded in by the publish path; enrich never reads script_text.
            eta_calculated: float | None = None
            char_count = payload.get("char_count")
            if isinstance(char_count, int) and char_count > 0 and p < 0.999:
                engine_id = payload.get("engine_id") or payload.get("engine")
                engine_id_str = str(engine_id) if engine_id else ""
                try:
                    from app.db.state_performance import seconds_per_char as _spc  # noqa: PLC0415
                    from app.engines.behavior import DEFAULT_BASELINE_ENGINE_CPS  # noqa: PLC0415
                    spc = _spc(engine_id_str, fallback_cps=DEFAULT_BASELINE_ENGINE_CPS)
                    if spc is not None and spc > 0:
                        remaining_chars = char_count * (1.0 - p)
                        eta_calculated = remaining_chars * spc
                except Exception:
                    pass

            # Derive velocity from the ring's mean (progress-units/second).
            ring_velocity: float | None = ring.mean()

            # §4A.8 crossfade calculated → observed over [P_LO, P_HI].
            blended_eta = crossfade_eta(
                progress=p,
                eta_calculated=eta_calculated,
                eta_observed=eta_observed,
                velocity=ring_velocity,
            )

            # §4A.4 mechanical ceiling.
            bounded_eta = apply_eta_ceiling(
                eta_seconds=blended_eta,
                progress=p,
                velocity=ring_velocity,
                status=status,
            )

            if bounded_eta is not None:
                sanitized_eta = max(0, int(bounded_eta))
                # Determine eta_basis: "calculated" when no observed input, else "remaining_from_update"
                eta_basis = "calculated" if eta_observed is None else "remaining_from_update"
                payload["eta_seconds"] = sanitized_eta
                payload["eta_basis"] = eta_basis
                payload["estimated_end_at"] = now + float(sanitized_eta)
                # eta_updated_at deduplication
                if resolved_eta_updated_at is not None:
                    payload["eta_updated_at"] = resolved_eta_updated_at
                else:
                    # D7 leaf-lock: _last_payload_by_job read — no state_jobs call inside.
                    with self._lock:
                        previous_payload = self._last_payload_by_job.get(job_id)
                    if previous_payload is not None:
                        prev_eta = previous_payload.get("eta_seconds")
                        prev_progress_val = previous_payload.get("progress")
                        if prev_eta == sanitized_eta and prev_progress_val == normalized_progress:
                            payload["eta_updated_at"] = (
                                previous_payload.get("eta_updated_at")
                                or previous_payload.get("updated_at")
                                or now
                            )
                        else:
                            payload["eta_updated_at"] = now
                    else:
                        payload["eta_updated_at"] = now
            else:
                # Both calculated and observed unavailable — leave null.
                payload["eta_seconds"] = None

        # --- §4A.7 / item-5: grouped_progress terminal clamp -----------------
        # Terminal status MUST reach grouped_progress=1.0.  The 0.90 stitching-room
        # cap from _get_grouped_progress is appropriate mid-render; at terminal or
        # progress≥0.999 we force 1.0.
        raw_gp = payload.get("grouped_progress")
        if raw_gp is not None:
            gp = float(raw_gp)
            if is_terminal or (normalized_progress is not None and normalized_progress >= 0.999):
                gp = 1.0  # terminal grouped→1.0 fix (verified bug: status:done, grouped_progress:0.9)
            payload["grouped_progress"] = round(max(0.0, min(gp, 1.0)), 2)

        return payload

    def _build_progress_payload(
        self,
        *,
        job_id: str,
        scope: str,
        parent_job_id: str | None,
        status: str,
        progress: float | None,
        eta_seconds: int | None,
        eta_confidence: str | float | None,
        message: str | None,
        reason_code: str | None,
        waiting_reason: str | None,
        started_at: float | None,
        updated_at: float | None,
        active_render_batch_id: str | None,
        active_render_batch_progress: float | None,
        active_segment_eta_seconds: int | None = None,
        active_segment_id: str | None = None,
        active_segment_progress: float | None = None,
        render_group_count: int | None = None,
        completed_render_groups: int | None = None,
        active_render_group_index: int | None = None,
        total_render_weight: int | None = None,
        completed_render_weight: int | None = None,
        active_render_group_weight: int | None = None,
        grouped_progress: float | None = None,
        source: str | None = None,
        eta_updated_at: float | None = None,
        char_count: int | None = None,
    ) -> dict[str, object]:
        """Thin wrapper: build the structural payload shell then apply enrich().

        The §4A math (terminal clearing, progress rounding, ETA assembly,
        confidence sampling, grouped clamp) now lives in ``enrich()``.
        This method is kept callable for backward compatibility with callers
        such as ``tests/orchestration/test_progress_logic.py``.

        Args:
            job_id: Stable job identifier being updated.
            scope: Normalized event scope.
            parent_job_id: Optional parent task/job identifier.
            status: Canonical live job status.
            progress: Optional normalized progress value.
            eta_seconds: Optional remaining seconds estimate.
            eta_confidence: Optional ETA confidence hint.
            message: Optional user-facing status message.
            reason_code: Optional machine-readable reason for the state.
            waiting_reason: Optional queue wait explanation.
            started_at: Optional run start timestamp.
            updated_at: Optional event timestamp.
            active_render_batch_id: Optional active grouped-render identifier.
            active_render_batch_progress: Optional active batch progress.

        Returns:
            dict[str, object]: Broadcast-ready progress payload.
        """
        now = float(updated_at if updated_at is not None else self.wall_clock())

        payload: dict[str, object] = {
            "type": "studio_job_event",
            "job_id": str(job_id),
            "scope": scope,
            "status": status,
            "updated_at": now,
            "source": source or _resolve_source("app.orchestration.progress.service.ProgressService.publish"),
        }
        if parent_job_id is not None:
            payload["parent_job_id"] = parent_job_id
        if progress is not None:
            payload["progress"] = progress
        if eta_seconds is not None:
            payload["eta_seconds"] = eta_seconds
        if eta_confidence is not None:
            payload["eta_confidence"] = eta_confidence
        if eta_updated_at is not None:
            payload["eta_updated_at"] = eta_updated_at
        if message is not None:
            payload["message"] = message
        if reason_code is None:
            reason_code = waiting_reason
        if reason_code is not None:
            payload["reason_code"] = reason_code
        if started_at is not None:
            payload["started_at"] = started_at
        if active_render_batch_id is not None:
            payload["active_render_batch_id"] = active_render_batch_id
        if active_render_batch_progress is not None:
            payload["active_render_batch_progress"] = round(max(0.0, min(float(active_render_batch_progress), 1.0)), 2)
        if active_segment_id is not None:
            payload["active_segment_id"] = active_segment_id
            if active_segment_progress is not None:
                payload["active_segment_progress"] = round(max(0.0, min(float(active_segment_progress), 1.0)), 2)
            if active_segment_eta_seconds is not None:
                payload["active_segment_eta_seconds"] = max(0, int(active_segment_eta_seconds))
        if render_group_count is not None:
            payload["render_group_count"] = int(render_group_count)
        if completed_render_groups is not None:
            payload["completed_render_groups"] = int(completed_render_groups)
        if active_render_group_index is not None:
            payload["active_render_group_index"] = int(active_render_group_index)
        if total_render_weight is not None:
            payload["total_render_weight"] = int(total_render_weight)
        if completed_render_weight is not None:
            payload["completed_render_weight"] = int(completed_render_weight)
        if active_render_group_weight is not None:
            payload["active_render_group_weight"] = int(active_render_group_weight)
        if grouped_progress is not None:
            payload["grouped_progress"] = float(grouped_progress)
        if char_count is not None:
            payload["char_count"] = int(char_count)

        # Delegate §4A math to enrich()
        return self.enrich(job_id, payload)


    def _should_emit(self, payload: dict[str, object], *, allow_progress_regression: bool = False) -> bool:
        job_id = str(payload["job_id"])
        # D7 leaf-lock: snapshot per-job state — no state_jobs call inside.
        with self._lock:
            previous = self._last_payload_by_job.get(job_id)
            last_emit_tick = self._last_emit_tick_by_job.get(job_id)
        if previous is None:
            return True

        self._apply_progress_regression_guard(
            payload=payload,
            previous=previous,
            allow_progress_regression=allow_progress_regression,
        )

        prev_status = previous.get("status")
        curr_status = payload.get("status")
        if prev_status in {"done", "failed", "cancelled"} and curr_status not in {"done", "failed", "cancelled", "queued", "preparing"}:
            return False

        if payload.get("status") != previous.get("status"):
            return True
        if payload.get("reason_code") != previous.get("reason_code"):
            return True
        if payload.get("message") != previous.get("message"):
            return True
        if payload.get("started_at") != previous.get("started_at"):
            return True
        if payload.get("active_render_batch_id") != previous.get("active_render_batch_id"):
            return True
        if payload.get("active_segment_id") != previous.get("active_segment_id"):
            return True
        if payload.get("active_render_batch_progress") != previous.get("active_render_batch_progress"):
            previous_batch_progress = previous.get("active_render_batch_progress")
            current_batch_progress = payload.get("active_render_batch_progress")
            if isinstance(previous_batch_progress, (int, float)) and isinstance(current_batch_progress, (int, float)):
                if abs(float(current_batch_progress) - float(previous_batch_progress)) >= self.min_progress_delta:
                    return True
            elif previous_batch_progress != current_batch_progress:
                return True

        if payload.get("active_segment_progress") != previous.get("active_segment_progress"):
            previous_seg_progress = previous.get("active_segment_progress")
            current_seg_progress = payload.get("active_segment_progress")
            if isinstance(previous_seg_progress, (int, float)) and isinstance(current_seg_progress, (int, float)):
                if abs(float(current_seg_progress) - float(previous_seg_progress)) >= self.min_progress_delta:
                    return True
            elif previous_seg_progress != current_seg_progress:
                return True
        previous_segment_eta = previous.get("active_segment_eta_seconds")
        current_segment_eta = payload.get("active_segment_eta_seconds")
        if isinstance(previous_segment_eta, int) and isinstance(current_segment_eta, int):
            if abs(current_segment_eta - previous_segment_eta) >= 1:
                return True
        elif current_segment_eta is not None and previous_segment_eta != current_segment_eta:
            return True
        if payload.get("eta_confidence") != previous.get("eta_confidence"):
            return True

        previous_progress = previous.get("progress")
        current_progress = payload.get("progress")
        if isinstance(previous_progress, (int, float)) and isinstance(current_progress, (int, float)):
            if abs(float(current_progress) - float(previous_progress)) >= self.min_progress_delta:
                return True

        previous_eta = previous.get("eta_seconds")
        current_eta = payload.get("eta_seconds")
        if isinstance(previous_eta, int) and isinstance(current_eta, int):
            if abs(current_eta - previous_eta) >= 1:
                return True

        now = float(self.monotonic_clock())
        if last_emit_tick is None:
            return True
        return (now - last_emit_tick) >= self.max_silence_seconds

    def _apply_progress_regression_guard(
        self,
        *,
        payload: dict[str, object],
        previous: dict[str, object],
        allow_progress_regression: bool,
    ) -> None:
        """Clamp backward progress unless the caller explicitly allows it."""
        if allow_progress_regression:
            return

        previous_progress = previous.get("progress")
        current_progress = payload.get("progress")
        if payload.get("status") == "queued":
            return
        if not isinstance(previous_progress, (int, float)):
            return
        if not isinstance(current_progress, (int, float)):
            return
        if current_progress >= previous_progress:
            return

        payload["progress"] = previous_progress


def create_progress_service() -> ProgressService:
    """Create the progress-service shell with helper dependency wiring.

    Returns:
        ProgressService: Progress-service shell ready for future orchestration.
    """
    return ProgressService(
        reconcile_fn=reconcile_work_item,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcast_progress,
    )


# ---------------------------------------------------------------------------
# Singleton accessor / installer
# ---------------------------------------------------------------------------
# NO import-time construction — the instance is created only on first call to
# get_progress_service() (lazy) or by an explicit set_progress_service() call
# from the boot sequence (boot.py).  Tests that construct their own local
# ProgressService(...) instances are unaffected and do NOT route through here.

_progress_service_instance: ProgressService | None = None
_progress_service_lock = threading.Lock()


def get_progress_service() -> ProgressService:
    """Return the boot-installed singleton, lazily creating one if absent.

    The lazy path uses the same ``create_progress_service()`` factory so that
    non-boot contexts (CLI tools, isolated tests) get a working instance without
    needing to call ``boot_studio()``.

    Returns:
        ProgressService: The shared progress-service singleton.
    """
    global _progress_service_instance  # noqa: PLW0603
    if _progress_service_instance is None:
        with _progress_service_lock:
            if _progress_service_instance is None:
                _progress_service_instance = create_progress_service()
    return _progress_service_instance


def set_progress_service(instance: ProgressService) -> None:
    """Install *instance* as the singleton (boot sequence + tests).

    Idempotent when called with the same instance.  Calling with a new instance
    replaces the previous one — use ``reset_progress_service()`` between tests.

    Args:
        instance: The :class:`ProgressService` instance to install.
    """
    global _progress_service_instance  # noqa: PLW0603
    with _progress_service_lock:
        _progress_service_instance = instance


def reset_progress_service() -> None:
    """Clear the singleton (test teardown / boot re-entry).

    After this call ``get_progress_service()`` will lazily create a fresh
    instance on next access.
    """
    global _progress_service_instance  # noqa: PLW0603
    with _progress_service_lock:
        _progress_service_instance = None
