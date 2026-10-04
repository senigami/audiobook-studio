"""An unset global parallel cap stays unset on disk; stored values are never rewritten."""
from __future__ import annotations

import json

import pytest

from app.db import state
from app.db.state_settings import get_settings, update_settings


@pytest.fixture
def state_file(tmp_path, monkeypatch):
    path = tmp_path / "state.json"
    monkeypatch.setattr(state, "STATE_FILE", path)
    return path


def _raw_settings(path):
    return json.loads(path.read_text())["settings"]


def test_unset_cap_is_not_written(state_file):
    state_file.write_text(json.dumps({"settings": {"safe_mode": True}}))
    update_settings({"safe_mode": False})
    assert "tts_parallel_cap" not in _raw_settings(state_file)
    assert "tts_parallel_cap" not in get_settings()


@pytest.mark.parametrize("saved", [1, 2, 3])
def test_existing_saved_cap_is_never_rewritten(state_file, saved):
    state_file.write_text(json.dumps({"settings": {"safe_mode": True, "tts_parallel_cap": saved}}))
    assert get_settings()["tts_parallel_cap"] == saved
    update_settings({"safe_mode": False})
    assert _raw_settings(state_file)["tts_parallel_cap"] == saved


def test_unreadable_cap_becomes_unset(state_file):
    state_file.write_text(json.dumps({"settings": {"safe_mode": True, "tts_parallel_cap": "abc"}}))
    assert "tts_parallel_cap" not in get_settings()
