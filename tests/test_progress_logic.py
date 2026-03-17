import pytest
import time
from app.jobs import calculate_predicted_progress
from app.models import Job

def test_calculate_predicted_progress_xtts_preparing():
    """XTTS jobs should be capped at prepare_limit if synthesis hasn't started, unless resuming."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="preparing", created_at=0.0)
    job.progress = 0.0

    # 1. Synthesis not started, should hold at current_p (0.0)
    job.synthesis_started_at = None
    now = 100.0
    start = 99.0 # 1s elapsed
    eta = 100

    # Logic changed: now returns current_p (0.0) instead of animating
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.0

    # 2. Progress should STILL be 0.0 even after more time
    now = 110.0 # 11s elapsed
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.0

    # 3. Resumption case: already at 0.10 progress from previous run
    job.progress = 0.10
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.10 # Should not go BACKWARDS to 0.05

def test_calculate_predicted_progress_xtts_running():
    """XTTS jobs should use start_time consistently once synthesis starts."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="running", created_at=0.0)
    job.progress = 0.1
    job.synthesis_started_at = 90.0

    now = 120.0
    start = 80.0 # Adjusted start time (progress 0.1 * eta 100 = 10s offset from 90s? No, adjusted start is the "logical" 0 point)
    eta = 100

    # elapsed = 120 - 80 = 40. 40/100 = 0.4
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.4

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
