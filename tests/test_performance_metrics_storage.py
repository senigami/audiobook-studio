import json


def _clear_performance_metrics_setting():
    from app.db.core import get_connection

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS render_performance_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                engine TEXT NOT NULL,
                speaker_profile TEXT,
                chars INTEGER NOT NULL,
                segment_count INTEGER NOT NULL,
                render_group_count INTEGER DEFAULT 0,
                duration_seconds REAL NOT NULL,
                cps REAL NOT NULL,
                seconds_per_segment REAL NOT NULL,
                completed_at REAL NOT NULL
            )
        """)
        cursor.execute("DELETE FROM settings WHERE key = ?", ("performance_metrics",))
        cursor.execute("DELETE FROM settings WHERE key LIKE ?", ("performance_metric:%",))
        cursor.execute("DELETE FROM render_performance_samples")
        conn.commit()


def test_performance_metrics_update_writes_database_not_state_json(tmp_path, monkeypatch):
    from app.state import get_performance_metrics, update_performance_metrics
    from app.db.core import get_connection

    _clear_performance_metrics_setting()
    state_file = tmp_path / "state.json"
    state_file.write_text(
        json.dumps({
            "jobs": {},
            "settings": {},
            "performance_metrics": {
                "audiobook_speed_multiplier": 1.0,
                "xtts_cps": 12.0,
                "xtts_render_history": [],
            },
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.state.STATE_FILE", state_file)

    sample = {
        "engine": "xtts",
        "speaker_profile": None,
        "chars": 180,
        "segment_count": 3,
        "render_group_count": 1,
        "duration_seconds": 10.0,
        "cps": 18.0,
        "seconds_per_segment": 6.0,
        "completed_at": 123.0,
    }
    update_performance_metrics(xtts_cps=18.0, xtts_render_history=[sample])

    state_data = json.loads(state_file.read_text(encoding="utf-8"))
    assert "performance_metrics" not in state_data

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", ("performance_metric:xtts_cps",))
        cps_row = cursor.fetchone()
        cursor.execute("SELECT engine, cps, seconds_per_segment FROM render_performance_samples")
        sample_row = cursor.fetchone()

    assert cps_row is not None
    assert float(cps_row["value"]) == 18.0
    assert sample_row is not None
    assert sample_row["engine"] == "xtts"
    assert sample_row["cps"] == 18.0
    assert sample_row["seconds_per_segment"] == 6.0
    assert get_performance_metrics()["xtts_render_history"] == [sample]


def test_performance_metrics_read_migrates_legacy_state_json(tmp_path, monkeypatch):
    from app.state import get_performance_metrics
    from app.db.core import get_connection

    _clear_performance_metrics_setting()
    state_file = tmp_path / "state.json"
    state_file.write_text(
        json.dumps({
            "jobs": {},
            "settings": {},
            "performance_metrics": {
                "audiobook_speed_multiplier": 1.0,
                "xtts_cps": 19.5,
                "xtts_render_history": [{
                    "engine": "xtts",
                    "speaker_profile": None,
                    "chars": 195,
                    "segment_count": 3,
                    "render_group_count": 1,
                    "duration_seconds": 10.0,
                    "cps": 19.5,
                    "seconds_per_segment": 3.33,
                    "completed_at": 124.0,
                }],
            },
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.state.STATE_FILE", state_file)

    metrics = get_performance_metrics()

    assert metrics["xtts_cps"] == 19.5
    assert "performance_metrics" not in json.loads(state_file.read_text(encoding="utf-8"))

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", ("performance_metric:xtts_cps",))
        cps_row = cursor.fetchone()
        cursor.execute("SELECT engine, cps FROM render_performance_samples")
        sample_row = cursor.fetchone()

    assert cps_row is not None
    assert float(cps_row["value"]) == 19.5
    assert sample_row is not None
    assert sample_row["engine"] == "xtts"
    assert sample_row["cps"] == 19.5
