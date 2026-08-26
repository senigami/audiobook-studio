"""Issue #218: a project's display name is untrusted input that used to flow
straight into the assembly output filename (app/api/routers/projects_assembly.py)
and from there into ffmpeg's read directory (app/orchestration/tasks/assembly.py,
input_folder = output_path.parent). A traversal-shaped or absolute project name
must not be able to steer either path outside the project's own m4b_dir, and the
fix must not mangle the DISPLAY title shown in job/queue state.
"""
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.web import app
from app.db.chapters import create_chapter, update_chapter
from app.db.projects import create_project
from app.db.queue import get_queue
from app.db.state import load_state
from app.core.config import get_chapter_dir, get_project_m4b_dir
from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.orchestration.tasks.assembly import AssemblyTask

client = TestClient(app)


@pytest.mark.parametrize("malicious_name", ["../../../etc/evil", "/tmp/evil"])
def test_assemble_project_name_cannot_escape_m4b_dir(clean_db, monkeypatch, malicious_name):
    pid = create_project(malicious_name)
    cid = create_chapter(pid, "Chapter 1")

    chap_dir = get_chapter_dir(pid, cid)
    chap_dir.mkdir(parents=True, exist_ok=True)
    fake_audio = chap_dir / "chapter.wav"
    fake_audio.write_text("fake audio")
    update_chapter(cid, audio_status="done", audio_file_path="chapter.wav")

    mock_progress = MagicMock()
    mock_progress.reconcile.return_value = {"decision": "queue", "artifact_state": "missing"}
    mock_bridge = MagicMock()
    real_orchestrator = TaskOrchestrator(progress_service=mock_progress, voice_bridge=mock_bridge)
    monkeypatch.setattr("app.api.routers.projects_assembly.create_orchestrator", lambda: real_orchestrator)

    mock_assemble = MagicMock(return_value=0)
    m4b_dir = get_project_m4b_dir(pid).resolve()

    with patch("app.engines.audiobook_utils.assemble_audiobook", mock_assemble), \
         patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", return_value={"admitted": True}), \
         patch("app.orchestration.scheduler.orchestrator.release_task_resources"):

        response = client.post(f"/api/projects/{pid}/assemble")
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        assert mock_assemble.called, "assembly never reached the engine call -- test setup is broken"
        _, kwargs = mock_assemble.call_args
        resolved_output = Path(kwargs["output_m4b"]).resolve()

        assert resolved_output.is_relative_to(m4b_dir), (
            f"assembly output escaped the project's m4b_dir: {resolved_output} not under {m4b_dir}"
        )

    # The DISPLAY title must survive unmangled in job state and the queue row --
    # the fix must sanitize only the on-disk filename, never the metadata.
    state = load_state()
    assert state["jobs"][job_id]["custom_title"] == malicious_name

    queue_rows = [r for r in get_queue() if r["id"] == job_id]
    assert queue_rows, "assembly job missing from processing_queue"
    assert queue_rows[0]["custom_title"] == malicious_name


def test_assembly_task_refuses_output_path_outside_storage_roots(tmp_path, monkeypatch):
    """Defence at the point of action: AssemblyTask.run() must refuse an
    output_path outside the storage roots regardless of who built it, not just
    when it arrives via the (now-fixed) router. STRICT_PATH_SAFETY disables the
    test-mode tempdir exception in StorageManager.is_safe so tmp_path itself
    (which is otherwise treated as a trusted test root) is judged the same way
    a real deployment would judge it.
    """
    monkeypatch.setenv("STRICT_PATH_SAFETY", "1")

    outside = tmp_path / "outside" / "evil.m4b"
    outside.parent.mkdir(parents=True)

    task = AssemblyTask(
        task_id="t1",
        output_path=outside,
        is_audiobook=True,
        book_title="Whatever",
        chapters=[],
    )

    mock_assemble = MagicMock(return_value=0)
    with patch("app.engines.audiobook_utils.assemble_audiobook", mock_assemble):
        result = task.run()

    assert not mock_assemble.called, "ffmpeg assembly ran against an out-of-root output_path"
    assert result.status == "failed"
    assert "invalid" in (result.message or "").lower()
    assert not outside.exists()
