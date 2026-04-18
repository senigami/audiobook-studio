import pytest
from app.jobs.core import _estimate_seconds
from app.models import Job

def test_conservative_estimate_short_chapter():
    """A short 2-segment chapter should have a conservative ETA > 10s."""
    cps = 16.0
    text_chars = 100 # Very short
    # Naive chars/cps would be ~6.25s

    # 2 segment groups
    eta = _estimate_seconds(text_chars, cps, group_count=2)

    # base_eta (6) + group_overhead (2*3=6) + start_overhead (4) = 16s
    assert eta >= 15
    assert eta <= 18

def test_conservative_estimate_single_segment():
    """A single segment chapter should still have start overhead."""
    cps = 16.0
    text_chars = 160 # 10s base

    eta = _estimate_seconds(text_chars, cps, group_count=1)

    # base_eta (10) + group_overhead (3) + start_overhead (4) = 17s
    assert eta >= 16
    assert eta <= 18

def test_conservative_estimate_high_segment_count():
    """Overhead should scale with segment count."""
    cps = 16.0
    text_chars = 1600 # 100s base

    # 10 segments
    eta = _estimate_seconds(text_chars, cps, group_count=10)

    # base_eta (100) + group_overhead (10*3=30) + start_overhead (4) = 134s
    assert eta >= 130
    assert eta <= 140

def test_broadcast_job_updated_startup_contract(monkeypatch):
    """[START_SYNTHESIS] contract: running/0.0 + conservative ETA."""
    from app.api.ws import broadcast_job_updated
    import time

    messages = []
    class DummyManager:
        def broadcast(self, message):
            messages.append(message)

    monkeypatch.setattr("app.api.ws.manager", DummyManager())

    job_id = "job-startup-test"
    now = time.time()

    broadcast_job_updated(
        job_id,
        {
            "status": "running",
            "progress": 0.0,
            "started_at": now,
            "eta_seconds": 25,
            "eta_basis": "remaining_from_update",
            "estimated_end_at": now + 25
        },
        {"status": "running", "progress": 0.0, "started_at": now}
    )

    # Assert normalized studio_job_event
    event = next(m for m in messages if m["type"] == "studio_job_event")
    assert event["status"] == "running"
    assert event["progress"] == 0.0
    assert event["eta_seconds"] == 25
    assert event["eta_basis"] == "remaining_from_update"
    assert "estimated_end_at" in event

def test_robust_params_empty_history():
    from app.jobs.core import get_robust_eta_params
    params = get_robust_eta_params([], 16.7)
    assert params is None

def test_robust_params_with_outliers():
    from app.jobs.core import get_robust_eta_params
    history = [
        {"cps": 10, "seconds_per_segment": 2},
        {"cps": 15, "seconds_per_segment": 3},
        {"cps": 16, "seconds_per_segment": 3},
        {"cps": 17, "seconds_per_segment": 3},
        {"cps": 18, "seconds_per_segment": 3},
        {"cps": 20, "seconds_per_segment": 4},
        {"cps": 100, "seconds_per_segment": 20}, # Poisonous outlier
    ]
    cps, sps, start = get_robust_eta_params(history, 16.7)

    # Trimmed mean should ignore 10 and 100
    expected_cps = (15 + 16 + 17 + 18 + 20) / 5
    assert cps == expected_cps
    assert sps == (3 + 3 + 3 + 3 + 4) / 5

def test_history_params_do_not_double_count_character_and_segment_time():
    from app.jobs.core import _estimate_seconds, get_robust_eta_params

    history = [
        {"cps": 20, "seconds_per_segment": 5},
        {"cps": 20, "seconds_per_segment": 5},
        {"cps": 20, "seconds_per_segment": 5},
    ]

    robust_params = get_robust_eta_params(history, 16.7)

    # Character model says 50s; segment model says 50s. The robust model should
    # choose a stable lane around 54s including startup overhead, not add both
    # together into a bogus ~104s estimate.
    assert _estimate_seconds(1000, 16.7, group_count=10, robust_params=robust_params) == 54

