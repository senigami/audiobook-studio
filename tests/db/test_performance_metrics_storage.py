import os
import time
import pytest
import uuid
import json
from pathlib import Path
from app.db.core import init_db, get_connection
from app.db.performance import record_render_sample, get_render_history, apply_performance_retention_policy
from app.db.state import get_performance_metrics, update_performance_metrics, _default_performance_metrics, _default_state

@pytest.fixture
def clean_db(tmp_path):
    # Use a unique DB path for this test
    db_path = tmp_path / f"test_performance_{uuid.uuid4().hex}.db"
    studio_db_path = tmp_path / f"test_studio_{uuid.uuid4().hex}.db"
    os.environ["DB_PATH"] = str(db_path)
    os.environ["STUDIO_DB_PATH"] = str(studio_db_path)

    # Force reload of db.core to pick up the new DB_PATHs
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    init_db()

    yield db_path

    # Cleanup
    if db_path.exists():
        try:
            os.unlink(db_path)
        except OSError:
            pass
    if studio_db_path.exists():
        try:
            os.unlink(studio_db_path)
        except OSError:
            pass

@pytest.fixture
def clean_state(tmp_path):
    state_file = tmp_path / f"state_{uuid.uuid4().hex}.json"
    os.environ["STATE_FILE"] = str(state_file)

    import app.db.state
    import importlib
    importlib.reload(app.db.state)

    # Write default state
    state_file.write_text(json.dumps(_default_state()))

    yield state_file

    if state_file.exists():
        try:
            os.unlink(state_file)
        except OSError:
            pass

def test_record_render_sample_storage(clean_db):
    jid = str(uuid.uuid4())
    record_render_sample(
        engine="engine-a",
        tts_model="model-a",
        chars=1000,
        segment_count=10,
        duration_seconds=60.0,
        seconds_per_segment=6.0,
        job_id=jid,
        project_id="p1",
        chapter_id="c1",
        speaker_profile="feeling-lucky",
        synthesis_duration_seconds=45.0,
        sample_type="chapter",
    )

    history = get_render_history()
    assert len(history) == 1
    sample = history[0]
    assert sample["job_id"] == jid
    assert sample["engine"] == "engine-a"
    assert sample["speaker_profile"] == "feeling-lucky"
    assert sample["project_id"] == "p1"
    assert sample["chapter_id"] == "c1"
    assert sample["tts_model"] == "model-a"
    # Verify split timing fields are correctly stored
    assert sample["duration_seconds"] == 60.0
    assert sample["synthesis_duration_seconds"] == 45.0
    assert sample["inter_group_overhead_seconds"] == 15.0
    assert sample["sample_type"] == "chapter"
    # CPS must be computed from pure synthesis duration (1000 / 45 = 22.22), not total duration (1000 / 60 = 16.67)
    assert abs(sample["cps"] - 22.22) < 0.01

    # Regression check: verify old behavior duration_seconds == synthesis_duration_seconds is NOT true
    assert sample["duration_seconds"] != sample["synthesis_duration_seconds"]


def test_performance_retention_policy(clean_db):
    # 1. Test 180 day hard purge
    old_time = time.time() - (181 * 86400)
    record_render_sample(
        engine="engine-a", chars=100, segment_count=1, duration_seconds=10, cps=10, seconds_per_segment=10,
        completed_at=old_time, synthesis_duration_seconds=10.0
    )
    apply_performance_retention_policy()
    history = get_render_history()
    assert len(history) == 0 # Purged immediately

    # 2. Test 30 day window vs 100 sample minimum
    now = time.time()
    # 150 samples older than 30 days (but within 180)
    for i in range(150):
        # We must insert them with distinct but old timestamps
        # and ensure they are processed by the retention policy
        record_render_sample(
            engine="engine-a", chars=100, segment_count=1, duration_seconds=10, cps=10, seconds_per_segment=10,
            completed_at=now - (31 * 86400) - i, synthesis_duration_seconds=10.0
        )

    # Retention is now startup-triggered, so we invoke it explicitly to test the cleanup logic.
    apply_performance_retention_policy()
    history = get_render_history(limit=200)
    # It should have kept exactly 100 newest (the last 100 we inserted).
    assert len(history) == 100

    # 3. Keep all within 30 days even if > 100
    for i in range(50):
        record_render_sample(
            engine="engine-a", chars=100, segment_count=1, duration_seconds=10, cps=10, seconds_per_segment=10,
            completed_at=now - (1 * 86400), synthesis_duration_seconds=10.0
        )

    apply_performance_retention_policy()
    history = get_render_history(limit=200)
    # After inserting 50 new ones, the total should still be capped by the newest-100 retention rule.
    assert len(history) == 100


