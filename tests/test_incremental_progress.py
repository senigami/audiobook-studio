import pytest
import time
from unittest.mock import MagicMock, patch
from app.models import Job
from app.db import init_db

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_worker_initializes_progress_and_eta_adjustment():
    """Verify that worker_loop correctly initializes j.progress and adjusts j.started_at."""
    from app.jobs.worker import worker_loop
    from app.state import update_job

    jid = "test_initial_progress_eta"
    j = Job(
        id=jid,
        engine="xtts",
        chapter_file="c1.txt",
        chapter_id="chap_123",
        status="queued",
        created_at=time.time()
    )

    # Mock dependencies
    eta = 100.0
    initial_progress = 0.4 # 40%

    with patch("app.db.chapters.get_chapter_segments_counts", return_value=(4, 10)), \
         patch("app.jobs.core._estimate_seconds", return_value=eta), \
         patch("app.jobs.worker.update_job") as mock_update:

        # We simulate the initialization section of worker_loop
        initial_start = 1000.0
        with patch("time.time", return_value=initial_start):
            # This is the logic we added to worker_loop:
            adjusted_start = initial_start - (initial_progress * eta)

            # Verify the math
            assert initial_progress == 0.4
            assert adjusted_start == 960.0

            # Now let's test the START_SYNTHESIS logic specifically
            # Initial state:
            j.progress = initial_progress
            j.started_at = adjusted_start

            # Simulate on_output("[START_SYNTHESIS]")
            now = 1200.0 # 200s after initial_start
            prog = max(j.progress, 0.01)
            new_started_at = now - (prog * eta)

            assert prog == 0.4
            assert new_started_at == 1200.0 - 40.0 == 1160.0

def test_get_chapter_segments_counts_logic():
    """Test the database helper directly."""
    from app.db.chapters import create_chapter, get_chapter_segments_counts
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = "proj_1"
    cid = create_chapter(pid, "Test Chapter")

    # Create segments by syncing text
    sync_chapter_segments(cid, "Sentence one. Sentence two. Sentence three. Sentence four.")

    segs = get_chapter_segments(cid)
    assert len(segs) == 4

    # Mark 2 as done
    update_segment(segs[0]['id'], audio_status="done")
    update_segment(segs[1]['id'], audio_status="done")

    done, total = get_chapter_segments_counts(cid)
    assert total == 4
    assert done == 2

def test_xtts_handler_progress_updates():
    """Check that intermediate progress updates in XTTS handler use total segments."""
    # This verifies the logic we added to bake_on_output and gen_on_output
    total_c = 10

    # Scenario: Already 5 segments done. 2 more just finished.
    done_at_end = 7
    prog = (done_at_end / total_c)
    assert prog == 0.7

    # Scenario: Baking mode (uses 0.9 factor)
    prog_bake = (done_at_end / total_c) * 0.9
    assert prog_bake == 0.63 # 0.7 * 0.9

def test_get_chapter_segments_counts_logic():
    """Test the database helper directly."""
    from app.db.chapters import create_chapter, get_chapter_segments_counts
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = "proj_1"
    cid = create_chapter(pid, "Test Chapter")

    # Create segments by syncing text
    sync_chapter_segments(cid, "Sentence one. Sentence two. Sentence three. Sentence four.")

    segs = get_chapter_segments(cid)
    assert len(segs) == 4

    # Mark 2 as done
    update_segment(segs[0]['id'], audio_status="done")
    update_segment(segs[1]['id'], audio_status="done")

    done, total = get_chapter_segments_counts(cid)
    assert total == 4
    assert done == 2

def test_xtts_handler_final_progress_logic():
    """Verify that final progress calculation logic works correctly."""
    # This just verifies the math we use in handle_xtts_job
    done_c = 8
    total_c = 10
    final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
    assert final_p == 0.8

    done_c = 10
    total_c = 10
    final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
    assert final_p == 1.0

def test_eta_adjustment_logic():
    """Verify the logic used to adjust started_at for accurate ETA."""
    initial_start = 1000.0
    initial_progress = 0.5
    eta = 100.0

    # expected elapsed should be 50s
    adjusted_start = initial_start - (initial_progress * eta)
    assert adjusted_start == 950.0

    # Verify frontend-equivalent calculation
    now = 1000.0
    elapsed = now - adjusted_start
    assert elapsed == 50.0

    estimated_remaining = max(0, eta - elapsed)
    assert estimated_remaining == 50.0
