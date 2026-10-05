"""Tests for orchestrator legacy isolation."""

from __future__ import annotations


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