def test_init_db_runs_performance_retention(clean_db, monkeypatch):
    from app.db import core as db_core

    calls: list[int] = []

    def fake_retention_policy():
        calls.append(1)

    monkeypatch.setattr("app.db.performance.apply_performance_retention_policy", fake_retention_policy)

    db_core.init_db()

    assert len(calls) == 1


def test_global_audiobook_speed_multiplier_is_not_persisted(clean_db, clean_state):
    from app.db.core import get_studio_connection
    update_performance_metrics(audiobook_speed_multiplier=2.5)

    metrics = get_performance_metrics()

    assert "audiobook_speed_multiplier" not in metrics
    with get_studio_connection() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            ("performance_metric:audiobook_speed_multiplier",),
        ).fetchone()
    assert row is None


def test_failed_jobs_do_not_train(clean_db, clean_state):
    from app.jobs.worker_metrics import record_engine_sample
    from app.db.state import put_job
    from app.db.models import Job

    jid = "job-fail-test"
    job = Job(id=jid, engine="engine-a", chapter_file="c1", status="failed", created_at=time.time())
    put_job(job)

    record_engine_sample(job, time.time() - 60, 1000, {})

    history = get_render_history()
    assert len(history) == 0

def test_successful_jobs_train(clean_db, clean_state):
    from app.jobs.worker_metrics import record_engine_sample
    from app.db.state import put_job
    from app.db.models import Job

    jid = "job-success-test"
    # We must ensure started_at is before finished_at and dur > 1.0
    now = time.time()
    job = Job(id=jid, engine="engine-a", chapter_file="c1", status="done", created_at=now-30, started_at=now-20, finished_at=now, synthesis_duration_seconds=10.0)
    put_job(job)

    record_engine_sample(job, now - 10, 1000, {})

    history = get_render_history()
    assert len(history) == 1
    assert history[0]["job_id"] == jid
    assert history[0]["chars"] == 1000


def test_successful_jobs_do_not_write_plugin_computer_speed_multiplier(clean_db, clean_state, tmp_path, monkeypatch):
    from app.jobs.worker_metrics import record_engine_sample
    from app.db.state import put_job
    from app.db.models import Job
    from app.tts_server.settings_store import load_settings, save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-a"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"enabled": True, "quality": "draft"})
    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)

    jid = "job-plugin-speed-test"
    now = time.time()
    job = Job(
        id=jid,
        engine="engine-a",
        chapter_file="c1",
        status="done",
        created_at=now - 30,
        started_at=now - 10,
        finished_at=now,
        synthesis_duration_seconds=5.0,
    )
    put_job(job)

    record_engine_sample(job, now - 10, 334, {})

    settings = load_settings(plugin_dir)
    assert settings["enabled"] is True
    assert settings["quality"] == "draft"
    assert "computer_speed_multiplier" not in settings


