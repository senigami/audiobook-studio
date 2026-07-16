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

    with patch("app.db.state_jobs._load_state_for_update_no_lock") as mock_load, \
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

    with patch("app.db.state_jobs._load_state_for_update_no_lock") as mock_load, \
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
    """Without calibration history, get_expected_duration returns None (honest contract)."""
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
    # New honest contract: no calibration → None, not a fabricated baseline estimate.
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


def test_get_expected_duration_empty_history_cps_only_fallback(tmp_path, monkeypatch):
    """Empty render history → get_expected_duration returns None (no fabricated baseline)."""
    from app.orchestration.tasks.base import StudioTask

    # Mock performance metrics to return empty history
    monkeypatch.setattr(
        "app.db.state.get_performance_metrics",
        lambda: {"engine_cps": {}, "render_history": []},
    )

    duration = StudioTask().get_expected_duration("x" * 1000, "engine-cps-fallback")

    # New honest contract: no calibration → None, not chars / DEFAULT_BASELINE_ENGINE_CPS.
    assert duration is None


def test_active_segment_eta_empty_history_cps_only_fallback(monkeypatch):
    """No calibration and no observed throughput → _estimate_active_segment_eta_seconds returns None."""
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin

    # Call with expected_duration=None, calibrated_cps=None, started_at=None
    # (no ring samples either) — all fabrication paths disabled.
    eta = OrchestratorHelpersMixin._estimate_active_segment_eta_seconds(
        expected_duration=None,
        total_weight=1000,
        active_weight=200,
        active_progress=0.0,
        started_at=None,
        calibrated_cps=None,
    )

    # New honest contract: no calibration, no observed throughput → None.
    assert eta is None


def test_plugin_log_contract_timing_markers(monkeypatch):
    from app.engines.behavior import get_timing_markers, match_timing_marker

    # Mock the full manifest for custom-engine
    mock_manifest = {
        "behavior": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Booting custom engine server...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Synthesized custom chapter successfully"
            }
        }
    }

    # Force reload or clear lru_cache since lru_cache might cache it
    from app.engines.behavior import _load_full_manifest
    _load_full_manifest.cache_clear()

    monkeypatch.setattr("app.engines.behavior._load_full_manifest", lambda engine_id: mock_manifest if engine_id == "custom-engine" else {})

    # 1. Verify get_timing_markers resolves the custom and fallback markers
    markers = get_timing_markers("custom-engine")
    assert markers["ENGINE_ACTIVITY_STARTED"] == ["Booting custom engine server..."]
    assert markers["START_SYNTHESIS"] == ["[START_SYNTHESIS]"]
    assert markers["CHAPTER_SYNTHESIS_COMPLETE"] == ["Synthesized custom chapter successfully"]

    # 2. Verify match_timing_marker works on engine-specific logs
    assert match_timing_marker("custom-engine", "Booting custom engine server...") == "ENGINE_ACTIVITY_STARTED"
    assert match_timing_marker("custom-engine", "[START_SYNTHESIS] for job") == "START_SYNTHESIS"
    assert match_timing_marker("custom-engine", "Synthesized custom chapter successfully") == "CHAPTER_SYNTHESIS_COMPLETE"
    assert match_timing_marker("custom-engine", "random unrelated line") is None


def test_orchestrator_log_listener_captures_timing_model_metrics(clean_db, tmp_path, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext
    from app.db.state import Job

    # Prepare job
    job_id = "test-timing-markers-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1"
    )

    # Completely isolated local state database mock
    jobs_db = {}

    def mock_put_job(job):
        jobs_db[job.id] = job

    def mock_get_jobs():
        return jobs_db

    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state_jobs.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state_jobs.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)
    monkeypatch.setattr("app.db.state_jobs.update_job", mock_update_job)

    # Mock _publish to record state updates during log listening using our isolated state
    def mock_publish(self, context, started_at=None, **kwargs):
        updates = {}
        if started_at is not None:
            updates["started_at"] = started_at
        for k in ["status", "progress", "active_segment_id"]:
            if k in kwargs:
                updates[k] = kwargs[k]
        if updates:
            mock_put_job(Job(**{**jobs_db[context.task_id].__dict__, **updates}))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    # Mock _estimate_task_duration
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 10.0)

    # Mock chunk groups and segments
    mock_segments = [
        {"id": "seg-1", "text_content": "Hello world", "character_id": 1, "speaker_profile_name": "Narrator"}
    ]

    # Override timing manifest loading
    mock_manifest = {
        "behavior": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Booting custom engine server...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized 1 audio chunks."
            }
        }
    }
    from app.engines.behavior import normalize_behavior
    monkeypatch.setattr("app.engines.behavior.behavior_for_engine", lambda engine_id, **kwargs: normalize_behavior(mock_manifest["behavior"]))

    # Capture the log_listener closure function by mocking register_log_listener
    listener_cb = [None]
    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb
        def unregister_log_listener(self, cb):
            pass

    # Initialize job in DB state
    mock_put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=time.time()
    ))

    # Instantiate Mixin class and start dispatch shim to hook log_listener
    mixin = OrchestratorHelpersMixin()

    # We patch dispatch helper calls
    from unittest.mock import patch
    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[{"id": "seg-1", "leader_segment_id": "seg-1", "segments": mock_segments, "text_content": "Hello world"}]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):

        mock_reg.return_value.get_handler.return_value = lambda *args, **kwargs: None
        mixin._dispatch(task=task, context=context)

    # Ensure log_listener was registered
    assert listener_cb[0] is not None
    listener = listener_cb[0]

    # Send log line 1: ENGINE_ACTIVITY_STARTED
    t_start = time.time()
    with patch("time.time", return_value=t_start):
        listener("Booting custom engine server...")

    job = mock_get_jobs().get(job_id)
    assert job.engine_activity_started_at == t_start

    # Send log line 2: START_SYNTHESIS
    t_synth = t_start + 1.0
    with patch("time.time", return_value=t_synth):
        listener("[START_SYNTHESIS]")

    job = mock_get_jobs().get(job_id)
    assert job.started_at == t_synth

    # Send log line 3: START_SEGMENT
    t_seg = t_start + 3.0
    with patch("time.time", return_value=t_seg):
        listener("[START_SEGMENT] seg-1")

    job = mock_get_jobs().get(job_id)
    assert job.first_start_segment_at == t_seg
    # model_load_seconds should be t_seg - t_start = 3.0
    assert job.model_load_seconds == 3.0

    # Send log line 4: SEGMENT_SAVED
    t_saved = t_start + 8.0
    with patch("time.time", return_value=t_saved):
        listener("[SEGMENT_SAVED] /tmp/seg-1.wav")

    job = mock_get_jobs().get(job_id)
    # segment render time is 8.0 - 3.0 = 5.0s
    assert job.sum_segment_render_seconds == 5.0

    # Send log line 5: CHAPTER_SYNTHESIS_COMPLETE
    t_complete = t_start + 10.0
    with patch("time.time", return_value=t_complete):
        listener("Successfully synthesized 1 audio chunks.")

    job = mock_get_jobs().get(job_id)
    assert job.chapter_render_completed_at == t_complete

    # chapter_wall_duration = 10.0s (t_complete - t_start)
    assert job.chapter_wall_duration == 10.0
    # chapter_post_start_window = 7.0s (t_complete - t_seg)
    assert job.chapter_post_start_window == 7.0
    # inter_group_overhead_seconds = post_start_window - sum_segment_render_seconds = 7.0 - 5.0 = 2.0s
    assert job.inter_group_overhead_seconds == 2.0


