import os
import time
import pytest
import uuid
import json
from pathlib import Path
from unittest.mock import patch
from app.db.core import init_db, get_connection
from app.db.performance import record_render_sample, get_render_history, apply_performance_retention_policy
from app.state import get_performance_metrics, update_performance_metrics, _default_performance_metrics, _default_state

@pytest.fixture
def clean_db(tmp_path):
    # Use a unique DB path for this test
    db_path = tmp_path / f"test_performance_{uuid.uuid4().hex}.db"
    os.environ["DB_PATH"] = str(db_path)

    # Force reload of db.core to pick up the new DB_PATH
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

@pytest.fixture
def clean_state(tmp_path):
    state_file = tmp_path / f"state_{uuid.uuid4().hex}.json"
    os.environ["STATE_FILE"] = str(state_file)

    import app.state
    import importlib
    importlib.reload(app.state)

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
        engine="xtts",
        chars=1000,
        segment_count=10,
        duration_seconds=60.0,
        cps=16.67,
        seconds_per_segment=6.0,
        job_id=jid,
        project_id="p1",
        chapter_id="c1",
        speaker_profile="feeling-lucky"
    )

    history = get_render_history()
    assert len(history) == 1
    sample = history[0]
    assert sample["job_id"] == jid
    assert sample["chars"] == 1000
    assert sample["engine"] == "xtts"
    assert sample["speaker_profile"] == "feeling-lucky"
    assert sample["project_id"] == "p1"
    assert sample["chapter_id"] == "c1"

def test_performance_retention_policy(clean_db):
    # 1. Test 180 day hard purge
    old_time = time.time() - (181 * 86400)
    record_render_sample(
        engine="xtts", chars=100, segment_count=1, duration_seconds=10, cps=10, seconds_per_segment=10,
        completed_at=old_time
    )
    history = get_render_history()
    assert len(history) == 0 # Purged immediately

    # 2. Test 30 day window vs 100 sample minimum
    now = time.time()
    # 150 samples older than 30 days (but within 180)
    for i in range(150):
        # We must insert them with distinct but old timestamps
        # and ensure they are processed by the retention policy
        record_render_sample(
            engine="xtts", chars=100, segment_count=1, duration_seconds=10, cps=10, seconds_per_segment=10,
            completed_at=now - (31 * 86400) - i
        )

    history = get_render_history(limit=200)
    # Retention policy is called inside record_render_sample.
    # It should have kept exactly 100 newest (the last 100 we inserted).
    assert len(history) == 100

    # 3. Keep all within 30 days even if > 100
    for i in range(50):
        record_render_sample(
            engine="xtts", chars=100, segment_count=1, duration_seconds=10, cps=10, seconds_per_segment=10,
            completed_at=now - (1 * 86400)
        )

    history = get_render_history(limit=200)
    # 50 new ones (within 30 days) + 100 old ones (retained because they were the 100 newest at some point) = 150 total
    # Wait, the policy says: "Always keep at least the newest 100 samples if available".
    # After inserting 50 new ones, the "newest 100" contains these 50 + 50 from the previous batch.
    # So the total should stay around 100 + whatever is within 30 days?
    # No, the code says: DELETE where completed_at < 30_days AND id NOT IN (top 100).
    # So if we have 50 within 30 days, they are NOT affected by this clause.
    # The 100 older ones ARE affected, but they are NOT deleted because they are in the top 100 newest.
    # Wait, if we have 50 new ones, the "top 100 newest" includes those 50 plus 50 older ones.
    # So the other 50 older ones WOULD be deleted.
    assert len(history) == 100

def test_migration_from_state_json(clean_db, clean_state):
    from app.state import STATE_FILE
    legacy_history = [
        {"engine": "xtts", "chars": 500, "duration_seconds": 30.0, "cps": 16.67, "completed_at": time.time(), "segment_count": 5}
    ]
    state = _default_state()
    state["performance_metrics"] = {
        "audiobook_speed_multiplier": 1.1,
        "xtts_cps": 20.0,
        "xtts_render_history": legacy_history
    }
    STATE_FILE.write_text(json.dumps(state))

    # This should trigger migration
    metrics = get_performance_metrics()
    assert metrics["xtts_cps"] == 20.0
    assert metrics["audiobook_speed_multiplier"] == 1.1
    assert len(metrics["xtts_render_history"]) == 1
    assert metrics["xtts_render_history"][0]["chars"] == 500

    # Reload and check DB directly
    history_db = get_render_history()
    assert len(history_db) == 1
    assert history_db[0]["chars"] == 500

    # Check state.json is cleaned
    state_after = json.loads(STATE_FILE.read_text())
    assert "performance_metrics" not in state_after


def test_migration_from_legacy_settings_blob(clean_db, clean_state):
    legacy_history = [
        {
            "engine": "xtts",
            "chars": 750,
            "duration_seconds": 45.0,
            "cps": 16.67,
            "seconds_per_segment": 9.0,
            "completed_at": time.time(),
            "segment_count": 5,
        }
    ]
    legacy_metrics = {
        "audiobook_speed_multiplier": 1.2,
        "xtts_cps": 19.5,
        "xtts_render_history": legacy_history,
    }
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)",
            ("performance_metrics", json.dumps(legacy_metrics)),
        )
        conn.commit()

    metrics = get_performance_metrics()

    assert metrics["audiobook_speed_multiplier"] == 1.2
    assert metrics["xtts_cps"] == 19.5
    assert len(metrics["xtts_render_history"]) == 1
    assert metrics["xtts_render_history"][0]["chars"] == 750
    assert get_render_history()[0]["chars"] == 750

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", ("performance_metrics",))
        assert cursor.fetchone() is None


def test_failed_jobs_do_not_train(clean_db, clean_state):
    from app.jobs.worker import _record_xtts_sample
    from app.state import put_job
    from app.models import Job

    jid = "job-fail-test"
    job = Job(id=jid, engine="xtts", chapter_file="c1", status="failed", created_at=time.time())
    put_job(job)

    _record_xtts_sample(job, time.time() - 60, 1000, {})

    history = get_render_history()
    assert len(history) == 0

def test_successful_jobs_train(clean_db, clean_state):
    from app.jobs.worker import _record_xtts_sample
    from app.state import put_job
    from app.models import Job

    jid = "job-success-test"
    # We must ensure started_at is before finished_at and dur > 1.0
    now = time.time()
    job = Job(id=jid, engine="xtts", chapter_file="c1", status="done", created_at=now-30, started_at=now-20, synthesis_started_at=now-10, finished_at=now)
    put_job(job)

    _record_xtts_sample(job, now - 10, 1000, {})

    history = get_render_history()
    assert len(history) == 1
    assert history[0]["job_id"] == jid
    assert history[0]["chars"] == 1000