def test_clear_engine_speed_baseline_wipes_samples_and_cached_cps(clean_db, clean_state, tmp_path, monkeypatch):
    from app.tts_server.performance_settings import clear_engine_computer_speed_baseline
    from app.tts_server.settings_store import load_settings, save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-a"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"enabled": True, "computer_speed_multiplier": 1.75})
    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)

    now = time.time()
    record_render_sample(
        engine="engine-a",
        tts_model="model-a",
        chars=1000,
        segment_count=10,
        duration_seconds=50.0,
        cps=20.0,
        seconds_per_segment=5.0,
        completed_at=now - 20,
        synthesis_duration_seconds=50.0,
    )
    record_render_sample(
        engine="engine-b",
        tts_model="model-b",
        chars=500,
        segment_count=5,
        duration_seconds=25.0,
        cps=20.0,
        seconds_per_segment=5.0,
        completed_at=now - 10,
        synthesis_duration_seconds=25.0,
    )
    update_performance_metrics(engine_cps={"engine-a": 19.5, "engine-b": 21.0})

    clear_engine_computer_speed_baseline("engine-a")

    settings = load_settings(plugin_dir)
    assert "computer_speed_multiplier" not in settings
    assert settings["enabled"] is True

    history = get_render_history(limit=200)
    assert all(sample["engine"] != "engine-a" for sample in history)
    assert any(sample["engine"] == "engine-b" for sample in history)

    metrics = get_performance_metrics()
    assert "engine-a" not in metrics["engine_cps"]
    assert metrics["engine_cps"]["engine-b"] == 21.0


def test_record_engine_sample_filters_speed_history_by_tts_model(clean_db, clean_state, tmp_path, monkeypatch):
    from app.jobs.worker_metrics import record_engine_sample
    from app.db.state import put_job, get_performance_metrics
    from app.db.models import Job
    from app.tts_server.settings_store import save_settings

    plugins_dir = tmp_path / "plugins"
    plugin_dir = plugins_dir / "tts_engine-a"
    plugin_dir.mkdir(parents=True)
    save_settings(plugin_dir, {"model": "model-fast"})
    monkeypatch.setattr("app.core.config.PLUGINS_DIR", plugins_dir)

    now = time.time()
    record_render_sample(
        engine="engine-a",
        tts_model="model-slow",
        chars=100,
        segment_count=1,
        duration_seconds=100,
        completed_at=now - 20,
        synthesis_duration_seconds=10.0,
    )

    jid = "job-model-filter-test"
    job = Job(
        id=jid,
        engine="engine-a",
        chapter_file="c1",
        status="done",
        created_at=now - 30,
        started_at=now - 10,
        finished_at=now,
        synthesis_duration_seconds=10.0,
    )
    put_job(job)

    record_engine_sample(job, now - 10, 1000, {})

    history = get_render_history()
    assert history[-1]["cps"] == 100.0
    assert history[-1]["tts_model"] == "model-fast"


def test_record_engine_sample_requires_chars(clean_db, clean_state):
    from app.jobs.worker_metrics import record_engine_sample
    from app.db.state import put_job
    from app.db.models import Job

    jid = "test-no-chars"
    now = time.time()
    job = Job(id=jid, engine="engine-a", status="done", started_at=now-10, finished_at=now, created_at=now-20, synthesis_duration_seconds=5.0)
    put_job(job)

    # 1. Chars = 0 (should be ignored)
    record_engine_sample(job, now-10, 0, {})
    assert len(get_render_history()) == 0

    # 2. Chars > 0 (should be recorded)
    record_engine_sample(job, now-10, 100, {})
    history = get_render_history()
    assert len(history) == 1
    assert history[0]["chars"] == 100


