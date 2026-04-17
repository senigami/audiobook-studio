import time
from dataclasses import dataclass, asdict
from typing import Optional, List, Literal

# Mock models
Engine = Literal["xtts", "voxtral", "mixed", "audiobook", "voice_build", "voice_test"]
Status = Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]

@dataclass
class Job:
    id: str
    engine: Engine
    chapter_file: str
    status: Status
    created_at: float
    progress: float = 0.0
    eta_seconds: Optional[int] = None
    eta_basis: Optional[str] = None
    estimated_end_at: Optional[float] = None
    updated_at: Optional[float] = None

def test_eta_hardening():
    now = time.time()
    j = {
        "id": "test-1",
        "status": "running",
        "progress": 0.1,
        "eta_seconds": None,
        "eta_basis": None,
        "estimated_end_at": None,
        "updated_at": now - 10
    }

    updates = {"eta_seconds": 100}
    changed_fields = ["eta_seconds"]

    # Logic from state.py
    if "eta_seconds" in changed_fields or "eta_seconds" in updates:
        eta_val = updates.get("eta_seconds") if "eta_seconds" in updates else j.get("eta_seconds")
        if eta_val is not None:
            if (updates.get("eta_basis") or j.get("eta_basis")) is None:
                j["eta_basis"] = "remaining_from_update"
                updates["eta_basis"] = "remaining_from_update"
                if "eta_basis" not in changed_fields:
                    changed_fields.append("eta_basis")

            if (updates.get("eta_basis") or j.get("eta_basis")) == "remaining_from_update":
                if (updates.get("estimated_end_at") or j.get("estimated_end_at")) is None or "eta_seconds" in changed_fields:
                    anchor = updates.get("updated_at") or j.get("updated_at") or time.time()
                    end_at = float(anchor) + float(eta_val)
                    j["estimated_end_at"] = end_at
                    updates["estimated_end_at"] = end_at
                    if "estimated_end_at" not in changed_fields:
                        changed_fields.append("estimated_end_at")

    print(f"Results: {j}")
    assert j["eta_basis"] == "remaining_from_update"
    assert j["estimated_end_at"] == j["updated_at"] + 100
    print("Test passed!")

if __name__ == "__main__":
    test_eta_hardening()
