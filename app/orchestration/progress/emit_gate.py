"""Emit rate-limit gate for the progress service.

Split out of ``ProgressService`` (LF-6, simplification/04_large_file_splits.md).
Mixed into ``ProgressService`` via ``EmitGateMixin`` so ``self._lock``,
``self.monotonic_clock``, ``self.min_progress_delta``, ``self.max_silence_seconds``,
``self._last_payload_by_job``, and ``self._last_emit_tick_by_job`` stay
``ProgressService`` instance attributes set in its ``__init__`` — no behavior
change, no lock-ordering change. The D7 leaf-lock constraint (this code must
never call ``get_jobs()`` / anything that acquires ``_STATE_LOCK`` while
holding ``self._lock``) is preserved verbatim.
"""

from __future__ import annotations


class EmitGateMixin:
    """Atomic emit-gate: decide whether to emit AND reserve throttle state."""

    def _claim_emit_slot(
        self,
        payload: dict[str, object],
        *,
        allow_progress_regression: bool = False,
        force: bool = False,
    ) -> tuple[bool, dict[str, object] | None]:
        """Atomically decide whether to emit AND reserve the throttle state.

        Both the emit decision and the state reservation happen inside a single
        ``self._lock`` acquisition:
          1. Read the current ``previous`` snapshot and ``last_emit_tick``.
          2. Run ``_should_emit_unlocked`` against those snapshots.
          3. If emitting: write both ``_last_emit_tick_by_job`` AND
             ``_last_payload_by_job`` under the same lock acquisition.

        Writing ``_last_payload_by_job`` inside the claim ensures that a
        concurrent thread for the same job_id sees the *new* payload as its
        ``previous`` when it enters the gate, not the stale pre-emit value.
        This closes the double-emit race: the second thread compares its
        candidate against the already-claimed payload; if they are identical
        (or below the progress/ETA delta thresholds) it returns False.

        D7 constraint: NO ``get_jobs()`` / ``state_jobs`` call inside this
        critical section.  Only ``_last_payload_by_job``, ``_last_emit_tick_by_job``,
        and ``self.monotonic_clock()`` are touched inside the lock.

        Args:
            payload: The candidate payload dict (already enriched by ``enrich()``).
            allow_progress_regression: Passed through to ``_should_emit_unlocked``.
            force: When ``True`` the throttle/change-detection gates are bypassed.

        Returns:
            ``(should_emit, previous)`` — when ``should_emit`` is ``True`` the
            caller must emit; ``previous`` is the PRE-CLAIM snapshot needed by
            the segment-transition and status-change logic in ``publish()``
            (i.e. the state that existed before we reserved the slot).
        """
        job_id = str(payload["job_id"])
        with self._lock:
            previous = self._last_payload_by_job.get(job_id)
            last_emit_tick = self._last_emit_tick_by_job.get(job_id)

            if force:
                # Reserve both tick and payload atomically.
                self._last_emit_tick_by_job[job_id] = float(self.monotonic_clock())
                self._last_payload_by_job[job_id] = payload
                return True, previous

            should = self._should_emit_unlocked(
                payload=payload,
                previous=previous,
                last_emit_tick=last_emit_tick,
                allow_progress_regression=allow_progress_regression,
            )
            if should:
                # Reserve tick AND payload so a racing same-job thread sees both.
                # D7: monotonic_clock is injected (no lock nesting); no state_jobs call.
                self._last_emit_tick_by_job[job_id] = float(self.monotonic_clock())
                self._last_payload_by_job[job_id] = payload
            return should, previous

    def _should_emit_unlocked(
        self,
        *,
        payload: dict[str, object],
        previous: dict[str, object] | None,
        last_emit_tick: float | None,
        allow_progress_regression: bool = False,
    ) -> bool:
        """Core emit-gate logic operating on already-snapshotted state.

        Called INSIDE ``self._lock`` from ``_claim_emit_slot``.  Must NOT
        acquire any other lock or call ``get_jobs()`` / any ``state_jobs``
        function (D7).

        Returns:
            bool: ``True`` when the payload should be emitted.
        """
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
        # Confidence changes gradually as the maturity ring fills (§4A.5 cold-start).
        # The maturity factor increments in steps of 1/N_MATURE (= 0.2 with N=5),
        # so consecutive cold frames can differ by ~0.2 per step.  Only treat a
        # confidence shift as meaningful when it exceeds 0.25 — large enough to skip
        # the natural cold-start increment but small enough to surface real transitions
        # (e.g. a large c_fresh decay or a convergence/divergence event).
        _MIN_CONF_DELTA: float = 0.25
        prev_conf = previous.get("eta_confidence")
        curr_conf = payload.get("eta_confidence")
        if isinstance(prev_conf, float) and isinstance(curr_conf, float):
            if abs(curr_conf - prev_conf) >= _MIN_CONF_DELTA:
                return True
        elif curr_conf != prev_conf:
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