def test_orchestrator_records_render_sample_marker_timing(clean_db, tmp_path, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext
    from app.db.state import put_job, Job
    from app.db.performance import get_render_history
    from app.engines.behavior import normalize_behavior

    # Prepare job
    job_id = "test-timing-markers-completion-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={
            "engine_id": "xtts",
            "script_text": "Hello world",
            "voice_profile_id": "Default",
        }
    )

    # Track updates to job
    jobs_db = {}
    def mock_put_job(job):
        jobs_db[job.id] = job
    def mock_get_jobs():
        return jobs_db
    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    def mock_publish(self, context, status=None, progress=None, eta_seconds=None, started_at=None, **kwargs):
        updates = {}
        if status is not None:
            updates["status"] = status
        if progress is not None:
            updates["progress"] = progress
        if eta_seconds is not None:
            updates["eta_seconds"] = eta_seconds
        if started_at is not None:
            updates["started_at"] = started_at

        job_fields = Job.__dataclass_fields__
        for k, v in kwargs.items():
            if k in job_fields:
                updates[k] = v
        if updates:
            mock_put_job(Job(**{**jobs_db[context.task_id].__dict__, **updates}))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 10.0)

    mock_segments = [
        {"id": "seg-1", "text_content": "Hello world", "character_id": 1, "speaker_profile_name": "Narrator"}
    ]

    mock_manifest = {
        "behavior": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Booting custom engine server...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized 1 audio chunks."
            }
        }
    }
    monkeypatch.setattr("app.engines.behavior.behavior_for_engine", lambda engine_id, **kwargs: normalize_behavior(mock_manifest["behavior"]))

    listener_cb = [None]
    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb
        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=time.time()
    ))

    mixin = OrchestratorHelpersMixin()

    from unittest.mock import patch
    from app.orchestration.tasks.base import TaskResult

    # Set up the mock handler to process logs and return completion
    def custom_handler(*args, **kwargs):
        listener = listener_cb[0]
        assert listener is not None
        # 1. ENGINE_ACTIVITY_STARTED at t=100.0
        with patch("time.time", return_value=100.0):
            listener("Booting custom engine server...")
        # 2. START_SYNTHESIS at t=105.0
        with patch("time.time", return_value=105.0):
            listener("[START_SYNTHESIS]")
        # 3. START_SEGMENT at t=110.0
        with patch("time.time", return_value=110.0):
            listener("[START_SEGMENT] seg-1")
        # 4. SEGMENT_SAVED at t=120.0
        with patch("time.time", return_value=120.0):
            listener("[SEGMENT_SAVED] /tmp/seg-1.wav")
        # 5. CHAPTER_SYNTHESIS_COMPLETE at t=125.0
        with patch("time.time", return_value=125.0):
            listener("Successfully synthesized 1 audio chunks.")
        return TaskResult(status="completed")

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[{"id": "seg-1", "leader_segment_id": "seg-1", "segments": mock_segments, "text_content": "Hello world"}]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("time.time", return_value=125.0):

        mock_reg.return_value.get_handler.return_value = custom_handler
        mixin._dispatch(task=task, context=context)

    # Now verify the recorded sample in DB history
    history = get_render_history()
    assert len(history) == 1
    sample = history[0]

    assert sample["started_at"] == 100.0
    assert sample["completed_at"] == 125.0
    assert sample["duration_seconds"] == 25.0
    assert sample["model_load_seconds"] == 10.0
    assert sample["sum_segment_render_seconds"] == 10.0
    # inter_group_overhead_seconds = post_start_window - sum_segment_render_seconds = (125-110) - 10 = 5.0
    assert sample["inter_group_overhead_seconds"] == 5.0


def test_reuse_render_skips_performance_sample_and_does_not_raise(clean_db, tmp_path, monkeypatch):
    """A reuse render (cached segments re-stitched by ffmpeg — synthesis confirmed
    started but no SEGMENT markers / no CHAPTER_SYNTHESIS_COMPLETE, so no synthesis
    duration) must NOT call record_render_sample (which mandates a positive
    synthesis duration) — it would raise the 'Failed to record render performance
    sample' traceback and corrupt CPS calibration. The sample is skipped; produced
    metadata is still finalized.

    R1: before the fix, record_render_sample IS called (with synthesis_duration
    None) and raises; after the fix it is not called.
    """
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext, TaskResult
    from app.db.state import Job
    from app.db.performance import get_render_history
    from app.engines.behavior import normalize_behavior

    job_id = "test-reuse-no-synth-job"
    task = SynthesisTask(
        task_id=job_id, engine_id="xtts", script_text="Hello world",
        output_path="/tmp/out.wav", chapter_id="chap-1", voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}],
    )
    context = TaskContext(
        task_id=job_id, task_type="synthesis", project_id="proj-1", chapter_id="chap-1",
        payload={"engine_id": "xtts", "script_text": "Hello world", "voice_profile_id": "Default"},
    )

    jobs_db = {}
    monkeypatch.setattr("app.db.state.put_job", lambda job: jobs_db.__setitem__(job.id, job))
    monkeypatch.setattr("app.db.state.get_jobs", lambda: jobs_db)

    def mock_update_job(jid, **kwargs):
        job = jobs_db.get(jid)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    def mock_publish(self, context, status=None, progress=None, eta_seconds=None, started_at=None, **kwargs):
        updates = {}
        if status is not None:
            updates["status"] = status
        if started_at is not None:
            updates["started_at"] = started_at
        job_fields = Job.__dataclass_fields__
        for k, v in kwargs.items():
            if k in job_fields:
                updates[k] = v
        if updates and context.task_id in jobs_db:
            jobs_db[context.task_id] = Job(**{**jobs_db[context.task_id].__dict__, **updates})

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *a, **k: 10.0)
    monkeypatch.setattr(
        "app.engines.behavior.behavior_for_engine",
        lambda engine_id, **kwargs: normalize_behavior({"behavior": {"timing_markers": {}}}["behavior"]),
    )

    listener_cb = [None]
    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb
        def unregister_log_listener(self, cb):
            pass

    jobs_db[job_id] = Job(id=job_id, engine="xtts", status="running", created_at=time.time())
    mixin = OrchestratorHelpersMixin()

    record_sample_mock = MagicMock()

    def reuse_handler(*args, **kwargs):
        listener = listener_cb[0]
        assert listener is not None
        # Synthesis confirmed started (render_started_at set), but NO segment markers
        # and NO CHAPTER_SYNTHESIS_COMPLETE — i.e. a reuse/stitch-only render.
        with patch("time.time", return_value=105.0):
            listener("[START_SYNTHESIS]")
        return TaskResult(status="completed")

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.db.performance.record_render_sample", record_sample_mock), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=[]), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("time.time", return_value=125.0):
        mock_reg.return_value.get_handler.return_value = reuse_handler
        mixin._dispatch(task=task, context=context)

    record_sample_mock.assert_not_called()
    assert len(get_render_history()) == 0
    # Produced metadata is still finalized on the completed (reused) chapter.
    assert getattr(jobs_db[job_id], "produced_chars", None) == len("Hello world")


# ---------------------------------------------------------------------------
# Engine-confirmed segment clock tests (mixed-render START_SEGMENT timing fix)
# ---------------------------------------------------------------------------

def _make_listener_harness(monkeypatch, job_id, seg_id, save_path):
    """Minimal harness: returns (listener_cb, jobs_db, published_events).
    Caller calls listener_cb[0](line) to drive the log_listener closure.
    """
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext
    from app.db.state import Job
    from app.engines.behavior import normalize_behavior

    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": [seg_id], "save_path": save_path, "text": "Hello world"}],
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={"engine_id": "xtts"},
    )

    jobs_db = {}

    def mock_put_job(job):
        jobs_db[job.id] = job

    def mock_get_jobs():
        return jobs_db

    def mock_update_job(jid, **kwargs):
        job = jobs_db.get(jid)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    published_events = []

    def mock_publish(self, context, **kwargs):
        published_events.append(dict(kwargs))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *a, **kw: 30.0)

    monkeypatch.setattr(
        "app.engines.behavior.behavior_for_engine",
        lambda engine_id, **kw: normalize_behavior({}),
    )

    listener_cb = [None]

    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb
        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(id=job_id, engine="xtts", status="running", created_at=0.0))

    mock_segments = [
        {"id": seg_id, "text_content": "Hello world", "character_id": 1, "speaker_profile_name": "Narrator"}
    ]

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[{
             "id": seg_id, "leader_segment_id": seg_id,
             "segments": mock_segments, "text_content": "Hello world",
         }]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):
        mock_reg.return_value.get_handler.return_value = lambda *a, **kw: None
        mixin = OrchestratorHelpersMixin()
        mixin._dispatch(task=task, context=context)

    return listener_cb, jobs_db, published_events


def _make_listener_harness_with_engines(
    monkeypatch,
    *,
    job_id,
    job_engine_id,
    seg_id,
    save_path,
    script_entry_engine,
    engine_behaviors=None,
):
    """Variant harness that lets tests control the job engine and active-group engine."""
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext
    from app.db.state import Job
    from app.engines import behavior as _behavior_mod

    # Manifest behavior is memoized via LRU caches; clear them so the per-test
    # behavior_for_engine patch below is not shadowed by a previous test's
    # cached real-manifest read (otherwise marker resolution is order-dependent).
    _behavior_mod._load_full_manifest.cache_clear()
    _behavior_mod._load_manifest_behavior.cache_clear()

    script_entry = {"ids": [seg_id], "save_path": save_path, "text": "Hello world"}
    if script_entry_engine is not None:
        script_entry["engine"] = script_entry_engine

    task = SynthesisTask(
        task_id=job_id,
        engine_id=job_engine_id,
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[script_entry],
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={"engine_id": job_engine_id},
    )

    jobs_db = {}

    def mock_put_job(job):
        jobs_db[job.id] = job

    def mock_get_jobs():
        return jobs_db

    def mock_update_job(jid, **kwargs):
        job = jobs_db.get(jid)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    published_events = []

    def mock_publish(self, context, **kwargs):
        published_events.append(dict(kwargs))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *a, **kw: 30.0)
    if engine_behaviors is not None:
        from app.engines.behavior import normalize_behavior

        monkeypatch.setattr(
            "app.engines.behavior.behavior_for_engine",
            lambda engine_id, **kw: normalize_behavior(engine_behaviors.get(engine_id, {})),
        )

    listener_cb = [None]

    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb

        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(id=job_id, engine=job_engine_id, status="running", created_at=0.0))

    mock_segments = [
        {"id": seg_id, "text_content": "Hello world", "character_id": 1, "speaker_profile_name": "Narrator"}
    ]

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[{
             "id": seg_id,
             "leader_segment_id": seg_id,
             "segments": mock_segments,
             "text_content": "Hello world",
         }]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value=job_engine_id):
        mock_reg.return_value.get_handler.return_value = lambda *a, **kw: None
        mixin = OrchestratorHelpersMixin()
        mixin._dispatch(task=task, context=context)

    return listener_cb, jobs_db, published_events


