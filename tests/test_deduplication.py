from fastapi.testclient import TestClient
from app.web import app
from app.state import get_jobs, clear_all_jobs

def test_deduplication():
    client = TestClient(app)

    # Ensure starting state is empty
    clear_all_jobs()

    # 1. Start XTTS queue
    client.post("/api/generation/resume")
    jobs_v1 = get_jobs()
    [j.chapter_file for j in jobs_v1.values()]
    set(jobs_v1.keys())

    # 2. Start XTTS queue again
    # It should prune the old jobs (which are likely finished/failed unless worker is active)
    # Actually, worker will be active in background if uvicorn is running, but in TestClient it depends.
    client.post("/api/generation/resume")
    jobs_v2 = get_jobs()
    files_v2 = [j.chapter_file for j in jobs_v2.values()]
    set(jobs_v2.keys())

    # There should only be ONE job per file in the final state
    assert len(files_v2) == len(set(files_v2))

    # The IDs should have changed (pruned and replaced) or stayed same if active
    # But since they were likely not started yet, they should have been pruned.
    # The key is that we don't have DUPLICATES for the same file.
    file_counts = {}
    for j in jobs_v2.values():
        file_counts[j.chapter_file] = file_counts.get(j.chapter_file, 0) + 1

    for f, count in file_counts.items():
        assert count == 1, f"Duplicate found for {f}"

def test_clear_with_active_processes():
    client = TestClient(app)
    # Simply verify the endpoint returns correctly
    response = client.post("/api/generation/cancel-all")
    assert response.status_code == 200
    assert "processes stopped" in response.json()["message"]
