"""Integration tests for TaskOrchestrator with real StudioTasks."""

from __future__ import annotations

from app.orchestration.tasks.api_synthesis import ApiSynthesisTask


class TestOrchestratorIntegration:
    def test_orchestrator_can_submit_api_synthesis_task(self, orchestrator, progress_service):
        progress_service.reconcile.return_value = {"artifact_state": "valid", "can_reuse": True}
        task = ApiSynthesisTask(
            task_id="submit-test",
            engine_id="xtts",
            text="Hello world",
            output_path="/tmp/out.wav",
        )
        task_id = orchestrator.submit(task)
        assert task_id == "submit-test"
        # Reuse decision → no synthesis
        statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
        assert "completed" in statuses
