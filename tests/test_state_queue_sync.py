import time
from unittest.mock import patch

import pytest

from app.models import Job
from app.state import clear_all_jobs, put_job, update_job, _JOB_LISTENERS


@pytest.fixture(autouse=True)
def clean_state_and_listeners(tmp_path):
    with patch("app.state.STATE_FILE", tmp_path / "state.json"):
        clear_all_jobs()
        original = list(_JOB_LISTENERS)
        _JOB_LISTENERS.clear()
        yield
        _JOB_LISTENERS.clear()
        _JOB_LISTENERS.extend(original)


def test_update_job_syncs_queue_before_broadcast_listener(tmp_path):
    put_job(
        Job(
            id="job-voxtral-sync",
            engine="voxtral",
            chapter_file="c1.txt",
            status="running",
            created_at=time.time(),
            project_id="project-1",
            chapter_id="chapter-1",
        )
    )

    events: list[str] = []

    def listener(job_id, updates):
        events.append(f"listener:{job_id}:{updates.get('status')}")

    _JOB_LISTENERS.append(listener)

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()

    with patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.db.update_queue_item", side_effect=lambda *args, **kwargs: events.append("queue-sync")), \
         patch("app.api.ws.broadcast_queue_update", side_effect=lambda: events.append("queue-broadcast")):
        update_job(
            "job-voxtral-sync",
            status="done",
            finished_at=time.time(),
            progress=1.0,
            output_wav="chapter.wav",
        )

    assert events == [
        "queue-sync",
        "queue-broadcast",
        "listener:job-voxtral-sync:done",
    ]
