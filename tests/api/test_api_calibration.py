import os
import pytest
import uuid
import time
from app.db.core import init_db
from app.db.performance import record_render_sample, get_render_history

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / f"test_project_{uuid.uuid4().hex}.db"
    studio_db_path = tmp_path / f"test_studio_{uuid.uuid4().hex}.db"
    os.environ["DB_PATH"] = str(db_path)
    os.environ["STUDIO_DB_PATH"] = str(studio_db_path)

    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()

    yield db_path

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

def test_engine_calibration_reset_endpoint(clean_db, client):
    from app.db.core import get_studio_connection

    # Write a general setting and derived performance cache settings to studio.db
    with get_studio_connection() as conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ("general_test_setting", "preserve_me"))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ("performance_metric:cps:engine-a", "12.5"))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ("performance_metric:audiobook_speed_multiplier", "1.5"))
        conn.commit()

    # Log some samples for engine-a and engine-b
    now = time.time()
    record_render_sample(
        engine="engine-a",
        tts_model="model-a",
        chars=1000,
        segment_count=5,
        synthesis_duration_seconds=50.0,
        completed_at=now,
    )
    record_render_sample(
        engine="engine-b",
        tts_model="model-b",
        chars=500,
        segment_count=2,
        synthesis_duration_seconds=25.0,
        completed_at=now,
    )

    assert len(get_render_history()) == 2

    # Reset calibration for engine-a
    response = client.post("/api/engines/engine-a/calibrate/reset")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "engine_id": "engine-a"}

    # Assert engine-a samples are deleted, but engine-b remains
    history = get_render_history()
    assert len(history) == 1
    assert history[0]["engine"] == "engine-b"

    # Assert general setting is still intact
    with get_studio_connection() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", ("general_test_setting",)).fetchone()
        assert row is not None
        val = row["value"] if hasattr(row, "keys") else row[0]
        assert val == "preserve_me"

        # Assert derived cache settings are deleted
        row_cps = conn.execute("SELECT value FROM settings WHERE key = ?", ("performance_metric:cps:engine-a",)).fetchone()
        assert row_cps is None
        row_speed = conn.execute("SELECT value FROM settings WHERE key = ?", ("performance_metric:audiobook_speed_multiplier",)).fetchone()
        assert row_speed is None

    # Test invalid engine_id validation / SQL injection protection
    response = client.post("/api/engines/engine-a;DROP TABLE settings;/calibrate/reset")
    assert response.status_code == 400 or response.status_code == 404

