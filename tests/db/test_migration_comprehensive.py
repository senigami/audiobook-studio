import pytest
import json
import time
from pathlib import Path
from app.db.legacy_migration import migrate_performance_metrics, migrate_settings, ensure_state_migrated

def test_migrate_performance_metrics():
    metrics = {
        "audiobook_speed_multiplier": 1.1,
        "xtts_cps": 20.0,
        "xtts_render_history": [{"engine": "xtts", "chars": 100}]
    }
    migrated = migrate_performance_metrics(metrics)

    assert "xtts_cps" not in migrated
    assert "xtts_render_history" not in migrated
    assert migrated["engine_cps"]["xtts"] == 20.0
    assert migrated["render_history"][0]["engine"] == "xtts"
    assert "audiobook_speed_multiplier" not in migrated

def test_migrate_settings():
    settings = {
        "xtts_speed": 1.5,
        "voxtral_speed": 1.2,
        "make_mp3": True,
        "safe_mode": True
    }
    migrated = migrate_settings(settings)

    assert "xtts_speed" not in migrated
    assert "voxtral_speed" not in migrated
    assert "make_mp3" not in migrated
    assert migrated["safe_mode"] is True

def test_ensure_state_migrated():
    state = {
        "settings": {
            "xtts_speed": 1.0,
            "make_mp3": True,
            "safe_mode": True
        },
        "performance_metrics": {
            "xtts_cps": 10.0,
            "audiobook_speed_multiplier": 1.1
        }
    }
    # Mock _record_legacy_performance_history_to_db to avoid DB dependency in this unit test
    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("app.db.legacy_migration._record_legacy_performance_history_to_db", lambda x: None)
        changed = ensure_state_migrated(state)

    assert changed is True
    assert "xtts_speed" not in state["settings"]
    assert "make_mp3" not in state["settings"]
    assert state["settings"]["safe_mode"] is True
    assert "performance_metrics" not in state # Entire blob is removed after CPS/history migration


def test_migration_removes_make_mp3_column(tmp_path, monkeypatch):
    """An existing database with make_mp3 column in render_performance_samples should lose that column while preserving other data."""
    import sqlite3
    import uuid
    from app.db.core import init_db, get_studio_connection
    from app.db.performance import record_render_sample, get_render_history

    # Setup paths
    db_path = tmp_path / f"test_db_{uuid.uuid4().hex}.db"
    studio_db_path = tmp_path / f"test_studio_{uuid.uuid4().hex}.db"

    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db_path))

    # Reload modules to apply environment variables
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    # 1. Manually create the old schema with make_mp3
    conn = sqlite3.connect(studio_db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE render_performance_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT,
            project_id TEXT,
            chapter_id TEXT,
            engine TEXT NOT NULL,
            tts_model TEXT,
            speaker_profile TEXT,
            chars INTEGER NOT NULL,
            word_count INTEGER DEFAULT 0,
            segment_count INTEGER NOT NULL,
            render_group_count INTEGER DEFAULT 0,
            started_at REAL,
            completed_at REAL NOT NULL,
            duration_seconds REAL NOT NULL,
            synthesis_duration_seconds REAL NOT NULL DEFAULT 0.0,
            inter_group_overhead_seconds REAL NOT NULL DEFAULT 0.0,
            chapter_load_seconds REAL,
            sum_segment_render_seconds REAL,
            sample_type TEXT,
            cps REAL NOT NULL,
            seconds_per_segment REAL NOT NULL,
            audio_duration_seconds REAL,
            make_mp3 INTEGER DEFAULT 0
        )
    """)
    cursor.execute(f"""
        INSERT INTO render_performance_samples (
            job_id, engine, chars, segment_count, completed_at, duration_seconds,
            synthesis_duration_seconds, cps, seconds_per_segment, make_mp3
        ) VALUES ('job-1', 'xtts', 100, 1, {time.time()}, 10.0, 5.0, 20.0, 10.0, 1)
    """)
    conn.commit()
    conn.close()

    # 2. Run init_db() which should trigger the migration
    init_db()

    # 3. Assert column is gone
    with get_studio_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(render_performance_samples)")
        columns = [r[1] for r in cursor.fetchall()]
        assert "make_mp3" not in columns

        # 4. Assert data survives
        cursor.execute("SELECT job_id, engine, chars, segment_count FROM render_performance_samples")
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == 'job-1'
        assert row[1] == 'xtts'
        assert row[2] == 100
        assert row[3] == 1

    # 5. Assert inserting a new sample works fine
    record_render_sample(
        engine="voxtral",
        chars=50,
        segment_count=2,
        duration_seconds=5.0,
        synthesis_duration_seconds=2.5,
        job_id="job-2",
    )
    history = get_render_history()
    assert len(history) == 2
    assert history[0]["job_id"] == "job-1"
    assert history[1]["job_id"] == "job-2"