def _make_listener_harness_for_groups(
    monkeypatch,
    *,
    job_id,
    job_engine_id,
    groups,
    engine_behaviors=None,
):
    """Harness for multi-group mixed renders with per-group declared engines."""
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext
    from app.db.state import Job
    from app.engines import behavior as _behavior_mod

    # See note in _make_listener_harness_with_engines: clear memoized manifest
    # behavior so the behavior_for_engine patch is order-independent.
    _behavior_mod._load_full_manifest.cache_clear()
    _behavior_mod._load_manifest_behavior.cache_clear()

    script = []
    mock_segments = []
    chunk_groups = []
    for group in groups:
        seg_id = group["seg_id"]
        save_path = group["save_path"]
        text = group.get("text", f"Text for {seg_id}")
        script_entry = {
            "ids": [seg_id],
            "save_path": save_path,
            "text": text,
            "engine": group["engine"],
        }
        script.append(script_entry)
        segment = {
            "id": seg_id,
            "text_content": text,
            "character_id": len(mock_segments) + 1,
            "speaker_profile_name": group.get("speaker_profile_name", "Narrator"),
        }
        mock_segments.append(segment)
        chunk_groups.append({
            "id": seg_id,
            "leader_segment_id": seg_id,
            "segments": [segment],
            "text_content": text,
        })

    task = SynthesisTask(
        task_id=job_id,
        engine_id=job_engine_id,
        script_text=" ".join(group.get("text", "") for group in groups) or "Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=script,
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={"engine_id": job_engine_id},
    )

    jobs_db = {}

    def mock_put_job(job):
        jobs_db[job.id] = job

    def mock_get_jobs():
        return jobs_db

    def mock_update_job(jid, **kwargs):
        job = jobs_db.get(jid)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    published_events = []

    def mock_publish(self, context, **kwargs):
        published_events.append(dict(kwargs))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *a, **kw: 30.0)
    if engine_behaviors is not None:
        from app.engines.behavior import normalize_behavior

        monkeypatch.setattr(
            "app.engines.behavior.behavior_for_engine",
            lambda engine_id, **kw: normalize_behavior(engine_behaviors.get(engine_id, {})),
        )

    listener_cb = [None]

    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb

        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(id=job_id, engine=job_engine_id, status="running", created_at=0.0))

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=chunk_groups), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value=job_engine_id):
        mock_reg.return_value.get_handler.return_value = lambda *a, **kw: None
        mixin = OrchestratorHelpersMixin()
        mixin._dispatch(task=task, context=context)

    return listener_cb, jobs_db, published_events


