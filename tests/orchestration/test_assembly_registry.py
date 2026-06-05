import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from app.orchestration.tasks.assembly import AssemblyTask
from app.orchestration.scheduler.orchestrator import TaskOrchestrator

@pytest.fixture
def orchestrator():
    ps = MagicMock()
    vb = MagicMock()
    return TaskOrchestrator(progress_service=ps, voice_bridge=vb)

def test_assembly_task_uses_registry(orchestrator, tmp_path):
    with patch("app.jobs.handlers.audiobook.handle_audiobook_job") as mock_handler:
        mock_handler.return_value = None
        from app.jobs.registry import get_handler_registry, initialize_default_handlers
        get_handler_registry().clear()
        initialize_default_handlers()

        output_path = tmp_path / "chapter.wav"
    segment_paths = [tmp_path / "seg1.wav", tmp_path / "seg2.wav"]
    for p in segment_paths: p.write_text("audio")

    task = AssemblyTask(
        task_id="assembly_job",
        output_path=output_path,
        segment_paths=segment_paths,
        project_id="00000000-0000-0000-0000-000000000001",
        chapter_id="00000000-0000-0000-0000-000000000002"
    )

    # We also need to mock db.state.get_jobs to return a job with status="done"
    mock_job = MagicMock()
    mock_job.status = "done"

    with patch("app.db.state.get_jobs", return_value={"assembly_job": mock_job}):
        context = task.describe()
        result = orchestrator._dispatch(task=task, context=context)

        assert result.status == "completed"
        mock_handler.assert_called_once()
