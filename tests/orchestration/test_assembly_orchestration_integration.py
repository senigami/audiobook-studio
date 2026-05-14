import pytest
import os
import uuid
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.api.web import app
from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.orchestration.tasks.assembly import AssemblyTask

client = TestClient(app)

def test_audiobook_assembly_orchestration_integration(clean_db, monkeypatch, tmp_path):
    """Exercises the real TaskOrchestrator.submit path from the project assembly API."""
    from app.db.projects import create_project
    from app.db.chapters import create_chapter, update_chapter

    # 1. Setup DB
    project_name = "AssemblyIntegrationProject"
    pid = create_project(project_name)
    cid = create_chapter(pid, "Chapter 1")

    # Create fake audio file so validation passes
    from app.core.config import get_chapter_dir
    chap_dir = get_chapter_dir(pid, cid)
    chap_dir.mkdir(parents=True, exist_ok=True)
    fake_audio = chap_dir / "chapter.wav"
    fake_audio.write_text("fake audio")

    update_chapter(cid, audio_status='done', audio_file_path="chapter.wav")

    # 2. Mock Dependencies
    mock_progress = MagicMock()
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}

    mock_bridge = MagicMock() # Not used for assembly but required by orchestrator

    # 3. Create a real orchestrator but with our mocks
    real_orchestrator = TaskOrchestrator(
        progress_service=mock_progress,
        voice_bridge=mock_bridge
    )

    # 4. Patch create_orchestrator in the router
    monkeypatch.setattr("app.api.routers.projects_assembly.create_orchestrator", lambda: real_orchestrator)

    # 5. Patch external engine call to avoid real FFmpeg
    with patch("app.engines.audiobook_utils.assemble_audiobook", return_value=0) as mock_assemble:

        # 6. Patch state side-effects and resource admission
        with patch("app.api.routers.projects_assembly.put_job"), \
             patch("app.api.routers.projects_assembly.update_job"), \
             patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
             patch("app.orchestration.scheduler.orchestrator.release_task_resources"):

            # 7. Call the API
            response = client.post(f"/api/projects/{pid}/assemble")

            assert response.status_code == 200

            # 8. Verify orchestrator dispatched the task
            # Since TestClient runs BackgroundTasks, we can check mocks immediately
            assert mock_assemble.called

            # 9. Verify the arguments passed to the engine utility
            # assemble_audiobook(input_folder, book_title, output_m4b, ...)
            kwargs = mock_assemble.call_args.kwargs
            assert kwargs["book_title"] == project_name
            assert "chapters" in kwargs
            assert len(kwargs["chapters"]) == 1
            assert kwargs["chapters"][0]["title"] == "Chapter 1"
            assert str(fake_audio) in str(kwargs["chapters"][0]["filename"])