def test_mixed_log_listener_resolves_timing_markers_from_active_group_engine(clean_db, tmp_path, monkeypatch):
    job_id = "mixed-active-engine-marker"
    seg_id = "seg-mixed-1"
    save_path = "/tmp/seg-mixed-1.wav"
    listener_cb, jobs_db, _published_events = _make_listener_harness_with_engines(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        seg_id=seg_id,
        save_path=save_path,
        script_entry_engine="xtts",
        engine_behaviors={
            "mixed": {},
            "xtts": {"timing_markers": {"ENGINE_ACTIVITY_STARTED": "Loading XTTS model..."}},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=100.0):
        listener(f"[START_SEGMENT] {seg_id}")
    with patch("time.time", return_value=101.0):
        listener("Loading XTTS model...")

    assert jobs_db[job_id].engine_activity_started_at == pytest.approx(101.0)


def test_mixed_log_listener_falls_back_to_job_engine_markers_when_active_engine_has_no_match(
    clean_db, tmp_path, monkeypatch
):
    from app.engines.behavior import match_timing_marker, _load_full_manifest, _load_manifest_behavior

    _load_full_manifest.cache_clear()
    _load_manifest_behavior.cache_clear()

    assert match_timing_marker("xtts", "[ENGINE_ACTIVITY_STARTED] seg-1") is None
    assert match_timing_marker("mixed", "[ENGINE_ACTIVITY_STARTED] seg-1") == "ENGINE_ACTIVITY_STARTED"

    job_id = "mixed-job-engine-fallback-marker"
    seg_id = "seg-mixed-fallback-1"
    save_path = "/tmp/seg-mixed-fallback-1.wav"
    listener_cb, jobs_db, _published_events = _make_listener_harness_with_engines(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        seg_id=seg_id,
        save_path=save_path,
        script_entry_engine="xtts",
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=100.0):
        listener(f"[START_SEGMENT] {seg_id}")
    with patch("time.time", return_value=101.0):
        listener("[ENGINE_ACTIVITY_STARTED] seg-1")
    with patch("time.time", return_value=104.0):
        listener("[START_SYNTHESIS] seg-1")

    assert jobs_db[job_id].engine_activity_started_at == pytest.approx(101.0)
    assert jobs_db[job_id].model_load_seconds == pytest.approx(3.0)


def test_log_listener_falls_back_to_job_engine_when_no_active_group_engine(clean_db, tmp_path, monkeypatch):
    job_id = "job-engine-fallback-marker"
    seg_id = "seg-fallback-1"
    save_path = "/tmp/seg-fallback-1.wav"
    listener_cb, jobs_db, _published_events = _make_listener_harness_with_engines(
        monkeypatch,
        job_id=job_id,
        job_engine_id="xtts",
        seg_id=seg_id,
        save_path=save_path,
        script_entry_engine=None,
        engine_behaviors={
            "xtts": {"timing_markers": {"ENGINE_ACTIVITY_STARTED": "Loading XTTS model..."}},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=200.0):
        listener("Loading XTTS model...")

    assert jobs_db[job_id].engine_activity_started_at == pytest.approx(200.0)


def test_mixed_log_listener_uses_job_engine_before_any_group_is_active(clean_db, tmp_path, monkeypatch):
    job_id = "mixed-no-active-group-fallback"
    seg_id = "seg-mixed-pending"
    save_path = "/tmp/seg-mixed-pending.wav"
    listener_cb, jobs_db, _published_events = _make_listener_harness_with_engines(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        seg_id=seg_id,
        save_path=save_path,
        script_entry_engine="xtts",
        engine_behaviors={
            "mixed": {},
            "xtts": {"timing_markers": {"ENGINE_ACTIVITY_STARTED": "Loading XTTS model..."}},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=250.0):
        listener("Loading XTTS model...")

    assert jobs_db[job_id].engine_activity_started_at is None


def test_mixed_log_listener_ignores_other_engine_markers_and_progress(clean_db, tmp_path, monkeypatch):
    job_id = "mixed-other-engine-no-match"
    seg_id = "seg-mixed-2"
    save_path = "/tmp/seg-mixed-2.wav"
    listener_cb, jobs_db, published_events = _make_listener_harness_with_engines(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        seg_id=seg_id,
        save_path=save_path,
        script_entry_engine="voxtral",
        engine_behaviors={
            "mixed": {},
            "voxtral": {"progress_pattern": r"voxtral=(?P<value>[0-9.]+)"},
            "xtts": {
                "timing_markers": {"ENGINE_ACTIVITY_STARTED": "Loading XTTS model..."},
                "progress_pattern": r"xtts=(?P<value>[0-9.]+)",
            },
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=300.0):
        listener(f"[START_SEGMENT] {seg_id}")
    events_before = len(published_events)
    with patch("time.time", return_value=301.0):
        listener("Loading XTTS model...")
    with patch("time.time", return_value=302.0):
        listener("xtts=0.5")

    assert jobs_db[job_id].engine_activity_started_at is None
    assert [event.get("reason_code") for event in published_events[events_before:]] == []


def test_engine_activity_marker_after_start_segment_closes_on_start_synthesis_and_does_not_leak(clean_db, monkeypatch):
    job_id = "mixed-load-window-closed-at-confirmation"
    groups = [
        {"seg_id": "seg-1", "save_path": "/tmp/seg-1.wav", "engine": "xtts", "text": "First group text"},
        {"seg_id": "seg-2", "save_path": "/tmp/seg-2.wav", "engine": "xtts", "text": "Second group text"},
    ]
    listener_cb, jobs_db, _published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors={
            "mixed": {},
            "xtts": {"timing_markers": {"ENGINE_ACTIVITY_STARTED": "[ENGINE_ACTIVITY_STARTED]"}},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-1")
    with patch("time.time", return_value=101.0):
        listener("[ENGINE_ACTIVITY_STARTED] seg-1")
    with patch("time.time", return_value=103.0):
        listener("[START_SYNTHESIS] seg-1")

    assert jobs_db[job_id].model_load_seconds == pytest.approx(2.0)

    with patch("time.time", return_value=105.0):
        listener("[SEGMENT_SAVED] /tmp/seg-1.wav")
    with patch("time.time", return_value=130.0):
        listener("[START_SEGMENT] seg-2")

    assert jobs_db[job_id].model_load_seconds == pytest.approx(2.0)


def test_engine_activity_marker_after_start_segment_closes_on_first_progress(clean_db, monkeypatch):
    job_id = "mixed-load-window-closed-at-progress"
    groups = [
        {"seg_id": "seg-1", "save_path": "/tmp/seg-1.wav", "engine": "xtts", "text": "First group text"},
    ]
    listener_cb, jobs_db, _published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors={
            "mixed": {},
            "xtts": {
                "timing_markers": {"ENGINE_ACTIVITY_STARTED": "[ENGINE_ACTIVITY_STARTED]"},
                "progress_pattern": r"xtts=(?P<progress>[0-9.]+)",
            },
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-1")
    with patch("time.time", return_value=101.0):
        listener("[ENGINE_ACTIVITY_STARTED] seg-1")
    with patch("time.time", return_value=104.0):
        listener("xtts=0.5")

    assert jobs_db[job_id].model_load_seconds == pytest.approx(3.0)


def test_engine_activity_before_next_group_announce_closes_on_next_start_segment_after_prior_group_confirmed(
    clean_db, monkeypatch
):
    job_id = "mixed-next-group-load-window-closed-at-announce"
    groups = [
        {"seg_id": "seg-1", "save_path": "/tmp/seg-1.wav", "engine": "xtts", "text": "First group text"},
        {"seg_id": "seg-2", "save_path": "/tmp/seg-2.wav", "engine": "xtts", "text": "Second group text"},
    ]
    listener_cb, jobs_db, _published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors={
            "mixed": {},
            "xtts": {"timing_markers": {"ENGINE_ACTIVITY_STARTED": "[ENGINE_ACTIVITY_STARTED]"}},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-1")
    with patch("time.time", return_value=101.0):
        listener("[START_SYNTHESIS] seg-1")

    assert jobs_db[job_id].model_load_seconds is None

    with patch("time.time", return_value=110.0):
        listener("[ENGINE_ACTIVITY_STARTED] seg-2")
    with patch("time.time", return_value=116.0):
        listener("[START_SEGMENT] seg-2")

    assert jobs_db[job_id].model_load_seconds == pytest.approx(6.0)


def test_progress_parsing_switches_with_active_group_engine(clean_db, monkeypatch):
    job_id = "mixed-progress-active-engine-switch"
    groups = [
        {"seg_id": "seg-1", "save_path": "/tmp/seg-1.wav", "engine": "xtts", "text": "Alpha group"},
        {"seg_id": "seg-2", "save_path": "/tmp/seg-2.wav", "engine": "voxtral", "text": "Beta group"},
    ]
    listener_cb, jobs_db, published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors={
            "mixed": {},
            "xtts": {"progress_pattern": r"xtts=(?P<progress>[0-9.]+)"},
            "voxtral": {"progress_pattern": r"voxtral=(?P<progress>[0-9.]+)"},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=10.0):
        listener("[START_SEGMENT] seg-1")
    events_before_group_1 = len(published_events)
    with patch("time.time", return_value=11.0):
        listener("xtts=0.25")

    group_1_events = published_events[events_before_group_1:]
    group_1_progress = [e for e in group_1_events if e.get("reason_code") == "SEGMENT_PROGRESS"]
    assert len(group_1_progress) == 1
    assert group_1_progress[0]["active_segment_id"] == "seg-1"
    assert group_1_progress[0]["active_segment_progress"] == pytest.approx(0.25)

    with patch("time.time", return_value=12.0):
        listener("[SEGMENT_SAVED] /tmp/seg-1.wav")
    with patch("time.time", return_value=13.0):
        listener("[START_SEGMENT] seg-2")

    events_before_group_2 = len(published_events)
    with patch("time.time", return_value=14.0):
        listener("xtts=0.9")
    with patch("time.time", return_value=15.0):
        listener("voxtral=0.75")

    group_2_events = published_events[events_before_group_2:]
    group_2_progress = [e for e in group_2_events if e.get("reason_code") == "SEGMENT_PROGRESS"]
    assert len(group_2_progress) == 1
    assert group_2_progress[0]["active_segment_id"] == "seg-2"
    assert group_2_progress[0]["active_segment_progress"] == pytest.approx(0.75)
    assert jobs_db[job_id].engine_activity_started_at is None


def test_voxtral_first_group_does_not_mask_subsequent_xtts_model_load(clean_db, monkeypatch):
    """Success-criteria repro order: Voxtral group -> cold XTTS group.

    The mixed handler emits [ENGINE_ACTIVITY_STARTED] before *every* group's
    bridge call. The leading Voxtral group loads no model, so its activity
    window is ~0. A single-shot capture would let that ~0 window latch the job's
    model_load_seconds and MASK the real ~30s XTTS cold-load in the second group
    (defeating Task 001's headline acceptance criterion). Capture must keep the
    real (largest) load window regardless of group order. This feeds the actual
    per-group emission order the handler produces.
    """
    job_id = "mixed-voxtral-first-then-cold-xtts"
    groups = [
        {"seg_id": "seg-vox", "save_path": "/tmp/seg-vox.wav", "engine": "voxtral", "text": "Voxtral group"},
        {"seg_id": "seg-xtts", "save_path": "/tmp/seg-xtts.wav", "engine": "xtts", "text": "XTTS group"},
    ]
    listener_cb, jobs_db, _published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors={
            "mixed": {},
            "voxtral": {},
            "xtts": {"timing_markers": {"ENGINE_ACTIVITY_STARTED": "Loading XTTS model..."}},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    # Group 1 (Voxtral): no model load. Handler emits the bracketed activity
    # marker, then the engine confirms almost immediately.
    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-vox")
    with patch("time.time", return_value=100.5):
        listener("[ENGINE_ACTIVITY_STARTED] seg-vox")
    with patch("time.time", return_value=101.0):
        listener("[START_SYNTHESIS] seg-vox")
    with patch("time.time", return_value=103.0):
        listener("[SEGMENT_SAVED] /tmp/seg-vox.wav")

    # Group 2 (cold XTTS): handler marker, then the engine's own load line,
    # then a ~30s gap before synthesis confirms.
    with patch("time.time", return_value=110.0):
        listener("[START_SEGMENT] seg-xtts")
    with patch("time.time", return_value=110.5):
        listener("[ENGINE_ACTIVITY_STARTED] seg-xtts")
    with patch("time.time", return_value=111.0):
        listener("Loading XTTS model...")
    with patch("time.time", return_value=141.0):
        listener("[START_SYNTHESIS] seg-xtts")

    # The real XTTS load window (141 - 111 = 30s) must win, not the Voxtral ~0.5s.
    assert jobs_db[job_id].model_load_seconds == pytest.approx(30.0)
    assert jobs_db[job_id].engine_activity_started_at == pytest.approx(111.0)


def test_voxtral_only_render_resolves_markers_via_job_engine(clean_db, monkeypatch):
    """Regression guard: a Voxtral-only mixed render is unaffected — its progress
    parses via the active/job engine and no spurious XTTS load window is captured.
    """
    job_id = "mixed-voxtral-only"
    groups = [
        {"seg_id": "seg-1", "save_path": "/tmp/seg-1.wav", "engine": "voxtral", "text": "Only group"},
    ]
    listener_cb, jobs_db, published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors={
            "mixed": {},
            "voxtral": {"progress_pattern": r"voxtral=(?P<progress>[0-9.]+)"},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=10.0):
        listener("[START_SEGMENT] seg-1")
    with patch("time.time", return_value=10.5):
        listener("[ENGINE_ACTIVITY_STARTED] seg-1")
    with patch("time.time", return_value=11.0):
        listener("[START_SYNTHESIS] seg-1")
    events_before = len(published_events)
    with patch("time.time", return_value=12.0):
        listener("voxtral=0.5")

    progress_events = [
        e for e in published_events[events_before:]
        if e.get("reason_code") == "SEGMENT_PROGRESS"
    ]
    assert len(progress_events) == 1
    assert progress_events[0]["active_segment_id"] == "seg-1"
    assert progress_events[0]["active_segment_progress"] == pytest.approx(0.5)
    # No XTTS "Loading..." line ever arrived; the only window is the trivial
    # Voxtral prep, so nothing resembling a real model load is fabricated.
    assert jobs_db[job_id].model_load_seconds == pytest.approx(0.5)


def test_segment_clock_starts_at_start_synthesis_not_start_segment(clean_db, tmp_path, monkeypatch):
    """Bug regression: in mixed renders START_SEGMENT arrives before the engine loads the model.
    The segment render duration recorded in sum_segment_render_seconds must reflect the time from
    START_SYNTHESIS (engine confirmed) to SEGMENT_SAVED, NOT from START_SEGMENT to SEGMENT_SAVED.
    A 19-second model-load gap between START_SEGMENT (t=100) and START_SYNTHESIS (t=119) must NOT
    inflate sum_segment_render_seconds.
    """
    job_id = "mixed-clock-bug-test"
    seg_id = "segA"
    save_path = "/tmp/segA.wav"

    listener_cb, jobs_db, published_events = _make_listener_harness(
        monkeypatch, job_id, seg_id, save_path
    )
    listener = listener_cb[0]
    assert listener is not None

    # t=100: START_SEGMENT arrives BEFORE engine loads (mixed-render pattern)
    with patch("time.time", return_value=100.0):
        listener(f"[START_SEGMENT] {seg_id}")

    # t=119: engine emits START_SYNTHESIS after model load (~19s gap)
    with patch("time.time", return_value=119.0):
        listener("[START_SYNTHESIS] some-task-id")

    # t=121: first PROGRESS line
    with patch("time.time", return_value=121.0):
        listener("progress: 50%")  # won't parse as xtts progress — that's fine

    # t=125: SEGMENT_SAVED
    with patch("time.time", return_value=125.0):
        listener(f"[SEGMENT_SAVED] {save_path}")

    job = jobs_db.get(job_id)
    # Clock should start at START_SYNTHESIS (t=119), so duration = 125 - 119 = 6s
    # Pre-fix: clock starts at START_SEGMENT (t=100), so duration = 125 - 100 = 25s
    assert job.sum_segment_render_seconds == pytest.approx(6.0), (
        f"Expected 6.0 (START_SYNTHESIS clock) but got {job.sum_segment_render_seconds}; "
        "model-load window is leaking into render duration"
    )


def test_segment_clock_plain_order_no_regression(clean_db, tmp_path, monkeypatch):
    """Plain XTTS path: START_SYNTHESIS arrives first, then START_SEGMENT, then SEGMENT_SAVED.
    Duration must count from START_SYNTHESIS (or first-progress confirmation), not include any
    pre-START_SYNTHESIS time, and must not raise exceptions.
    """
    job_id = "plain-order-regression-test"
    seg_id = "segB"
    save_path = "/tmp/segB.wav"

    listener_cb, jobs_db, published_events = _make_listener_harness(
        monkeypatch, job_id, seg_id, save_path
    )
    listener = listener_cb[0]
    assert listener is not None

    # t=100: START_SYNTHESIS (model already loaded — plain XTTS pattern)
    with patch("time.time", return_value=100.0):
        listener("[START_SYNTHESIS] some-task-id")

    # t=102: START_SEGMENT
    with patch("time.time", return_value=102.0):
        listener(f"[START_SEGMENT] {seg_id}")

    # t=112: SEGMENT_SAVED
    with patch("time.time", return_value=112.0):
        listener(f"[SEGMENT_SAVED] {save_path}")

    job = jobs_db.get(job_id)
    # Duration from START_SEGMENT (t=102) to SEGMENT_SAVED (t=112) = 10s
    # (segment_starts set at START_SYNTHESIS confirmation of active segment)
    # Any value <= 12.0 means no time before START_SYNTHESIS leaked in
    assert job.sum_segment_render_seconds is not None
    assert job.sum_segment_render_seconds > 0
    assert job.sum_segment_render_seconds <= 12.0, (
        f"Duration {job.sum_segment_render_seconds} includes pre-START_SYNTHESIS time"
    )
    # And no events raised an exception (published_events list exists without crashing)


def test_segment_clock_no_confirmation_fallback_to_announce_time(clean_db, tmp_path, monkeypatch):
    """Voxtral / fast remote engine path: START_SEGMENT then directly SEGMENT_SAVED with no
    START_SYNTHESIS or PROGRESS lines. Duration must fall back to announce time so
    sum_segment_render_seconds is > 0.
    """
    job_id = "no-confirmation-fallback-test"
    seg_id = "segC"
    save_path = "/tmp/segC.wav"

    listener_cb, jobs_db, published_events = _make_listener_harness(
        monkeypatch, job_id, seg_id, save_path
    )
    listener = listener_cb[0]
    assert listener is not None

    # t=200: START_SEGMENT (only marker before save)
    with patch("time.time", return_value=200.0):
        listener(f"[START_SEGMENT] {seg_id}")

    # t=201: the mixed handler's synthetic activity marker should not suppress the
    # announce fallback for confirmation-less engines.
    with patch("time.time", return_value=201.0):
        listener(f"[ENGINE_ACTIVITY_STARTED] {seg_id}")

    # t=203: SEGMENT_SAVED immediately (no START_SYNTHESIS or PROGRESS)
    with patch("time.time", return_value=203.0):
        listener(f"[SEGMENT_SAVED] {save_path}")

    job = jobs_db.get(job_id)
    # Fallback: announce time t=200, so duration = 203 - 200 = 3.0
    assert job.sum_segment_render_seconds == pytest.approx(3.0), (
        f"Expected 3.0 (fallback to announce time) but got {job.sum_segment_render_seconds}"
    )


def test_segment_clock_load_window_does_not_fall_back_to_announce_time(clean_db, tmp_path, monkeypatch):
    """When an XTTS load window is observed, SEGMENT_SAVED must not use announce time.

    This harness drives the log listener only (the handler is stubbed and markers
    are fed after dispatch returns), so it does NOT exercise the render-sample
    recording path — `sum_segment_render_seconds` is the assertion with teeth here
    (reverting the announce-fallback gate makes it non-zero). The full
    record-path coverage for the load-window scenario lives in
    `test_load_window_unconfirmed_records_no_load_polluted_sample`.
    """
    job_id = "load-window-no-announce-fallback-test"
    listener_cb, jobs_db, _published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=[
            {
                "seg_id": "seg-xtts",
                "save_path": "/tmp/seg-xtts.wav",
                "engine": "xtts",
                "text": "XTTS group",
            }
        ],
        engine_behaviors={
            "mixed": {},
            "xtts": {"timing_markers": {"ENGINE_ACTIVITY_STARTED": "Loading XTTS model..."}},
        },
    )
    listener = listener_cb[0]
    assert listener is not None

    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-xtts")
    with patch("time.time", return_value=101.0):
        listener("Loading XTTS model...")
    with patch("time.time", return_value=104.0):
        listener("[SEGMENT_SAVED] /tmp/seg-xtts.wav")
    with patch("time.time", return_value=110.0):
        listener("Successfully synthesized 1 audio chunks.")

    # An unconfirmed segment behind a load window contributes no synthesis time:
    # the announce fallback is suppressed, so the per-segment render clock stays 0.
    assert jobs_db[job_id].sum_segment_render_seconds == 0.0


def _run_recording_render_with_markers(
    monkeypatch, *, job_id, engine_id, engine_behavior, marker_script, completed_at,
    script_text="Hello world there friends",
):
    """Drive a full single-group render through `_dispatch` so the REAL
    `record_render_sample` path runs (unlike `_make_listener_harness_for_groups`,
    which only drives the log listener). Markers in `marker_script`
    ``[(t, line), ...]`` are fed from inside the stubbed handler, then the handler
    returns ``completed`` so the orchestrator records the sample.

    Returns ``(history, jobs_db)``.
    """
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext, TaskResult
    from app.db.state import Job
    from app.db.performance import get_render_history
    from app.engines.behavior import normalize_behavior, _load_full_manifest, _load_manifest_behavior

    _load_full_manifest.cache_clear()
    _load_manifest_behavior.cache_clear()

    task = SynthesisTask(
        task_id=job_id,
        engine_id=engine_id,
        script_text=script_text,
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": script_text}],
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={"engine_id": engine_id, "script_text": script_text, "voice_profile_id": "Default"},
    )

    jobs_db = {}

    def mock_put_job(job):
        jobs_db[job.id] = job

    def mock_get_jobs():
        return jobs_db

    def mock_update_job(jid, **kwargs):
        job = jobs_db.get(jid)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    def mock_publish(self, context, status=None, progress=None, eta_seconds=None, started_at=None, **kwargs):
        updates = {}
        if status is not None:
            updates["status"] = status
        if started_at is not None:
            updates["started_at"] = started_at
        job_fields = Job.__dataclass_fields__
        for k, v in kwargs.items():
            if k in job_fields:
                updates[k] = v
        if updates and context.task_id in jobs_db:
            mock_put_job(Job(**{**jobs_db[context.task_id].__dict__, **updates}))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *a, **kw: 10.0)
    monkeypatch.setattr(
        "app.engines.behavior.behavior_for_engine",
        lambda eid, **kw: normalize_behavior(engine_behavior if eid == engine_id else {}),
    )

    mock_segments = [
        {"id": "seg-1", "text_content": script_text, "character_id": 1, "speaker_profile_name": "Narrator"}
    ]
    chunk_groups = [
        {"id": "seg-1", "leader_segment_id": "seg-1", "segments": mock_segments, "text_content": script_text}
    ]

    listener_cb = [None]

    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb

        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(id=job_id, engine=engine_id, status="running", created_at=0.0))

    def custom_handler(*args, **kwargs):
        listener = listener_cb[0]
        assert listener is not None
        for t, line in marker_script:
            with patch("time.time", return_value=t):
                listener(line)
        return TaskResult(status="completed")

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=chunk_groups), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value=engine_id), \
         patch("time.time", return_value=completed_at):
        mock_reg.return_value.get_handler.return_value = custom_handler
        mixin = OrchestratorHelpersMixin()
        mixin._dispatch(task=task, context=context)

    return get_render_history(), jobs_db


def test_load_window_excluded_from_recorded_synthesis_duration(clean_db, tmp_path, monkeypatch):
    """W2 headline: a confirmed render behind a 39 s model-load window records a
    synthesis-only duration (saved − engine confirmation = 10 s), NOT the naive
    announce→saved span (50 s) that folds the load window in. This is the
    62 s-vs-40 s inflation the fix targets, pinned through the real record path.
    """
    history, jobs_db = _run_recording_render_with_markers(
        monkeypatch,
        job_id="load-excluded-positive",
        engine_id="xtts",
        engine_behavior={
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Loading XTTS model...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized",
            }
        },
        marker_script=[
            (100.0, "[START_SEGMENT] seg-1"),
            (101.0, "Loading XTTS model..."),     # 39 s load window opens, attributed to seg-1
            (140.0, "[START_SYNTHESIS] seg-1"),    # engine confirmation — synthesis clock starts
            (150.0, "[SEGMENT_SAVED] /tmp/seg-1.wav"),
            (152.0, "Successfully synthesized 1 audio chunks."),
        ],
        completed_at=152.0,
    )

    assert len(history) == 1, f"expected exactly one render sample, got {history}"
    sample = history[0]
    # Synthesis-only clock = saved(150) − confirmation(140) = 10, NOT saved − announce(100) = 50.
    assert sample["sum_segment_render_seconds"] == 10.0
    assert sample["synthesis_duration_seconds"] == 10.0
    assert sample["synthesis_duration_seconds"] < 50.0  # the load window is excluded
    assert sample["model_load_seconds"] == 39.0
    # CPS derives from synthesis-only time, never the load-inclusive span (INV-3).
    assert sample["cps"] == round(sample["chars"] / 10.0, 2)
    assert sample["cps"] != round(sample["chars"] / 50.0, 2)
    assert jobs_db["load-excluded-positive"].sum_segment_render_seconds == 10.0
    assert jobs_db["load-excluded-positive"].model_load_seconds == 39.0


def test_load_window_unconfirmed_records_no_load_polluted_sample(clean_db, tmp_path, monkeypatch):
    """Discard-fix guard (R1): a segment behind a load window that saves WITHOUT
    engine confirmation must not produce a load-inclusive wall-time sample. The
    render-started clock is set (an earlier bare START_SYNTHESIS), the segment is
    load-observed, and it saves with no per-segment confirmation. Because the
    load-observed latch is retained through chapter completion (the
    `segment_load_observed.discard` at [SEGMENT_SAVED] was removed), the terminal
    wall-time fallback stays suppressed → synthesis is None → no sample recorded.
    Re-introducing that discard empties the latch before the terminal check, the
    wall fallback fires, and a load-polluted sample is recorded — turning this
    test red.
    """
    history, jobs_db = _run_recording_render_with_markers(
        monkeypatch,
        job_id="load-unconfirmed-no-pollution",
        engine_id="xtts",
        engine_behavior={
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Loading XTTS model...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized",
            }
        },
        marker_script=[
            (100.0, "[START_SYNTHESIS]"),            # bare confirmation, no active segment → sets render-started clock
            (101.0, "[START_SEGMENT] seg-1"),
            (102.0, "Loading XTTS model..."),         # load window attributed to seg-1
            (140.0, "[SEGMENT_SAVED] /tmp/seg-1.wav"),  # saved WITHOUT a per-segment START_SYNTHESIS
            (142.0, "Successfully synthesized 1 audio chunks."),
        ],
        completed_at=142.0,
    )

    assert history == [], f"a load-polluted sample was recorded: {history}"
    assert jobs_db["load-unconfirmed-no-pollution"].sum_segment_render_seconds == 0.0


def test_engine_without_manifest_ignores_fallback_completion(clean_db, tmp_path, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext
    from app.db.state import put_job, Job
    from app.engines.behavior import normalize_behavior

    job_id = "test-no-fallback-completion-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="custom-engine",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={
            "engine_id": "custom-engine",
            "script_text": "Hello world",
            "voice_profile_id": "Default",
        }
    )

    jobs_db = {}
    def mock_put_job(job):
        jobs_db[job.id] = job
    def mock_get_jobs():
        return jobs_db
    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)

    def mock_publish(self, context, status=None, progress=None, eta_seconds=None, started_at=None, **kwargs):
        updates = {}
        if status is not None:
            updates["status"] = status
        if progress is not None:
            updates["progress"] = progress
        job_fields = Job.__dataclass_fields__
        for k, v in kwargs.items():
            if k in job_fields:
                updates[k] = v
        if updates:
            mock_put_job(Job(**{**jobs_db[context.task_id].__dict__, **updates}))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 10.0)

    # NO TIMING MARKERS declarations in behavior
    mock_manifest = {
        "behavior": {
            "timing_markers": {}
        }
    }
    monkeypatch.setattr("app.engines.behavior.behavior_for_engine", lambda engine_id, **kwargs: normalize_behavior(mock_manifest["behavior"]))

    listener_cb = [None]
    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb
        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(
        id=job_id,
        engine="custom-engine",
        status="running",
        created_at=time.time()
    ))

    mixin = OrchestratorHelpersMixin()

    from unittest.mock import patch
    from app.orchestration.tasks.base import TaskResult

    def custom_handler(*args, **kwargs):
        listener = listener_cb[0]
        # Send XTTS completion line, which should NOT match
        listener("Successfully synthesized 1 audio chunks.")
        return TaskResult(status="completed")

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=[]), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="custom-engine"):

        mock_reg.return_value.get_handler.return_value = custom_handler
        mixin._dispatch(task=task, context=context)

    # chapter_render_completed_at MUST be None because the log did not match
    job = jobs_db.get(job_id)
    assert job.chapter_render_completed_at is None


