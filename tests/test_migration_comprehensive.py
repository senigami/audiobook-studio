import pytest
import json
import time
from pathlib import Path
from app.migration import migrate_performance_metrics, migrate_settings, ensure_state_migrated

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
    assert migrated["audiobook_speed_multiplier"] == 1.1

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
        "settings": {"xtts_speed": 1.0},
        "performance_metrics": {"xtts_cps": 10.0}
    }
    # Mock _record_legacy_performance_history_to_db to avoid DB dependency in this unit test
    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("app.migration._record_legacy_performance_history_to_db", lambda x: None)
        changed = ensure_state_migrated(state)

    assert changed is True
    assert "xtts_speed" not in state["settings"]
    assert "performance_metrics" not in state # History migration removes the whole blob
