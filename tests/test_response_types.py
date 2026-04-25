from fastapi.testclient import TestClient
from app.web import app

def test_queue_start_not_redirect():
    client = TestClient(app, follow_redirects=False)
    # This should return JSON now, not a redirect
    response = client.post("/api/generation/resume")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_pause_not_redirect():
    client = TestClient(app, follow_redirects=False)
    response = client.post("/api/generation/pause")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