def test_mandatory_synthesis_duration_contract(clean_db):
    # Valid call should pass
    record_render_sample(
        engine="engine-a",
        tts_model="model-a",
        chars=100,
        segment_count=1,
        synthesis_duration_seconds=5.0,
    )
    assert len(get_render_history()) == 1

    # Missing synthesis_duration_seconds should raise ValueError
    with pytest.raises(ValueError, match="synthesis_duration_seconds is mandatory"):
        record_render_sample(
            engine="engine-a",
            tts_model="model-a",
            chars=100,
            segment_count=1,
            synthesis_duration_seconds=None,
        )

    # Zero synthesis_duration_seconds should raise ValueError
    with pytest.raises(ValueError, match="synthesis_duration_seconds is mandatory"):
        record_render_sample(
            engine="engine-a",
            tts_model="model-a",
            chars=100,
            segment_count=1,
            synthesis_duration_seconds=0.0,
        )

    # Negative synthesis_duration_seconds should raise ValueError
    with pytest.raises(ValueError, match="synthesis_duration_seconds is mandatory"):
        record_render_sample(
            engine="engine-a",
            tts_model="model-a",
            chars=100,
            segment_count=1,
            synthesis_duration_seconds=-1.0,
        )


def test_xtts_segment_adapter_text_capture(clean_db, monkeypatch):
    from plugins.tts_xtts.plugin.studio.adapter import xtts_dispatch_adapter
    from app.db.models import Job
    from app.db.state import put_job

    # Mock get_profile_wavs and get_speaker_settings to avoid filesystem dependency
    monkeypatch.setattr("app.db.speakers.get_profile_wavs", lambda x: ["/dummy.wav"])
    monkeypatch.setattr("app.db.speakers.get_speaker_settings", lambda x: {"speed": 1.0})
    monkeypatch.setattr("plugins.tts_xtts.plugin.studio.handler.handle_xtts_job", lambda *args, **kwargs: 0)

    # Create terminal Job
    jid = "xtts-segment-text-test"
    now = time.time()
    job = Job(
        id=jid,
        engine="xtts",
        status="done",
        project_id="p1",
        chapter_id="c1",
        speaker_profile="spk1",
        created_at=now - 20,
        started_at=now - 10,
        finished_at=now,
        synthesis_duration_seconds=5.0
    )
    put_job(job)

    # Invoke dispatch adapter with text in kwargs
    xtts_dispatch_adapter(jid, job, start=now - 10, on_output=lambda x: None, cancel_check=lambda: False, text="This is segment text")

    history = get_render_history()
    assert len(history) == 1
    assert history[0]["chars"] == len("This is segment text")


def test_record_engine_sample_contract_enforcement(clean_db, clean_state):
    from app.jobs.worker_metrics import record_engine_sample
    from app.db.state import put_job
    from app.db.models import Job

    # 1. Job with missing synthesis_duration_seconds must raise ValueError
    job_missing = Job(
        id="job-missing-synth",
        engine="engine-a",
        status="done",
        created_at=time.time() - 10,
        started_at=time.time() - 8,
        finished_at=time.time(),
        synthesis_duration_seconds=None
    )
    put_job(job_missing)
    with pytest.raises(ValueError, match="synthesis_duration_seconds is mandatory"):
        record_engine_sample(job_missing, time.time() - 8, 100, {})

    # 2. Job with negative synthesis_duration_seconds must raise ValueError
    job_negative = Job(
        id="job-negative-synth",
        engine="engine-a",
        status="done",
        created_at=time.time() - 10,
        started_at=time.time() - 8,
        finished_at=time.time(),
        synthesis_duration_seconds=-2.0
    )
    put_job(job_negative)
    with pytest.raises(ValueError, match="synthesis_duration_seconds is mandatory"):
        record_engine_sample(job_negative, time.time() - 8, 100, {})


def test_state_performance_initialization_isolation(tmp_path):
    # Setup fresh DB paths
    db_path = tmp_path / "test_perf_isolated.db"
    studio_db_path = tmp_path / "test_studio_isolated.db"
    import os
    os.environ["DB_PATH"] = str(db_path)
    os.environ["STUDIO_DB_PATH"] = str(studio_db_path)

    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    from app.db.state import get_performance_metrics
    from app.db.performance import record_render_sample

    # Call get_performance_metrics first, which triggers _ensure_settings_table
    metrics = get_performance_metrics()
    assert isinstance(metrics, dict)

    # Now, attempt to write a sample using record_render_sample
    # This requires the schema to have all the new timing columns like synthesis_duration_seconds.
    # If _ensure_settings_table created the obsolete schema, this will FAIL with an OperationalError.
    record_render_sample(
        engine="engine-test-isolated",
        tts_model="model-test",
        chars=1000,
        segment_count=5,
        duration_seconds=30.0,
        synthesis_duration_seconds=20.0,
    )