def test_start_segment_proportional_eta(clean_db, tmp_path, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext
    from app.db.state import put_job, Job

    job_id = "test-prop-eta-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[
            {"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"},
            {"ids": ["seg-2"], "save_path": "/tmp/seg-2.wav", "text": "Hello world 2"}
        ]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1"
    )

    jobs_db = {}
    def mock_put_job(job):
        jobs_db[job.id] = job
    def mock_get_jobs():
        return jobs_db
    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state_jobs.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state_jobs.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)
    monkeypatch.setattr("app.db.state_jobs.update_job", mock_update_job)

    published_etas = []
    def mock_publish(self, context, started_at=None, **kwargs):
        if "eta_seconds" in kwargs:
            published_etas.append((kwargs.get("reason_code"), kwargs["eta_seconds"]))

    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", mock_publish)
    # Expected duration = 60s
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 60.0)

    # 2 render groups, weighted by chunk text length.
    mock_segments = [
        {"id": "seg-1", "text_content": "Hello world", "character_id": 1, "speaker_profile_name": "Narrator"},
        {"id": "seg-2", "text_content": "Hello world 2", "character_id": 2, "speaker_profile_name": "Narrator"}
    ]

    mock_manifest = {
        "behavior": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Booting custom engine server...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized 2 audio chunks."
            }
        }
    }
    from app.engines.behavior import normalize_behavior
    monkeypatch.setattr("app.engines.behavior.behavior_for_engine", lambda engine_id, **kwargs: normalize_behavior(mock_manifest["behavior"]))

    listener_cb = [None]
    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb
        def unregister_log_listener(self, cb):
            pass

    mock_put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=time.time()
    ))

    mixin = OrchestratorHelpersMixin()

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=mock_segments), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[
             {"id": "seg-1", "leader_segment_id": "seg-1", "segments": [mock_segments[0]], "text_content": "Hello world"},
             {"id": "seg-2", "leader_segment_id": "seg-2", "segments": [mock_segments[1]], "text_content": "Hello world 2"}
         ]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):

        mock_reg.return_value.get_handler.return_value = lambda *args, **kwargs: None
        mixin._dispatch(task=task, context=context)

    assert listener_cb[0] is not None
    listener = listener_cb[0]

    # Engine confirms synthesis has started (START_SYNTHESIS fires once for the job)
    listener("[START_SYNTHESIS]")
    # Announce publishes SEGMENT_PENDING only; the canonical START_SEGMENT frame is
    # emitted at engine confirmation (here: the first progress line per segment).
    with patch(
        "app.engines.behavior.parse_engine_progress",
        side_effect=lambda eng, line: 0.1 if "synth-progress" in line else None,
    ):
        listener("[START_SEGMENT] seg-1")
        listener("synth-progress")
        # SEGMENT_SAVED advances completed_weight before the next START_SEGMENT.
        listener("[SEGMENT_SAVED] /tmp/seg-1.wav")
        listener("[START_SEGMENT] seg-2")
        listener("synth-progress")

    # Under the new contract, START_SEGMENT ETA frames are emitted at engine confirmation.
    start_segment_etas = [eta for reason, eta in published_etas if reason == "START_SEGMENT"]
    assert len(start_segment_etas) == 2
    # First START_SEGMENT (seg-1): completed weight = 0, remaining_fraction = 1.0, eta should be ~60
    assert start_segment_etas[0] == 60
    # Second START_SEGMENT (seg-2): completed weight = 11 (Hello world), total_weight = 24.
    # remaining_fraction = (24 - 11) / 24 = 13 / 24 = 0.5416. eta should be ~32
    assert start_segment_etas[1] == 32


