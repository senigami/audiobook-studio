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


# Removed legacy test_expected_duration_uses_plugin_computer_speed_multiplier


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

    assert duration == 17.0


def test_expected_duration_uses_calibrated_overhead_and_cps(tmp_path, monkeypatch):
    from app.orchestration.tasks.base import StudioTask
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-d"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"model": "custom-model"})

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {
            "render_history": [
                {
                    "engine": "engine-d",
                    "tts_model": "custom-model",
                    "cps": 50.0,
                    "inter_group_overhead_seconds": 10.0,
                }
            ]
        }
    )

    # Chars = 1000, CPS = 50.0 -> Synthesis = 20.0s
    # group_count = 1 -> overhead is (1 - 1) * 10 = 0.0s
    # Expected duration = 20.0s
    duration = StudioTask().get_expected_duration("x" * 1000, "engine-d")
    assert duration == 20.0



def test_startup_chapter_eta_overhead_subtraction():
    from app.orchestration.scheduler.eta import calculate_chapter_startup_eta
    # Chars = 1000, CPS = 20.0 (synthesis = 50s)
    # N = 3 groups, overhead = 5s
    # Startup ETA = 50 + (3 - 1) * 5 = 60s
    eta = calculate_chapter_startup_eta(chars=1000, cps=20.0, group_count=3, inter_group_overhead=5.0)
    assert eta == 60

    # N = 1 group, overhead = 5s
    # Startup ETA = 50 + 0 = 50s
    eta = calculate_chapter_startup_eta(chars=1000, cps=20.0, group_count=1, inter_group_overhead=5.0)
    assert eta == 50

    # N = 0 group, overhead = 5s
    # Startup ETA = 50 + 0 = 50s
    eta = calculate_chapter_startup_eta(chars=1000, cps=20.0, group_count=0, inter_group_overhead=5.0)
    assert eta == 50


def test_segment_eta_excludes_overhead():
    from app.orchestration.scheduler.eta import calculate_segment_eta
    # Chars = 200, CPS = 10.0 (ETA = 20s, no overhead added)
    eta = calculate_segment_eta(chars=200, cps=10.0)
    assert eta == 20


def test_live_chapter_remaining_eta_no_double_counting():
    from app.orchestration.scheduler.eta import calculate_chapter_remaining_eta
    # active_group_remaining = 100, remaining = 400, CPS = 20.0 (synthesis = 25s)
    # groups_remaining = 2 (unstarted), overhead = 4.0s
    # Remaining ETA = 25 + 2 * 4.0 = 33s
    eta = calculate_chapter_remaining_eta(
        active_group_remaining_chars=100,
        remaining_chars=400,
        cps=20.0,
        groups_remaining=2,
        inter_group_overhead=4.0
    )
    assert eta == 33


def test_uncalibrated_model_suppresses_eta(tmp_path, monkeypatch):
    from app.orchestration.tasks.base import StudioTask
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-c"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"model": "uncalibrated-model"})

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)
    # get_performance_metrics returns empty history
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {"engine_cps": {}, "render_history": []},
    )

    duration = StudioTask().get_expected_duration("x" * 1000, "engine-c")
    # Returns None or triggers suppression (returns None/0 or float representation to signal uncalibrated)
    assert duration is None


def test_eta_behavior_unchanged_by_speed_multiplier_setting(tmp_path, monkeypatch):
    from app.orchestration.tasks.base import StudioTask
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-speed-test"
    plugin_dir.mkdir(parents=True)

    # Save settings including computer_speed_multiplier = 5.0
    save_settings(plugin_dir, {
        "model": "model-x",
        "computer_speed_multiplier": 5.0
    })

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)

    # Provide 1 baseline calibration sample
    now = time.time()
    mock_history = [
        {
            "id": 1,
            "engine": "engine-speed-test",
            "tts_model": "model-x",
            "chars": 1000,
            "segment_count": 1,
            "duration_seconds": 20.0,
            "synthesis_duration_seconds": 20.0,
            "inter_group_overhead_seconds": 0.0,
            "cps": 50.0,
            "completed_at": now
        }
    ]
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {"engine_cps": {}, "render_history": mock_history},
    )

    # Chars = 1000. Under robust mean, CPS is 50.0. Overhead is 0.0.
    # Expected synthesis time = 1000 / 50.0 = 20.0s.
    # If computer_speed_multiplier was coupled, the estimate might be divided by 5.0 (resulting in 4.0s).
    # We assert it remains 20.0s, unaffected by the setting.
    duration = StudioTask().get_expected_duration("x" * 1000, "engine-speed-test")
    assert duration == 20.0


