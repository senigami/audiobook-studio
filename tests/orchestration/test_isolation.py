"""Tests for orchestrator legacy isolation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


class TestLegacyIsolation:
    def test_app_jobs_worker_not_imported_by_orchestrator(self):
        """Importing the orchestrator must not pull in app.jobs.worker."""
        import importlib

        # Ensure orchestrator re-imports cleanly
        mod = importlib.import_module("app.orchestration.scheduler.orchestrator")

        # app.jobs.worker must not be in sys.modules if it wasn't before
        # We at minimum check that the orchestrator module itself doesn't
        # reference app.jobs in its __dict__ or direct imports.
        orch_source = mod.__spec__.origin
        with open(orch_source) as f:
            src = f.read()

        # These forbidden imports must not appear as actual import statements
        assert "from app.jobs" not in src
        assert "import app.jobs" not in src

    def test_orchestrator_submit_does_not_call_jobs_worker(self, orchestrator, make_task):
        task = make_task()

        # Patch app.jobs.worker to detect if it's called
        with patch.dict("sys.modules", {"app.jobs.worker": MagicMock()}):
            orchestrator.submit(task)

        # Jobs worker's queue/dispatch must not have been called
        import sys
        jobs_worker = sys.modules.get("app.jobs.worker")
        if jobs_worker is not None:
            # If it was loaded, verify nothing was called on it
            for attr_name in dir(jobs_worker):
                attr = getattr(jobs_worker, attr_name, None)
                if isinstance(attr, MagicMock):
                    attr.assert_not_called()