def test_structured_timing_derivation_segmented(clean_db, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext, TaskResult
    from app.db.state import put_job, Job
    from app.db.performance import get_render_history

    job_id = "test-structured-segmented-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={
            "engine_id": "xtts",
            "script_text": "Hello world",
            "voice_profile_id": "Default",
        }
    )

    jobs_db = {}
    def mock_put_job(job):
        jobs_db[job.id] = job
    def mock_get_jobs():
        return jobs_db
    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", lambda *args, **kwargs: None)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 10.0)

    # Initialize job in DB state
    mock_put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=100.0,
    ))

    # Real JSON-style response shape: plain nested dicts
    timing_res = {
        "chapter_render_started_at": 105.0,
        "chapter_render_completed_at": 135.0,
        "engine_activity_started_at": 100.0,
        "segments": [
            {"segment_id": "seg-1", "render_started_at": 108.0, "render_completed_at": 118.0},
            {"segment_id": "seg-2", "render_started_at": 120.0, "render_completed_at": 132.0},
        ]
    }

    class FakeBridge:
        def synthesize(self, request):
            return {
                "status": "ok",
                "tts_server_result": {
                    "ok": True,
                    "output_path": "/tmp/out.wav",
                    "duration_sec": 4.5,
                    "timing": timing_res
                }
            }

    mixin = OrchestratorHelpersMixin()
    mixin.voice_bridge = FakeBridge()

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=[]), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):

        mock_reg.return_value.get_handler.return_value = None # force bridge dispatch
        mixin._dispatch(task=task, context=context)

    # Now verify the recorded sample in DB history
    history = get_render_history()
    assert len(history) == 1
    sample = history[0]

    assert sample["started_at"] == 100.0
    assert sample["completed_at"] == 135.0
    assert sample["duration_seconds"] == 35.0
    assert sample["model_load_seconds"] == 5.0
    assert sample["sum_segment_render_seconds"] == 22.0
    assert sample["inter_group_overhead_seconds"] == 8.0 # DB formula

    # Verify the job state has the exact formulas derived
    job = jobs_db.get(job_id)
    assert job.model_load_seconds == 5.0
    assert job.synthesis_duration_seconds == 30.0
    assert job.sum_segment_render_seconds == 22.0
    assert job.inter_group_overhead_seconds == 2.0


