"""Tests for W-PAR task 014's `set_engine_cap` single-key-merge helper."""
from __future__ import annotations

import threading

from app.db.state import get_settings, set_engine_cap, update_settings


def test_set_engine_cap_merges_without_clobbering_other_engines():
    update_settings({"tts_engine_caps": {}})

    set_engine_cap("tts_xtts", 2)
    set_engine_cap("tts_voxtral", 1)

    caps = get_settings()["tts_engine_caps"]
    assert caps.get("tts_xtts") == 2
    assert caps.get("tts_voxtral") == 1


def test_set_engine_cap_none_clears_override():
    update_settings({"tts_engine_caps": {"tts_xtts": 3}})

    set_engine_cap("tts_xtts", None)

    assert "tts_xtts" not in get_settings()["tts_engine_caps"]


def test_set_engine_cap_concurrent_writes_for_two_engines_both_survive():
    """Two threads writing DIFFERENT engines' overrides at once must not clobber
    each other — the bug a whole-object `update_settings({"tts_engine_caps": {...}})`
    replace would exhibit."""
    update_settings({"tts_engine_caps": {}})

    barrier = threading.Barrier(2)

    def _write(engine_id: str, cap: int) -> None:
        barrier.wait(timeout=5)
        set_engine_cap(engine_id, cap)

    t1 = threading.Thread(target=_write, args=("tts_xtts", 2))
    t2 = threading.Thread(target=_write, args=("tts_voxtral", 1))
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)

    caps = get_settings()["tts_engine_caps"]
    assert caps.get("tts_xtts") == 2
    assert caps.get("tts_voxtral") == 1
