"""Tests for TaskOrchestrator.submit() logic."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest

from app.orchestration.tasks.base import TaskResult


class TestOrchestratorSubmitValidation:
    def test_validate_called_before_reconcile(self, orchestrator, make_task):
        task = make_task()
        orchestrator.submit(task)
        task.validate.assert_called_once()

    def test_validation_failure_raises_value_error(self, orchestrator, make_task):
        task = make_task(validate_raises=ValueError("bad input"))
        with pytest.raises(ValueError, match="Task validation failed"):
            orchestrator.submit(task)

    def test_validation_failure_does_not_publish(self, orchestrator, progress_service, make_task):
        task = make_task(validate_raises=ValueError("bad"))
        with pytest.raises(ValueError):
            orchestrator.submit(task)
        progress_service.publish.assert_not_called()


class TestOrchestratorSubmitReconciliation:
    def test_reuse_decision_skips_dispatch(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "valid", "can_reuse": True}
        task = make_task()
        task_id = orchestrator.submit(task)

        assert task_id == "t1"
        task.run.assert_not_called()

    def test_reuse_decision_publishes_queued_then_completed(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "valid", "can_reuse": True}
        task = make_task()
        orchestrator.submit(task)

        statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
        assert statuses[0] == "queued"
        assert statuses[-1] == "done"
        assert "artifact_reused" in [c.kwargs.get("reason_code") for c in progress_service.publish.call_args_list]

    def test_reuse_decision_publishes_progress_1(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "valid", "can_reuse": True}
        orchestrator.submit(make_task())
        last = progress_service.publish.call_args_list[-1]
        assert last.kwargs["progress"] == 1.0

    def test_missing_artifact_dispatches(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        task = make_task()
        orchestrator.submit(task)
        task.run.assert_called_once()

    def test_stale_artifact_publishes_rerender_reason(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "stale", "can_reuse": False}
        orchestrator.submit(make_task())
        reason_codes = [c.kwargs.get("reason_code") for c in progress_service.publish.call_args_list]
        assert "artifact_stale" in reason_codes

    def test_reconcile_exception_defaults_to_queue(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.side_effect = RuntimeError("db down")
        task = make_task()
        # Should not raise — defaults to queue decision and dispatches
        task_id = orchestrator.submit(task)
        assert task_id == "t1"
        task.run.assert_called_once()


class TestOrchestratorProgressTransitions:
    def _get_statuses(self, progress: MagicMock) -> list[str]:
        return [c.kwargs["status"] for c in progress.publish.call_args_list]

    def test_full_success_transition_sequence(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        orchestrator.submit(make_task())
        statuses = self._get_statuses(progress_service)
        assert statuses[0] == "queued"
        assert "preparing" in statuses
        assert "running" in statuses
        assert "finalizing" in statuses
        assert statuses[-1] == "done"

    def test_running_event_includes_started_at(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        orchestrator.submit(make_task())
        running_calls = [c for c in progress_service.publish.call_args_list if c.kwargs.get("status") == "running"]
        assert len(running_calls) == 1
        assert running_calls[0].kwargs.get("started_at") is not None

    def test_task_failure_publishes_failed_not_completed(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        task = make_task(result=TaskResult(status="failed", message="engine crashed"))
        orchestrator.submit(task)
        statuses = self._get_statuses(progress_service)
        assert "failed" in statuses
        assert "done" not in statuses

    def test_dispatch_exception_publishes_failed(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        task = make_task()
        task.run.side_effect = RuntimeError("unexpected crash")
        orchestrator.submit(task)
        statuses = self._get_statuses(progress_service)
        assert "failed" in statuses

    def test_queued_event_published_first(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        orchestrator.submit(make_task())
        first_status = progress_service.publish.call_args_list[0].kwargs["status"]
        assert first_status == "queued"

    def test_publish_exception_does_not_abort_task(self, orchestrator, progress_service, make_task):
        """Progress publication failures must not crash the orchestrator."""
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        progress_service.publish.side_effect = RuntimeError("ws disconnected")
        task = make_task()
        # Should not raise — task still runs
        task_id = orchestrator.submit(task)
        assert task_id == "t1"

    def test_bridge_tasks_wait_for_resources_before_dispatching(self, orchestrator, progress_service, make_task):
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        task = make_task()

        reservation_denied = {
            "admitted": False,
            "task_type": "synthesis",
            "task_id": "t1",
            "gpu": False,
            "vram_mb": 0,
            "cpu_heavy": False,
            "waiting_reason": "Synthesis slot held by task other-job.",
        }
        reservation_admitted = {
            "admitted": True,
            "task_type": "synthesis",
            "task_id": "t1",
            "gpu": False,
            "vram_mb": 0,
            "cpu_heavy": False,
            "waiting_reason": None,
        }

        with patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", side_effect=[reservation_denied, reservation_admitted]) as mock_reserve, patch("app.orchestration.scheduler.orchestrator.time.sleep") as mock_sleep:
            orchestrator.submit(task)

        assert mock_reserve.call_count == 2
        mock_sleep.assert_called_once()
        task.run.assert_called_once()
        statuses = self._get_statuses(progress_service)
        assert statuses[0] == "queued"
        assert "preparing" in statuses
        assert "running" in statuses

    def test_completed_bridge_task_records_render_stats(self, orchestrator, progress_service):
        from app.orchestration.tasks.synthesis import SynthesisTask

        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        task = SynthesisTask(
            task_id="t-render",
            engine_id="xtts",
            script_text="Hello world from Studio",
            output_path="/tmp/t-render.wav",
            project_id="p1",
            chapter_id="c1",
            voice_profile_id="speaker-1",
            synthesis_settings={"model": "model-a"},
        )

        with patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
             patch("app.orchestration.scheduler.orchestrator.release_task_resources"), \
             patch("app.db.performance.record_render_sample") as mock_record:
            orchestrator.voice_bridge.synthesize.return_value = {"status": "ok"}
            orchestrator.submit(task)

        assert mock_record.call_count == 1
        assert mock_record.call_args.kwargs["engine"] == "xtts"
        assert mock_record.call_args.kwargs["job_id"] == "t-render"
        assert mock_record.call_args.kwargs["tts_model"] == "model-a"
