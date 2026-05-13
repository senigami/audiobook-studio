import pytest
import time
from unittest.mock import MagicMock, patch
from app.db.state_jobs import update_job, Job, get_jobs

def test_heartbeat_eta_stability():
    """Verify that progress heartbeats do not update or push out the estimated_end_at."""
    job_id = "eta_test_job"

    # Setup initial job with an ETA
    start_time = time.time() - 10
    initial_job = Job(
        id=job_id,
        engine="voxtral",
        status="running",
        progress=0.3,
        started_at=start_time,
        created_at=start_time,
        updated_at=start_time,
        eta_seconds=30,
        eta_basis="remaining_from_update",
        estimated_end_at=start_time + 10 + 30
    )

    with patch("app.db.state_jobs._load_state_no_lock") as mock_load, \
         patch("app.db.state_jobs._atomic_write_text"), \
         patch("app.db.state_jobs.prune_completed_jobs"):

        state = {"jobs": {job_id: initial_job.__dict__.copy()}}
        mock_load.return_value = state

        initial_end_at = state["jobs"][job_id]["estimated_end_at"]

        # 1. Update with a heartbeat progress
        # progress=0.35, but reason_code="heartbeat"
        update_job(job_id, progress=0.35, reason_code="heartbeat")

        # estimated_end_at should remain UNCHANGED
        assert state["jobs"][job_id]["estimated_end_at"] == initial_end_at
        assert state["jobs"][job_id]["progress"] == 0.35

        # 2. Update with a NORMAL progress update
        # progress=0.4, reason_code=None
        # This SHOULD trigger a projection and update estimated_end_at
        # elapsed = now - started_at. Let's say now is start_time + 12.
        with patch("time.time", return_value=start_time + 12):
             update_job(job_id, progress=0.4)

        # New remaining = 12 * (1 - 0.4) / 0.4 = 18
        # New end_at = (start_time + 12) + 18 = start_time + 30
        assert state["jobs"][job_id]["estimated_end_at"] == start_time + 30
        assert state["jobs"][job_id]["progress"] == 0.4


def test_post_synthesis_milestones_do_not_reproject_eta():
    """Post-render app milestones should not recompute render ETA from scaled progress."""
    job_id = "post_synthesis_eta_job"
    start_time = time.time() - 20
    initial_end_at = start_time + 30
    initial_job = Job(
        id=job_id,
        engine="sample_build",
        status="running",
        progress=0.7,
        started_at=start_time,
        created_at=start_time,
        updated_at=start_time,
        eta_seconds=1,
        eta_basis="remaining_from_update",
        estimated_end_at=initial_end_at,
    )

    with patch("app.db.state_jobs._load_state_no_lock") as mock_load, \
         patch("app.db.state_jobs._atomic_write_text"), \
         patch("app.db.state_jobs.prune_completed_jobs"):
        state = {"jobs": {job_id: initial_job.__dict__.copy()}}
        mock_load.return_value = state

        with patch("time.time", return_value=start_time + 21):
            update_job(
                job_id,
                status="running",
                progress=0.7,
                message="Synthesis finished.",
                reason_code="synthesis_finished",
            )

        assert state["jobs"][job_id]["estimated_end_at"] == initial_end_at
        assert state["jobs"][job_id]["eta_seconds"] == 1


def test_expected_duration_uses_plugin_computer_speed_multiplier(tmp_path, monkeypatch):
    from app.orchestration.tasks.base import StudioTask
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-a"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"computer_speed_multiplier": 2.0})

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {"engine_cps": {}, "render_history": []},
    )

    duration = StudioTask().get_expected_duration("x" * 1670, "engine-a")

    assert duration == 53.0


def test_expected_duration_filters_history_by_plugin_model(tmp_path, monkeypatch):
    from app.orchestration.tasks.base import StudioTask
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-a"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"model": "fast-model"})

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {
            "engine_cps": {},
            "render_history": [
                {
                    "engine": "engine-a",
                    "tts_model": "slow-model",
                    "cps": 1.0,
                    "seconds_per_segment": 1.0,
                },
                {
                    "engine": "engine-a",
                    "tts_model": "fast-model",
                    "cps": 100.0,
                    "seconds_per_segment": 1.0,
                },
            ],
        },
    )

    duration = StudioTask().get_expected_duration("x" * 1670, "engine-a")

    assert duration == 16.0