def test_get_expected_duration_uses_real_group_count(tmp_path, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-multi-group"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"model": "model-y"})

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)

    now = time.time()
    mock_history = [
        {
            "id": 1,
            "engine": "engine-multi-group",
            "tts_model": "model-y",
            "chars": 1000,
            "segment_count": 3,
            "duration_seconds": 30.0,
            "synthesis_duration_seconds": 20.0,
            "inter_group_overhead_seconds": 5.0,
            "cps": 50.0,
            "completed_at": now
        }
    ]
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {"engine_cps": {}, "render_history": mock_history},
    )

    # Mock chunk groups and segments
    mock_segments = [
        {"id": "seg1", "text_content": "hello", "character_id": 1, "speaker_profile_name": "A"},
        {"id": "seg2", "text_content": "world", "character_id": 2, "speaker_profile_name": "B"},
        {"id": "seg3", "text_content": "there", "character_id": 3, "speaker_profile_name": "C"},
    ]

    # Using patch to mock domain chunk functions
    with patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="engine-multi-group"):

        # Scenario A: Full chapter (no segment_ids) -> 3 groups
        # Chars = 1500, CPS = 50.0 -> Synthesis = 30.0s
        # group_count = 3 -> Overhead = (3 - 1) * 5.0 = 10.0s
        # Total expected = 40.0s
        task = SynthesisTask(
            task_id="task-1",
            engine_id="engine-multi-group",
            script_text="x" * 1500,
            output_path="/tmp/out.wav",
            chapter_id="chap-1",
            voice_profile_id="Default"
        )
        duration = task.get_expected_duration("x" * 1500, "engine-multi-group")
        assert duration == 40.0

        # Scenario B: Specific segment batch -> segment_ids = ["seg1", "seg3"] -> 2 groups
        # Chars = 1000, CPS = 50.0 -> Synthesis = 20.0s
        # group_count = 2 -> Overhead = (2 - 1) * 5.0 = 5.0s
        # Total expected = 25.0s
        task_scoped = SynthesisTask(
            task_id="task-2",
            engine_id="engine-multi-group",
            script_text="x" * 1000,
            output_path="/tmp/out.wav",
            chapter_id="chap-1",
            voice_profile_id="Default",
            segment_ids=["seg1", "seg3"]
        )
        duration_scoped = task_scoped.get_expected_duration("x" * 1000, "engine-multi-group")
        assert duration_scoped == 25.0


def test_get_expected_duration_prefers_self_script(tmp_path, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-multi-group"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"model": "model-y"})

    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)

    now = time.time()
    mock_history = [
        {
            "id": 1,
            "engine": "engine-multi-group",
            "tts_model": "model-y",
            "chars": 1000,
            "segment_count": 3,
            "duration_seconds": 30.0,
            "synthesis_duration_seconds": 20.0,
            "inter_group_overhead_seconds": 5.0,
            "cps": 50.0,
            "completed_at": now
        }
    ]
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {"engine_cps": {}, "render_history": mock_history},
    )

    # If task has a script with 2 entries -> group_count = 2
    # Chars = 1000, CPS = 50.0 -> Synthesis = 20.0s
    # group_count = 2 -> Overhead = (2 - 1) * 5.0 = 5.0s
    # Total expected = 25.0s
    task = SynthesisTask(
        task_id="task-3",
        engine_id="engine-multi-group",
        script_text="x" * 1000,
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[
            {"id": "g1", "text": "hello"},
            {"id": "g2", "text": "world"}
        ]
    )
    duration = task.get_expected_duration("x" * 1000, "engine-multi-group")
    assert duration == 25.0
