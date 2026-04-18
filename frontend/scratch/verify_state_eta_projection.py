import time
import math

def test_eta_projection():
    now = time.time()
    started_at = now - 60  # Elapsed 60s
    progress = 0.1         # 10%

    # We expect remaining = 60 * (1 - 0.1) / 0.1 = 60 * 9 / 1 = 540s

    j = {
        "id": "test-1",
        "status": "running",
        "progress": progress,
        "started_at": started_at,
        "updated_at": now - 1,
        "eta_seconds": None,
        "eta_basis": None,
        "estimated_end_at": None
    }

    updates = {"progress": 0.1} # Progress update
    changed_fields = []

    # Simulate update_job logic
    event_updated_at = float(updates.get("updated_at") or time.time())
    status = updates.get("status") or j.get("status")
    progress = updates.get("progress") if "progress" in updates else j.get("progress")
    started_at = updates.get("started_at") or j.get("started_at")

    if "eta_seconds" in updates:
        pass # Explicitly set in the real code
    elif status == "running" and started_at and progress is not None and 0.03 <= progress < 0.98:
        elapsed = event_updated_at - started_at
        if elapsed > 1:
            remaining = math.ceil(elapsed * (1 - progress) / progress)
            if 1 <= remaining <= 86400:
                j["eta_seconds"] = remaining
                updates["eta_seconds"] = remaining
                j["eta_basis"] = "remaining_from_update"
                updates["eta_basis"] = "remaining_from_update"
                end_at = event_updated_at + remaining
                j["estimated_end_at"] = end_at
                updates["estimated_end_at"] = end_at
                for k in ("eta_seconds", "eta_basis", "estimated_end_at"):
                    if k not in changed_fields:
                        changed_fields.append(k)

    print(f"Results: {j}")
    print(f"Updates: {updates}")
    assert updates["eta_seconds"] == 540
    assert updates["eta_basis"] == "remaining_from_update"
    print("Projection Test passed!")

if __name__ == "__main__":
    test_eta_projection()
