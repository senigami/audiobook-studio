"""PERF-1: state.json copy-on-write in-memory cache.

Covers the behaviours that make the cache safe to introduce over a live,
concurrently-accessed job store:
  * repeated reads don't re-parse the file (the actual perf win);
  * a write is immediately visible and doesn't leave a stale cache;
  * a mid-mutation exception leaves committed state (disk + cache) untouched
    (the pre-cache safety guarantee);
  * an external file change or a STATE_FILE path switch forces a reload;
  * a reader (get_settings) cannot corrupt the shared cache via nested-dict
    aliasing in _normalize_settings.
"""
import json
import threading

import pytest

import app.db.state_helpers as sh
from app.db.state import update_job, put_job, get_jobs, get_settings, update_settings
from app.db.models import Job


@pytest.fixture
def state_file(tmp_path, monkeypatch):
    """Point the state store at a fresh temp file and clear the cache."""
    import app.db.state as state_module
    p = tmp_path / "state.json"
    p.write_text(json.dumps({"jobs": {}, "settings": {}}), encoding="utf-8")
    monkeypatch.setattr(state_module, "STATE_FILE", p, raising=False)
    monkeypatch.setattr(sh, "STATE_FILE", p, raising=False)
    with sh._STATE_LOCK:
        sh._invalidate_state_cache()
    yield p
    with sh._STATE_LOCK:
        sh._invalidate_state_cache()


def _mk_job(jid="j1", **kw):
    return Job(
        id=jid,
        status=kw.pop("status", "queued"),
        created_at=kw.pop("created_at", 1.0),
        engine=kw.pop("engine", "xtts"),
        **kw,
    )


def test_repeated_reads_parse_file_once(state_file, monkeypatch):
    put_job(_mk_job())  # populates cache via commit
    calls = {"n": 0}
    real_loads = json.loads

    def counting_loads(s, *a, **k):
        calls["n"] += 1
        return real_loads(s, *a, **k)

    monkeypatch.setattr(sh, "json", type("J", (), {"loads": staticmethod(counting_loads), "dumps": staticmethod(json.dumps)}))
    # Two reads, no intervening write → the file must not be parsed again.
    get_jobs()
    get_jobs()
    assert calls["n"] == 0, "cached reads must not re-parse state.json"


def test_write_is_visible_and_not_stale(state_file):
    put_job(_mk_job(jid="j1", status="queued"))
    update_job("j1", status="running")
    assert get_jobs()["j1"].status == "running"


def test_midmutation_exception_leaves_state_untouched(state_file, monkeypatch):
    put_job(_mk_job(jid="j1", status="running", progress=0.5))
    baseline = get_jobs()["j1"].progress

    # Make the commit fail AFTER the in-memory (copy) mutation would have happened.
    def boom(*a, **k):
        raise OSError("disk full")

    real_write = sh._atomic_write_text
    monkeypatch.setattr(sh, "_atomic_write_text", boom)
    with pytest.raises(OSError):
        update_job("j1", progress=0.9, force_broadcast=True)
    # Restore ONLY the write fn (not monkeypatch.undo(), which would also revert
    # the fixture's STATE_FILE path and read the wrong file).
    monkeypatch.setattr(sh, "_atomic_write_text", real_write)
    # Cache must still reflect the pre-mutation value (mutation happened on a copy).
    assert get_jobs()["j1"].progress == baseline


def test_external_file_change_triggers_reload(state_file):
    put_job(_mk_job(jid="j1", status="queued"))
    get_jobs()  # prime cache
    # Simulate an out-of-band writer (e.g. migration) replacing the file.
    state_file.write_text(json.dumps({"jobs": {"jX": {"id": "jX", "status": "done", "created_at": 2.0, "engine": "xtts"}}, "settings": {}}), encoding="utf-8")
    jobs = get_jobs()
    assert "jX" in jobs and "j1" not in jobs


def test_path_switch_reloads(state_file, tmp_path, monkeypatch):
    put_job(_mk_job(jid="j1"))
    get_jobs()
    import app.db.state as state_module
    p2 = tmp_path / "other_state.json"
    p2.write_text(json.dumps({"jobs": {"jZ": {"id": "jZ", "status": "queued", "created_at": 3.0, "engine": "xtts"}}, "settings": {}}), encoding="utf-8")
    monkeypatch.setattr(state_module, "STATE_FILE", p2, raising=False)
    monkeypatch.setattr(sh, "STATE_FILE", p2, raising=False)
    assert "jZ" in get_jobs() and "j1" not in get_jobs()


def test_get_settings_does_not_corrupt_cached_enabled_plugins(state_file):
    # An enabled plugin missing a required setting: _normalize_settings would
    # disable it in `enabled_plugins`. That must NOT mutate the shared cache.
    update_settings({"enabled_plugins": {"xtts": True}})
    with sh._STATE_LOCK:
        before = dict(sh._load_state_no_lock()["settings"].get("enabled_plugins", {}))
    get_settings()
    get_settings()
    with sh._STATE_LOCK:
        after = dict(sh._load_state_no_lock()["settings"].get("enabled_plugins", {}))
    assert before == after, "get_settings must not mutate the cached enabled_plugins map"


def test_concurrent_readers_and_writers_stay_coherent(state_file):
    put_job(_mk_job(jid="j1", status="queued"))
    errors = []

    def writer():
        try:
            for i in range(50):
                update_job("j1", progress=round((i % 100) / 100.0, 2), force_broadcast=True)
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    def reader():
        try:
            for _ in range(50):
                _ = get_jobs().get("j1")
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=writer), threading.Thread(target=reader), threading.Thread(target=reader)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, f"concurrent access raised: {errors}"
    assert "j1" in get_jobs()
