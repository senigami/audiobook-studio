import pytest
import time
from app.jobs import calculate_predicted_progress
from app.models import Job

def test_calculate_predicted_progress_xtts_preparing():
    """XTTS jobs should be capped at prepare_limit if synthesis hasn't started."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="preparing", created_at=0.0)
    job.progress = 0.0

    # 1. Synthesis not started
    job.synthesis_started_at = None
    now = 100.0
    start = 90.0
    eta = 60

    # Defaults: prepare_limit=0.05, prepare_step=0.005
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.005

    # 2. Progress should climb but cap at 0.05
    job.progress = 0.048
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.05

    job.progress = 0.06
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.05

def test_calculate_predicted_progress_xtts_running():
    """XTTS jobs should use synthesis_started_at when available."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="running", created_at=0.0)
    job.progress = 0.1

    # Synthesis started 10s ago, ETA 100s -> progress should be 0.1
    job.synthesis_started_at = 90.0
    now = 100.0
    start = 50.0 # Worker started much earlier
    eta = 100

    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.1

    # Synthesis started 50s ago -> progress 0.5
    now = 140.0
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.5

def test_calculate_predicted_progress_audiobook_safety():
    """Audiobook jobs should NOT crash when synthesis_started_at is None."""
    job = Job(id="j1", engine="audiobook", chapter_file="b1", status="running", created_at=0.0)
    job.progress = 0.0

    # Root cause of the crash: synthesis_started_at is None
    job.synthesis_started_at = None 
    now = 100.0
    start = 90.0 # Worker started 10s ago
    eta = 100

    # Should use 'start' instead of crashing
    # 10s elapsed / 100s eta = 0.1
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.1

def test_calculate_predicted_progress_finalizing():
    """Progress should freeze during finalizing."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="finalizing", created_at=0.0)
    job.progress = 0.95

    now = 200.0
    start = 100.0
    eta = 50

    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.95

def test_calculate_predicted_progress_caps():
    """Progress should respect the provided limits."""
    job = Job(id="j1", engine="audiobook", chapter_file="b1", status="running", created_at=0.0)
    job.progress = 0.0

    now = 1000.0
    start = 100.0 # 900s elapsed
    eta = 100     # 900% progress vs eta

    # Should cap at 0.85 by default
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.85

    # Custom limit
    res = calculate_predicted_progress(job, now, start, eta, limit=0.99)
    assert res == 0.99

def test_calculate_predicted_progress_regression_protection():
    """Progress should never move backwards."""
    job = Job(id="j1", engine="audiobook", chapter_file="b1", status="running", created_at=0.0)
    job.progress = 0.8 # Already at 80%

    now = 110.0
    start = 100.0 # 10s elapsed
    eta = 100     # 10% calculated progress

    # Should return current_p (0.8) instead of calculated (0.1)
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.8
