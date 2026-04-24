from fastapi.testclient import TestClient
from app.web import app
from app.state import load_state, put_job
from app.models import Job
import time
import uuid

def test_clear_all_history():
    client = TestClient(app)

    # 1. Add a dummy job first
    jid = uuid.uuid4().hex[:12]
    j = Job(id=jid, engine="xtts", chapter_file="test_clear.txt", status="error", created_at=time.time())
    put_job(j)

    # Verify it exists in state
    state = load_state()
    assert jid in state["jobs"]

    # 2. Call clear
    response = client.post("/api/generation/cancel-all")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    # 3. Verify state is empty
    state = load_state()
    assert state["jobs"] == {}
