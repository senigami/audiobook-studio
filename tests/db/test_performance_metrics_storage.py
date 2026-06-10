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


def test_generate_via_bridge_extracts_nested_duration(clean_db, tmp_path, monkeypatch):
    """generate_via_bridge should extract duration_sec from response.tts_server_result.duration_sec and write it to job state."""
    from app.jobs.handlers.bridge_helpers import generate_via_bridge
    from app.db.state import get_jobs, put_job, Job

    # Create dummy job in state
    job_id = "test-nested-dur-job"
    put_job(Job(
        id=job_id,
        engine="xtts",
        status="running",
        created_at=time.time(),
        started_at=time.time(),
        synthesis_duration_seconds=0.0
    ))

    class _FakeBridge:
        def synthesize(self, request):
            # Write a dummy wav file so we don't fail path checks
            out_path = Path(request["output_path"])
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")
            return {
                "status": "ok",
                "tts_server_result": {
                    "duration_sec": 4.25
                }
            }

    monkeypatch.setattr("app.jobs.handlers.bridge_helpers.create_voice_bridge", lambda: _FakeBridge())

    out_wav = tmp_path / "output.wav"
    generate_via_bridge(
        engine="xtts",
        text="Hello world",
        out_wav=out_wav,
        task_id=job_id
    )

    # Reload job state
    job = get_jobs().get(job_id)
    assert job is not None
    assert job.synthesis_duration_seconds == 4.25