# ---------------------------------------------------------------------------
# Non-training path classification tests (C.7)
#
# SampleBuildTask and SampleTestTask must NOT write to render_performance_samples
# after a successful synthesis.  The non-training classification is intentional:
# these are short/exploratory runs that would bias CPS calibration.
# These tests lock in that contract so accidental future metrics writes surface
# as failures.
# ---------------------------------------------------------------------------

def test_sample_build_task_does_not_train_metrics(clean_db, tmp_path, monkeypatch):
    """SampleBuildTask.run() must not write to render_performance_samples even
    when synthesis succeeds."""
    from app.orchestration.tasks.sample_build import SampleBuildTask

    class _FakeBridge:
        def synthesize(self, request):
            wav_path = Path(request["output_path"])
            wav_path.parent.mkdir(parents=True, exist_ok=True)
            wav_path.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
            return {"status": "ok", "duration_sec": 3.5}

        def cancel(self, task_id):
            pass

    # Imports in run() are local, so patch at the source module.
    monkeypatch.setattr("app.engines.bridge.create_voice_bridge", lambda: _FakeBridge())

    def _fake_wav_to_mp3(src, dst):
        dst.write_bytes(b"\xff\xfb")
        return 0

    monkeypatch.setattr("app.engines.audio_ops.wav_to_mp3", _fake_wav_to_mp3)
    monkeypatch.setattr("app.db.speakers.update_speaker_settings", lambda *args, **kwargs: None)

    output_path = tmp_path / "speaker" / "preview.mp3"
    task = SampleBuildTask(
        task_id="sample-build-nontrain",
        speaker_profile="test-speaker",
        engine_id="xtts",
        output_path=output_path,
        test_text="Hello world, this is a sample build test.",
    )
    result = task.run()
    assert result.status == "completed", f"Expected completed, got: {result}"

    history = get_render_history()
    assert len(history) == 0, (
        "SampleBuildTask must not write to render_performance_samples; "
        f"found {len(history)} unexpected sample(s)."
    )


def test_sample_test_task_does_not_train_metrics(clean_db, tmp_path, monkeypatch):
    """SampleTestTask.run() must not write to render_performance_samples even
    when synthesis succeeds."""
    from app.orchestration.tasks.sample_test import SampleTestTask

    class _FakeBridge:
        def synthesize(self, request):
            wav_path = Path(request["output_path"])
            wav_path.parent.mkdir(parents=True, exist_ok=True)
            wav_path.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
            return {"status": "ok", "duration_sec": 2.1}

        def cancel(self, task_id):
            pass

    # Imports in run() are local, so patch at the source module.
    monkeypatch.setattr("app.engines.bridge.create_voice_bridge", lambda: _FakeBridge())

    def _fake_wav_to_mp3(src, dst):
        dst.write_bytes(b"\xff\xfb")
        return 0

    monkeypatch.setattr("app.engines.audio_ops.wav_to_mp3", _fake_wav_to_mp3)
    monkeypatch.setattr("app.db.speakers.update_speaker_settings", lambda *args, **kwargs: None)

    output_path = tmp_path / "speaker" / "preview_test.mp3"
    task = SampleTestTask(
        task_id="sample-test-nontrain",
        speaker_profile="test-speaker",
        engine_id="xtts",
        output_path=output_path,
        test_text="Hello world, this is a voice preview test.",
    )
    result = task.run()
    assert result.status == "completed", f"Expected completed, got: {result}"

    history = get_render_history()
    assert len(history) == 0, (
        "SampleTestTask must not write to render_performance_samples; "
        f"found {len(history)} unexpected sample(s)."
    )
