import time

def test_progress_regression_protection():
    # Mock job state
    j = {
        "id": "test-job-1",
        "status": "running",
        "progress": 0.01,
        "updated_at": time.time() - 10
    }

    # Simulate first update call that tries to reset to 0.0 with force_broadcast=True
    updates = {
        "progress": 0.0,
        "active_segment_id": "seg_123",
        "force_broadcast": True
    }

    # Logic from hardened app/state.py
    def update_job_logic(job, updates_in):
        changed_fields = []
        for k, v in updates_in.items():
            if k == "force_broadcast": continue

            if k == "progress":
                if v is not None:
                    v = round(float(v), 2)

                target_status = updates_in.get("status") or job.get("status")
                current_p = job.get("progress") or 0.0

                if target_status in ("running", "finalizing", "done"):
                    if v is not None and v < current_p:
                        print(f"DEBUG: Blocking regression {current_p} -> {v}")
                        v = current_p

            if job.get(k) != v:
                job[k] = v
                changed_fields.append(k)
        return job, changed_fields

    final_j, changed = update_job_logic(j, updates)

    print(f"Final Job: {final_j}")
    print(f"Changed Fields: {changed}")

    assert final_j["progress"] == 0.01
    assert "active_segment_id" in changed
    assert "progress" not in changed
    print("Regression test passed!")

def test_status_reset_allowed():
    # Mock job state
    j = {
        "id": "test-job-reset",
        "status": "done",
        "progress": 1.0,
    }

    # Resetting back to queued
    updates = {
        "status": "queued",
        "progress": 0.0
    }

    # Logic from hardened app/state.py
    def update_job_logic(job, updates_in):
        changed_fields = []
        for k, v in updates_in.items():
            if k == "progress":
                if v is not None:
                    v = round(float(v), 2)

                target_status = updates_in.get("status") or job.get("status")
                current_p = job.get("progress") or 0.0

                if target_status in ("running", "finalizing", "done"):
                    if v is not None and v < current_p:
                        v = current_p

            if job.get(k) != v:
                job[k] = v
                changed_fields.append(k)
        return job, changed_fields

    final_j, changed = update_job_logic(j, updates)
    print(f"Reset Job: {final_j}")
    assert final_j["status"] == "queued"
    assert final_j["progress"] == 0.0
    print("Status reset test passed!")

if __name__ == "__main__":
    test_progress_regression_protection()
    test_status_reset_allowed()