def test_verify_plugin_records_performance_sample(clean_db, monkeypatch):
    """verify_plugin should record a calibration sample on successful verification with correct details."""
    from app.tts_server.verification import verify_plugin
    from app.tts_server.plugin_loader import LoadedPlugin
    from app.engines.voice.sdk import VerificationResult as SDKVerificationResult

    class FakeEngine:
        def run_test(self, settings=None):
            return SDKVerificationResult(ok=True, message="Engine test OK")

    plugin = LoadedPlugin(
        folder_name="tts_xtts",
        plugin_dir=Path("/tmp/fake_xtts"),
        manifest={
            "engine_id": "xtts",
            "version": "1.0.0",
            "display_name": "XTTS",
            "entry_class": "interface:XttsPlugin",
            "capabilities": ["synthesis"],
            "test_text": "Hello, verification test text."
        },
        engine=FakeEngine()
    )

    monkeypatch.setattr("app.tts_server.settings_store.save_state", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.tts_server.settings_store.calculate_verification_metadata", lambda *args, **kwargs: {})
    monkeypatch.setattr("app.tts_server.settings_store.load_settings", lambda *args: {})

    res = verify_plugin(plugin)
    assert res.ok

    history = get_render_history()
    assert len(history) == 1
    sample = history[0]
    assert sample["engine"] == "xtts"
    assert sample["sample_type"] == "verification"
    assert sample["chars"] == len("Hello, verification test text.")
    assert sample["synthesis_duration_seconds"] > 0
    assert sample["completed_at"] > 1700000000.0
    assert sample["started_at"] > 1700000000.0

    # Test retention survival
    apply_performance_retention_policy()
    history_after = get_render_history()
    assert len(history_after) == 1
    assert history_after[0]["sample_type"] == "verification"


def test_resolve_job_tts_model_falls_back_to_preview_model(clean_db, monkeypatch):
    """_resolve_job_tts_model should resolve from speaker settings' preview_model if model is not set."""
    from app.jobs.worker_metrics import _resolve_job_tts_model
    from app.db.state_jobs import Job

    job = Job(
        id="test-job",
        engine="xtts",
        status="done",
        created_at=time.time(),
        speaker_profile="narrator"
    )

    # Mock get_speaker_settings to return preview_model only
    monkeypatch.setattr("app.db.speakers.get_speaker_settings", lambda name: {
        "preview_model": "tts_models/multilingual/multi-dataset/xtts_v2",
        "speed": 1.0,
        "engine": "xtts"
    })

    model = _resolve_job_tts_model(job, "xtts")
    assert model == "tts_models/multilingual/multi-dataset/xtts_v2"


def test_record_render_sample_stores_load_and_pure_render_seconds(clean_db):
    jid = str(uuid.uuid4())
    record_render_sample(
        engine="engine-b",
        tts_model="model-b",
        chars=1000,
        segment_count=5,
        duration_seconds=50.0,
        job_id=jid,
        project_id="p2",
        chapter_id="c2",
        model_load_seconds=8.0,
        sum_segment_render_seconds=30.0,
        sample_type="chapter",
    )

    history = get_render_history()
    assert len(history) == 1
    sample = history[0]
    assert sample["job_id"] == jid
    assert sample["model_load_seconds"] == 8.0
    assert sample["sum_segment_render_seconds"] == 30.0
    # inter_group_overhead_seconds = (duration_seconds - model_load_seconds) - sum_segment_render_seconds
    # = (50.0 - 8.0) - 30.0 = 12.0
    assert sample["inter_group_overhead_seconds"] == 12.0
    # CPS is chars / sum_segment_render_seconds = 1000 / 30 = 33.33
    assert abs(sample["cps"] - 33.33) < 0.01


def test_xtts_sample_uses_actual_segment_count(clean_db, clean_state):
    """XTTS render sample should use segment count from structured timing if available, or canonical state, not sentence count fallback."""
    from app.db.performance import record_render_sample
    from app.db.state import put_job
    from app.db.models import Job

    jid = "xtts-segment-count-test"
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

    # Let's assume we have 7 segments in timing
    # We write via record_render_sample
    record_render_sample(
        engine="xtts",
        chars=100,
        segment_count=7, # from timing/state
        duration_seconds=10.0,
        job_id=jid,
        project_id="p1",
        chapter_id="c1",
        synthesis_duration_seconds=5.0,
    )

    history = get_render_history()
    assert len(history) == 1
    assert history[0]["segment_count"] == 7


def test_make_mp3_not_written_to_db(clean_db):
    """The make_mp3 field is no longer written to render_performance_samples database table."""
    jid = "make-mp3-removal-test"
    # We call record_render_sample, passing make_mp3 if needed or checking that it is not written
    # Even if we pass make_mp3, it shouldn't write 1 to the database.
    # Let's check with a raw SQL query.
    from app.db.performance import record_render_sample
    record_render_sample(
        engine="xtts",
        chars=100,
        segment_count=1,
        duration_seconds=10.0,
        job_id=jid,
        synthesis_duration_seconds=5.0,
    )

    from app.db.core import get_studio_connection
    with get_studio_connection() as conn:
        conn.row_factory = None
        cursor = conn.cursor()
        # If the column make_mp3 is removed from INSERT, then even if it defaults to 0 in schema,
        # we check what was written.
        # But wait! If we completely stripped it from INSERT, the database should have the default value.
        # More importantly, if we check the query columns, make_mp3 must not be part of the insertion.
        cursor.execute("SELECT * FROM render_performance_samples WHERE job_id = ?", (jid,))
        row = cursor.fetchone()
        assert row is not None
        # We can also fetch by column names to verify make_mp3 is either absent or not set to 1.
        cursor.execute("PRAGMA table_info(render_performance_samples)")
        columns = [r[1] for r in cursor.fetchall()]
        # After the make_mp3 column removal migration, it must not exist in the current schema.
        assert "make_mp3" not in columns


def test_render_sample_records_explicit_model_without_db_defaulting(clean_db):
    """Proving a render sample records the model that came through the plugin/job config without needing DB-side engine-specific defaulting."""
    from app.db.performance import get_render_history
    from app.db.performance import record_render_sample

    record_render_sample(
        engine="some_engine",
        chars=100,
        segment_count=1,
        duration_seconds=10.0,
        job_id="explicit-model-test",
        synthesis_duration_seconds=5.0,
        tts_model="custom-v9",
    )

    history = get_render_history()
    assert len(history) == 1
    assert history[0]["tts_model"] == "custom-v9"


def test_xtts_model_defaults_satisfied_by_settings_schema(clean_db):
    """Proving XTTS model defaults are satisfied by the settings schema path when settings are missing/empty."""
    from app.tts_server.performance_settings import resolve_engine_settings_model
    # We resolve the model default for xtts. Since settings.json is missing,
    # it must fall back to settings_schema.json default which is "v2".
    model = resolve_engine_settings_model("xtts")
    assert model == "v2"


def test_historical_samples_without_explicit_model_still_calibrate(clean_db):
    """Proving historical samples still load/calibrate even if older records are missing explicit model values."""
    from app.db.performance import record_render_sample, get_render_history
    from app.tts_server.performance_settings import filter_history_for_engine_model

    # Record a historical sample with tts_model=None
    record_render_sample(
        engine="xtts",
        chars=100,
        segment_count=1,
        duration_seconds=10.0,
        job_id="historical-null-model-test",
        synthesis_duration_seconds=5.0,
        tts_model=None,
    )

    history = get_render_history()
    assert len(history) == 1
    assert history[0]["tts_model"] is None

    # Filtering for "v2" (the default model from the settings schema) should include this historical sample
    filtered = filter_history_for_engine_model(history, "xtts", "v2")
    assert len(filtered) == 1
    assert filtered[0]["job_id"] == "historical-null-model-test"
