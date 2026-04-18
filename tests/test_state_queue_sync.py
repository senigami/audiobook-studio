import time
from unittest.mock import patch

import pytest

import app.state as state_module
from app.models import Job


@pytest.fixture(autouse=True)
def clean_state_and_listeners(tmp_path):
    with patch("app.state.STATE_FILE", tmp_path / "state.json"):
        state_module.clear_all_jobs()
        original = list(state_module._JOB_LISTENERS)
        original_cache = dict(state_module._LISTENER_SNAPSHOT_SUPPORT)
        state_module._JOB_LISTENERS.clear()
        state_module._LISTENER_SNAPSHOT_SUPPORT.clear()
        yield
        state_module._JOB_LISTENERS.clear()
        state_module._JOB_LISTENERS.extend(original)
        state_module._LISTENER_SNAPSHOT_SUPPORT.clear()
        state_module._LISTENER_SNAPSHOT_SUPPORT.update(original_cache)


def test_update_job_syncs_queue_before_broadcast_listener(tmp_path):
    state_module.put_job(
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

    state_module._JOB_LISTENERS.append(listener)

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()

    with patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.db.update_queue_item", side_effect=lambda *args, **kwargs: events.append("queue-sync")), \
         patch("app.api.ws.broadcast_queue_update", side_effect=lambda: events.append("queue-broadcast")):
        state_module.update_job(
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


def test_update_job_passes_current_job_snapshot_to_three_arg_listeners(tmp_path):
    state_module.put_job(
        Job(
            id="job-snapshot-sync",
            engine="xtts",
            chapter_file="c2.txt",
            status="running",
            created_at=time.time(),
            progress=0.25,
            eta_seconds=20,
        )
    )

    events: list[tuple[str, dict, dict]] = []

    def listener(job_id, updates, current_job):
        events.append((job_id, updates, current_job))

    state_module._JOB_LISTENERS.append(listener)

    with patch("app.db.update_queue_item"), \
         patch("app.api.ws.broadcast_queue_update"), \
         patch("app.api.ws.broadcast_chapter_updated"):
        state_module.update_job("job-snapshot-sync", progress=0.5)

    assert len(events) == 1
    job_id, updates, current_job = events[0]
    assert job_id == "job-snapshot-sync"
    assert updates["progress"] == 0.5
    assert isinstance(updates["updated_at"], float)
    assert current_job["status"] == "running"
    assert current_job["progress"] == 0.5
    assert current_job["eta_seconds"] == 20
    assert current_job["updated_at"] == updates["updated_at"]


def test_add_job_listener_caches_snapshot_support():
    def listener(job_id, updates, current_job):
        return (job_id, updates, current_job)

    state_module.add_job_listener(listener)

    assert getattr(listener, "_supports_job_snapshot", None) is True


def test_add_job_listener_supports_bound_method_callbacks():
    class Listener:
        def __init__(self):
            self.events = []

        def on_update(self, job_id, updates, current_job):
            self.events.append((job_id, updates, current_job))

    listener = Listener()
    callback = listener.on_update

    state_module.add_job_listener(callback)

    assert state_module._LISTENER_SNAPSHOT_SUPPORT[callback] is True