def test_structured_timing_derivation_non_segmented(clean_db, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext, TaskResult
    from app.db.state import put_job, Job
    from app.db.performance import get_render_history

    job_id = "test-structured-non-segmented-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={
            "engine_id": "xtts",
            "script_text": "Hello world",
            "voice_profile_id": "Default",
        }
    )

    jobs_db = {}
    def mock_put_job(job):
        jobs_db[job.id] = job
    def mock_get_jobs():
        return jobs_db
    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", lambda *args, **kwargs: None)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 10.0)

    # Initialize job in DB state
    mock_put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=100.0,
    ))

    # Real JSON-style response shape: plain nested dicts
    timing_res = {
        "chapter_render_started_at": 105.0,
        "chapter_render_completed_at": 130.0,
        "engine_activity_started_at": None,
        "segments": None
    }

    class FakeBridge:
        def synthesize(self, request):
            return {
                "status": "ok",
                "tts_server_result": {
                    "ok": True,
                    "output_path": "/tmp/out.wav",
                    "duration_sec": 4.5,
                    "timing": timing_res
                }
            }

    mixin = OrchestratorHelpersMixin()
    mixin.voice_bridge = FakeBridge()

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=[]), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):

        mock_reg.return_value.get_handler.return_value = None # force bridge dispatch
        mixin._dispatch(task=task, context=context)

    # Now verify the recorded sample in DB history
    history = get_render_history()
    assert len(history) == 1
    sample = history[0]

    assert sample["started_at"] == 105.0
    assert sample["completed_at"] == 130.0
    assert sample["duration_seconds"] == 25.0
    assert sample["model_load_seconds"] == 0.0
    assert sample["sum_segment_render_seconds"] == 25.0
    assert sample["inter_group_overhead_seconds"] == 0.0


def test_structured_timing_derivation_out_of_order(clean_db, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext, TaskResult
    from app.db.state import put_job, Job
    from app.db.performance import get_render_history

    job_id = "test-structured-ooo-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={
            "engine_id": "xtts",
            "script_text": "Hello world",
            "voice_profile_id": "Default",
        }
    )

    jobs_db = {}
    def mock_put_job(job):
        jobs_db[job.id] = job
    def mock_get_jobs():
        return jobs_db
    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_publish", lambda *args, **kwargs: None)
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 10.0)

    # Initialize job in DB state
    mock_put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=100.0,
    ))

    # Plain nested dict timing payload with segment list intentionally out of order
    timing_res = {
        "chapter_render_started_at": 105.0,
        "chapter_render_completed_at": 135.0,
        "engine_activity_started_at": 100.0,
        "segments": [
            {"segment_id": "seg-2", "render_started_at": 120.0, "render_completed_at": 132.0},
            {"segment_id": "seg-1", "render_started_at": 108.0, "render_completed_at": 118.0},
        ]
    }

    class FakeBridge:
        def synthesize(self, request):
            return {
                "status": "ok",
                "tts_server_result": {
                    "ok": True,
                    "output_path": "/tmp/out.wav",
                    "duration_sec": 4.5,
                    "timing": timing_res
                }
            }

    mixin = OrchestratorHelpersMixin()
    mixin.voice_bridge = FakeBridge()

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=[]), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):

        mock_reg.return_value.get_handler.return_value = None # force bridge dispatch
        mixin._dispatch(task=task, context=context)

    # Now verify the recorded sample in DB history
    history = get_render_history()
    assert len(history) == 1
    sample = history[0]

    assert sample["started_at"] == 100.0
    assert sample["completed_at"] == 135.0
    assert sample["duration_seconds"] == 35.0
    assert sample["model_load_seconds"] == 5.0
    assert sample["sum_segment_render_seconds"] == 22.0
    assert sample["inter_group_overhead_seconds"] == 8.0 # DB formula

    # Verify the job state has the exact formulas derived (inter_group_overhead must be 2.0 based on min/max time bounds)
    job = jobs_db.get(job_id)
    assert job.model_load_seconds == 5.0
    assert job.synthesis_duration_seconds == 30.0
    assert job.sum_segment_render_seconds == 22.0
    assert job.inter_group_overhead_seconds == 2.0



def test_structured_timing_fallback_when_absent(clean_db, monkeypatch):
    from app.orchestration.tasks.synthesis import SynthesisTask
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext, TaskResult
    from app.db.state import put_job, Job
    from app.db.performance import get_render_history

    job_id = "test-timing-fallback-job"
    task = SynthesisTask(
        task_id=job_id,
        engine_id="xtts",
        script_text="Hello world",
        output_path="/tmp/out.wav",
        chapter_id="chap-1",
        voice_profile_id="Default",
        script=[{"ids": ["seg-1"], "save_path": "/tmp/seg-1.wav", "text": "Hello world"}]
    )
    context = TaskContext(
        task_id=job_id,
        task_type="synthesis",
        project_id="proj-1",
        chapter_id="chap-1",
        payload={
            "engine_id": "xtts",
            "script_text": "Hello world",
            "voice_profile_id": "Default",
        }
    )

    jobs_db = {}
    def mock_put_job(job):
        jobs_db[job.id] = job
    def mock_get_jobs():
        return jobs_db
    def mock_update_job(job_id, **kwargs):
        job = jobs_db.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)

    monkeypatch.setattr("app.db.state.put_job", mock_put_job)
    monkeypatch.setattr("app.db.state.get_jobs", mock_get_jobs)
    monkeypatch.setattr("app.db.state.update_job", mock_update_job)
    # Don't mock publish/update_job fully, let fallback logic set timing values
    monkeypatch.setattr(OrchestratorHelpersMixin, "_estimate_task_duration", lambda *args, **kwargs: 10.0)

    # Initialize job in DB state
    mock_put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=100.0,
    ))

    class FakeBridge:
        def synthesize(self, request):
            return {
                "status": "ok",
                "tts_server_result": {
                    "ok": True,
                    "output_path": "/tmp/out.wav",
                    "duration_sec": 4.5,
                    "timing": None  # Timing is absent!
                }
            }

    mixin = OrchestratorHelpersMixin()
    mixin.voice_bridge = FakeBridge()

    # We manually trigger log markers to test the fallback path
    listener_cb = [None]
    class FakeWatchdog:
        def register_log_listener(self, cb):
            listener_cb[0] = cb
        def unregister_log_listener(self, cb):
            pass

    mock_manifest = {
        "behavior": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Booting custom engine server...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized 1 audio chunks."
            }
        }
    }
    from app.engines.behavior import normalize_behavior
    monkeypatch.setattr("app.engines.behavior.behavior_for_engine", lambda engine_id, **kwargs: normalize_behavior(mock_manifest["behavior"]))

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_reg, \
         patch("app.engines.watchdog.get_watchdog", return_value=FakeWatchdog()), \
         patch("app.domain.chunk_groups.load_chunk_segments", return_value=[]), \
         patch("app.domain.chunk_groups.build_chunk_groups", return_value=[]), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):

        mock_reg.return_value.get_handler.return_value = None

        # To simulate log markers during synthesis, we construct a thread or custom synchronize call
        def custom_synthesize(request):
            listener = listener_cb[0]
            assert listener is not None
            with patch("time.time", return_value=110.0):
                listener("Booting custom engine server...")
            with patch("time.time", return_value=115.0):
                listener("[START_SYNTHESIS]")
            with patch("time.time", return_value=120.0):
                listener("[START_SEGMENT] seg-1")
            with patch("time.time", return_value=130.0):
                listener("[SEGMENT_SAVED] /tmp/seg-1.wav")
            with patch("time.time", return_value=135.0):
                listener("Successfully synthesized 1 audio chunks.")
            return {
                "status": "ok",
                "tts_server_result": {
                    "ok": True,
                    "output_path": "/tmp/out.wav",
                    "duration_sec": 4.5,
                    "timing": None
                }
            }

        mixin.voice_bridge.synthesize = custom_synthesize
        mixin._dispatch(task=task, context=context)

    # Now verify the recorded sample in DB history
    history = get_render_history()
    assert len(history) == 1
    sample = history[0]

    # Should have fallback timing markers parsed from logs
    assert sample["started_at"] == 110.0
    assert sample["completed_at"] == 135.0
    assert sample["duration_seconds"] == 25.0
    assert sample["model_load_seconds"] == 10.0
    assert sample["sum_segment_render_seconds"] == 10.0
    assert sample["inter_group_overhead_seconds"] == 5.0