def test_robust_params_bounded_history(monkeypatch):
    from app.jobs.worker import _record_xtts_sample
    import time

    job = Job(id="j1", engine="xtts", chapter_file="c1", status="done", created_at=0)
    job.synthesis_started_at = time.time() - 10
    job.finished_at = time.time()

    captured = {}
    perf = {"xtts_render_history": [{"cps": 10, "seconds_per_segment": 2}] * 29}
    monkeypatch.setattr("app.jobs.worker.get_jobs", lambda: {"j1": job})
    monkeypatch.setattr("app.jobs.worker.get_performance_metrics", lambda: perf)
    monkeypatch.setattr("app.jobs.worker.update_performance_metrics", lambda **updates: captured.update(updates))

    _record_xtts_sample(job, time.time() - 20, 100, perf)

    # Should have exactly 30 samples, not 31
    assert len(captured["xtts_render_history"]) == 30

def test_cancelled_jobs_do_not_train_history(monkeypatch):
    from app.jobs.worker import _record_xtts_sample
    import time

    job = Job(id="j1", engine="xtts", chapter_file="c1", status="cancelled", created_at=0)
    job.synthesis_started_at = time.time() - 10
    job.finished_at = time.time()

    captured = {}
    monkeypatch.setattr("app.jobs.worker.get_jobs", lambda: {"j1": job})
    monkeypatch.setattr("app.jobs.worker.get_performance_metrics", lambda: {"xtts_render_history": []})
    monkeypatch.setattr("app.jobs.worker.update_performance_metrics", lambda **updates: captured.update(updates))

    _record_xtts_sample(job, time.time() - 20, 100, {"xtts_render_history": []})

    assert captured == {}

def test_running_jobs_do_not_train_history(monkeypatch):
    from app.jobs.worker import _record_xtts_sample
    import time

    job = Job(id="j1", engine="xtts", chapter_file="c1", status="running", created_at=0)
    job.synthesis_started_at = time.time() - 10

    captured = {}
    monkeypatch.setattr("app.jobs.worker.get_jobs", lambda: {"j1": job})
    monkeypatch.setattr("app.jobs.worker.get_performance_metrics", lambda: {"xtts_render_history": []})
    monkeypatch.setattr("app.jobs.worker.update_performance_metrics", lambda **updates: captured.update(updates))

    _record_xtts_sample(job, time.time() - 20, 100, {"xtts_render_history": []})

    assert captured == {}

def test_record_xtts_sample_uses_persisted_done_job_and_finished_clock(monkeypatch):
    from app.jobs.worker import _record_xtts_sample

    stale_job = Job(id="j1", engine="xtts", chapter_file="c1", status="running", created_at=0)
    stale_job.synthesis_started_at = 10

    persisted_job = Job(id="j1", engine="xtts", chapter_file="c1", status="done", created_at=0)
    persisted_job.synthesis_started_at = 100
    persisted_job.finished_at = 160
    persisted_job.chapter_id = "chapter-1"

    captured = {}
    perf = {"xtts_cps": 16.7, "xtts_render_history": []}
    monkeypatch.setattr("app.jobs.worker.get_jobs", lambda: {"j1": persisted_job})
    monkeypatch.setattr("app.jobs.worker.get_performance_metrics", lambda: perf)
    monkeypatch.setattr("app.jobs.worker.update_performance_metrics", lambda **updates: captured.update(updates))

    _record_xtts_sample(stale_job, 0, 600, perf, source_segment_count=3)

    sample = captured["xtts_render_history"][0]
    assert sample["duration_seconds"] == 60
    assert sample["cps"] == 10
    assert sample["seconds_per_segment"] == 20
    assert sample["segment_count"] == 3
    assert sample["completed_at"] == 160
