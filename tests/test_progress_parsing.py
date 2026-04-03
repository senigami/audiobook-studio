import pytest
import time
import re
from app.models import Job

def test_progress_simulation():
    j = Job(
        id="test",
        engine="xtts",
        chapter_file="test.txt",
        status="running",
        created_at=time.time(),
        progress=0.0
    )

    start = time.time()
    logs = []

    # Simulate on_output
    def simulate_line(line, elapsed_offset=0):
        s = line.strip()
        now = start + elapsed_offset
        elapsed = now - start
        eta = 100
        jid = j.id

        new_progress = None
        new_log = None

        if not s:
            current_p = getattr(j, 'progress', 0.0)
            prog = min(0.98, max(current_p, elapsed / max(1, eta)))

            last_b = getattr(j, '_last_broadcast_time', 0)
            last_p = getattr(j, '_last_broadcast_p', 0.0)
            if (prog - last_p >= 0.01) or (now - last_b >= 30.0):
                prog = round(prog, 2)
                j.progress = prog
                j._last_broadcast_time = now
                j._last_broadcast_p = prog
                return {"progress": prog}
            return None

        # 1. Filter out noisy lines provided by XTTS
        if s.startswith("> Text"): return None
        if s.startswith("> Processing sentence:"): return None
        if s.startswith("['") or s.startswith('["'): return None
        if s.endswith("']") or s.endswith('"]'): return None

        # 2. Only explicit [PROGRESS] lines should drive render progress.
        progress_match = re.search(r'(\d+)%', s)
        is_progress_line = "[PROGRESS]" in s and progress_match
        if is_progress_line:
            try:
                p_val = round(int(progress_match.group(1)) / 100.0, 2)
                current_p = j.progress
                if p_val > current_p:
                    new_progress = p_val
            except (TypeError, ValueError):
                pass

        if not is_progress_line:
            logs.append(line)
            new_log = "".join(logs)[-20000:]

        broadcast_p = getattr(j, '_last_broadcast_p', 0.0)

        if new_progress is None:
            current_p = j.progress
            new_val = min(0.98, max(current_p, elapsed / max(1, eta)))
            new_progress = round(new_val, 2)

        include_progress = (abs(new_progress - broadcast_p) >= 0.01) or (broadcast_p == 0 and new_progress > 0)

        args = {}
        if include_progress:
            j.progress = new_progress
            j._last_broadcast_p = new_progress
            args['progress'] = new_progress

        if new_log is not None:
            args['log'] = new_log

        return args

    # Generic tqdm lines should not be treated as authoritative chapter progress.
    res1 = simulate_line("Synthesizing: 10%|███       |", elapsed_offset=2)
    assert res1.get('progress') == 0.02

    # Time prediction may advance locally, but only from elapsed time.
    res2 = simulate_line("", elapsed_offset=15)
    assert res2.get('progress') == 0.15

    # Another generic tqdm line should not replace chapter progress.
    res3 = simulate_line("Synthesizing: 12%|████      |", elapsed_offset=16)
    assert res3.get('progress') == 0.16
    assert j.progress == 0.16

    # Explicit backend progress lines remain authoritative.
    res4 = simulate_line("[PROGRESS] 20%", elapsed_offset=18)
    assert res4.get('progress') == 0.20
    assert j.progress == 0.20