# ---------------------------------------------------------------------------
# SEGMENT_PENDING contract: announce vs engine-confirmation publish frames
# ---------------------------------------------------------------------------

def test_start_segment_announce_publishes_segment_pending(clean_db, tmp_path, monkeypatch):
    """[START_SEGMENT] announce must publish reason_code SEGMENT_PENDING with null
    active_segment_eta_seconds. Engine has not confirmed yet (mixed-render pattern:
    ~19s model load between announce and START_SYNTHESIS).
    RED-FIRST: currently publishes START_SEGMENT at announce time.
    """
    from unittest.mock import patch
    job_id = "pending-announce-test"
    seg_id = "segA"
    save_path = "/tmp/segA.wav"

    listener_cb, jobs_db, published_events = _make_listener_harness(
        monkeypatch, job_id, seg_id, save_path
    )
    listener = listener_cb[0]
    assert listener is not None

    events_before = len(published_events)

    # t=100: START_SEGMENT arrives BEFORE engine loads (mixed-render pattern)
    with patch("time.time", return_value=100.0):
        listener(f"[START_SEGMENT] {seg_id}")

    # The publish triggered by [START_SEGMENT] must be SEGMENT_PENDING with no segment ETA
    new_events = published_events[events_before:]
    assert len(new_events) >= 1, "Expected at least one publish after [START_SEGMENT]"
    announce_publish = new_events[0]
    assert announce_publish.get("reason_code") == "SEGMENT_PENDING", (
        f"Expected SEGMENT_PENDING at announce time, got {announce_publish.get('reason_code')!r}"
    )
    assert announce_publish.get("active_segment_eta_seconds") is None, (
        f"Expected null active_segment_eta_seconds at announce time, "
        f"got {announce_publish.get('active_segment_eta_seconds')!r}"
    )
    assert announce_publish.get("message") == f"Preparing engine for segment {seg_id}..."


def test_start_synthesis_confirmation_publishes_start_segment(clean_db, tmp_path, monkeypatch):
    """After [START_SEGMENT] announce, [START_SYNTHESIS] must trigger a canonical
    START_SEGMENT publish with non-null active_segment_eta_seconds (clock has started).
    """
    from unittest.mock import patch
    job_id = "synthesis-confirmation-test"
    seg_id = "segB"
    save_path = "/tmp/segB.wav"

    listener_cb, jobs_db, published_events = _make_listener_harness(
        monkeypatch, job_id, seg_id, save_path
    )
    listener = listener_cb[0]
    assert listener is not None

    # t=100: announce
    with patch("time.time", return_value=100.0):
        listener(f"[START_SEGMENT] {seg_id}")

    events_before_synth = len(published_events)

    # t=119: engine confirms via START_SYNTHESIS (after 19s model load)
    with patch("time.time", return_value=119.0):
        listener("[START_SYNTHESIS] task-id")

    # Find the START_SEGMENT frame published after confirmation
    new_events = published_events[events_before_synth:]
    start_seg_events = [e for e in new_events if e.get("reason_code") == "START_SEGMENT"]
    assert len(start_seg_events) >= 1, (
        f"Expected a START_SEGMENT publish after [START_SYNTHESIS] confirmation, got: {new_events}"
    )
    confirmed_event = start_seg_events[0]
    assert confirmed_event.get("active_segment_eta_seconds") is not None, (
        "active_segment_eta_seconds must be non-null after engine confirmation"
    )
    assert confirmed_event.get("active_segment_id") == seg_id


def test_progress_confirmation_publishes_start_segment_before_progress(clean_db, tmp_path, monkeypatch):
    """When engine confirmation comes via first PROGRESS (no START_SYNTHESIS), the
    START_SEGMENT frame must be published BEFORE the SEGMENT_PROGRESS frame.
    """
    from unittest.mock import patch
    job_id = "progress-confirm-test"
    seg_id = "segC"
    save_path = "/tmp/segC.wav"

    listener_cb, jobs_db, published_events = _make_listener_harness(
        monkeypatch, job_id, seg_id, save_path
    )
    listener = listener_cb[0]
    assert listener is not None

    # t=100: announce
    with patch("time.time", return_value=100.0):
        listener(f"[START_SEGMENT] {seg_id}")

    events_before_progress = len(published_events)

    # Send a progress line that parse_engine_progress will recognize
    with patch("time.time", return_value=119.0):
        # Force a raw_progress parse by patching parse_engine_progress
        with patch("app.engines.behavior.parse_engine_progress", return_value=0.5):
            listener("some progress line for seg")

    new_events = published_events[events_before_progress:]
    reason_codes = [e.get("reason_code") for e in new_events]

    # START_SEGMENT must appear before SEGMENT_PROGRESS in the sequence
    assert "START_SEGMENT" in reason_codes, (
        f"Expected START_SEGMENT in events after first PROGRESS, got: {reason_codes}"
    )
    assert "SEGMENT_PROGRESS" in reason_codes, (
        f"Expected SEGMENT_PROGRESS after confirmation, got: {reason_codes}"
    )
    start_idx = reason_codes.index("START_SEGMENT")
    progress_idx = reason_codes.index("SEGMENT_PROGRESS")
    assert start_idx < progress_idx, (
        f"START_SEGMENT must come before SEGMENT_PROGRESS; order was: {reason_codes}"
    )


def test_second_group_start_synthesis_still_confirms_segment(clean_db, tmp_path, monkeypatch):
    """Mixed renders emit one [START_SYNTHESIS] per group subprocess. The dedup that keeps
    job-level state from re-firing must NOT swallow the canonical START_SEGMENT confirmation
    for groups after the first.
    """
    from unittest.mock import patch
    job_id = "second-group-confirm-test"
    seg_a = "segA"
    save_path = "/tmp/segA.wav"

    listener_cb, jobs_db, published_events = _make_listener_harness(
        monkeypatch, job_id, seg_a, save_path
    )
    listener = listener_cb[0]
    assert listener is not None

    # Group 1 full cycle: announce -> confirm -> saved
    with patch("time.time", return_value=100.0):
        listener(f"[START_SEGMENT] {seg_a}")
    with patch("time.time", return_value=119.0):
        listener("[START_SYNTHESIS] task-id")
    with patch("time.time", return_value=125.0):
        listener(f"[SEGMENT_SAVED] {save_path}")

    # Group 2: announce, then its own subprocess emits a second START_SYNTHESIS
    seg_b = "segB"
    with patch("time.time", return_value=126.0):
        listener(f"[START_SEGMENT] {seg_b}")

    events_before = len(published_events)
    with patch("time.time", return_value=145.0):
        listener("[START_SYNTHESIS] task-id")

    new_events = published_events[events_before:]
    start_seg_events = [
        e for e in new_events
        if e.get("reason_code") == "START_SEGMENT" and e.get("active_segment_id") == seg_b
    ]
    assert len(start_seg_events) >= 1, (
        "Second group's START_SYNTHESIS must publish the canonical START_SEGMENT frame "
        f"despite the job-level dedup; got reason codes: {[e.get('reason_code') for e in new_events]}"
    )
