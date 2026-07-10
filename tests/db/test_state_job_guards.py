"""Unit tests for app.db.state_job_guards — pure guard functions.

Per testing-standards R2: we test the pure functions directly; no mocks of
the module under test and no state-store internals.
"""
import pytest
from app.db.state_job_guards import (
    should_drop_terminal_update,
    apply_status_regression_guard,
    normalize_segment_fields,
    apply_terminal_eta_cleanup,
    is_terminal_reset,
)


# ---------------------------------------------------------------------------
# should_drop_terminal_update
# ---------------------------------------------------------------------------

class TestShouldDropTerminalUpdate:
    def test_non_terminal_never_dropped(self):
        assert should_drop_terminal_update("running", {"status": "done"}, False) is False

    def test_terminal_without_reset_dropped(self):
        assert should_drop_terminal_update("done", {"status": "running"}, False) is True

    @pytest.mark.parametrize(
        "current_status, incoming_status",
        [("done", "queued"), ("failed", "preparing")],
    )
    def test_terminal_reset_to_active_not_dropped(self, current_status, incoming_status):
        assert should_drop_terminal_update(current_status, {"status": incoming_status}, False) is False

    def test_force_broadcast_bypasses_drop(self):
        assert should_drop_terminal_update("cancelled", {"status": "running"}, True) is False

    def test_cancelled_no_incoming_status_dropped(self):
        assert should_drop_terminal_update("cancelled", {"progress": 0.5}, False) is True


# ---------------------------------------------------------------------------
# apply_status_regression_guard
# ---------------------------------------------------------------------------

class TestApplyStatusRegressionGuard:
    def test_advance_always_allowed(self):
        ok, reason = apply_status_regression_guard("queued", "running", False)
        assert ok is True
        assert reason is None

    def test_same_priority_allowed(self):
        ok, _ = apply_status_regression_guard("done", "failed", False)
        assert ok is True

    @pytest.mark.parametrize("target_status", ["preparing", "queued"])
    def test_running_to_active_blocked(self, target_status):
        ok, reason = apply_status_regression_guard("running", target_status, False)
        assert ok is False
        assert reason is not None

    def test_terminal_to_queued_allowed(self):
        ok, _ = apply_status_regression_guard("done", "queued", False)
        assert ok is True

    @pytest.mark.parametrize("current_status", ["done", "failed", "cancelled"])
    def test_terminal_to_preparing_allowed(self, current_status):
        # Bug guard: terminal → preparing is a legitimate clean-slate reset (spec §3.5)
        ok, reason = apply_status_regression_guard(current_status, "preparing", False)
        assert ok is True
        assert reason is None

    def test_force_broadcast_allows_regression(self):
        ok, _ = apply_status_regression_guard("running", "preparing", True)
        assert ok is True

    def test_none_current_allows_any_status(self):
        ok, _ = apply_status_regression_guard(None, "queued", False)
        assert ok is True


# ---------------------------------------------------------------------------
# normalize_segment_fields
# ---------------------------------------------------------------------------

class TestNormalizeSegmentFields:
    def test_null_segment_id_clears_progress(self):
        j = {"active_segment_id": None, "active_segment_progress": 0.5}
        result = normalize_segment_fields(j, {"active_segment_id": None})
        assert result["active_segment_progress"] == 0.0
        assert result["active_segment_eta_seconds"] is None

    def test_existing_segment_id_preserved(self):
        j = {"active_segment_id": "seg-1", "active_segment_progress": 0.5}
        result = normalize_segment_fields(j, {"active_segment_progress": 0.6})
        assert result["active_segment_progress"] == 0.6

    def test_null_batch_id_clears_batch_progress(self):
        j = {"active_render_batch_id": None, "active_render_batch_progress": 0.3}
        result = normalize_segment_fields(j, {})
        assert result["active_render_batch_progress"] is None

    def test_does_not_mutate_inputs(self):
        j = {"active_segment_id": None}
        updates = {}
        normalize_segment_fields(j, updates)
        assert updates == {}


# ---------------------------------------------------------------------------
# apply_terminal_eta_cleanup
# ---------------------------------------------------------------------------

class TestApplyTerminalEtaCleanup:
    def test_done_status_clears_eta(self):
        result = apply_terminal_eta_cleanup({"status": "done"}, {})
        assert result["eta_seconds"] is None
        assert result["eta_basis"] is None
        assert result["estimated_end_at"] is None

    def test_failed_clears_eta(self):
        result = apply_terminal_eta_cleanup({"status": "failed", "eta_seconds": 30}, {})
        assert result["eta_seconds"] is None

    def test_running_preserves_eta(self):
        updates = {"status": "running", "eta_seconds": 60}
        result = apply_terminal_eta_cleanup(updates, {})
        assert result["eta_seconds"] == 60

    def test_inherits_terminal_from_current_job(self):
        # No status in updates; current job is terminal
        result = apply_terminal_eta_cleanup({}, {"status": "done"})
        assert result["eta_seconds"] is None


# ---------------------------------------------------------------------------
# is_terminal_reset
# ---------------------------------------------------------------------------

class TestIsTerminalReset:
    @pytest.mark.parametrize(
        "current_status, incoming_status",
        [("done", "queued"), ("failed", "preparing")],
    )
    def test_terminal_to_active_is_reset(self, current_status, incoming_status):
        assert is_terminal_reset(current_status, {"status": incoming_status}) is True

    def test_running_to_queued_not_reset(self):
        assert is_terminal_reset("running", {"status": "queued"}) is False

    def test_terminal_to_running_not_reset(self):
        assert is_terminal_reset("done", {"status": "running"}) is False
