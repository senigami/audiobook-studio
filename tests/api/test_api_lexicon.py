"""API CRUD tests for /projects/{project_id}/lexicon.

TDD: written before implementation. R1: must fail before code exists.
Uses the session conftest DB and TestClient (same pattern as test_api_projects.py).
"""

import pytest
from fastapi.testclient import TestClient
from app.api.web import app as fastapi_app
from app.db.projects import create_project


@pytest.fixture
def client():
    return TestClient(fastapi_app)


@pytest.fixture
def project_id(clean_storage):
    return create_project("LexiconTestProject")


# ---------------------------------------------------------------------------
# GET list
# ---------------------------------------------------------------------------

def test_get_lexicon_empty(client, project_id):
    response = client.get(f"/api/projects/{project_id}/lexicon")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["entries"] == []


def test_get_lexicon_unknown_project(client, clean_storage):
    response = client.get("/api/projects/nonexistent-project-id/lexicon")
    # Returns 404 because project doesn't exist
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST create
# ---------------------------------------------------------------------------

def test_create_lexicon_entry(client, project_id):
    response = client.post(
        f"/api/projects/{project_id}/lexicon",
        data={"word": "cat", "replacement": "kitten"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "id" in data

    # Verify it appears in GET
    resp2 = client.get(f"/api/projects/{project_id}/lexicon")
    entries = resp2.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["word"] == "cat"
    assert entries[0]["replacement"] == "kitten"


def test_create_multiple_entries(client, project_id):
    client.post(f"/api/projects/{project_id}/lexicon", data={"word": "cat", "replacement": "kitten"})
    client.post(f"/api/projects/{project_id}/lexicon", data={"word": "dog", "replacement": "puppy"})
    resp = client.get(f"/api/projects/{project_id}/lexicon")
    assert len(resp.json()["entries"]) == 2


def test_create_entry_missing_word_returns_422(client, project_id):
    response = client.post(
        f"/api/projects/{project_id}/lexicon",
        data={"replacement": "kitten"},
    )
    assert response.status_code == 422


def test_create_entry_missing_replacement_returns_422(client, project_id):
    response = client.post(
        f"/api/projects/{project_id}/lexicon",
        data={"word": "cat"},
    )
    assert response.status_code == 422


def test_create_duplicate_word_returns_400(client, project_id):
    """apply_lexicon() chains entries as sequential substitutions, so two
    entries for the same word (case-insensitive) can silently double-replace
    text. Reject the duplicate at the API layer with a clear error."""
    client.post(f"/api/projects/{project_id}/lexicon", data={"word": "read", "replacement": "red"})

    response = client.post(
        f"/api/projects/{project_id}/lexicon",
        data={"word": "Read", "replacement": "reed"},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["status"] == "error"
    assert "already exists" in data["message"]

    # No second entry was created.
    entries = client.get(f"/api/projects/{project_id}/lexicon").json()["entries"]
    assert len(entries) == 1
    assert entries[0]["replacement"] == "red"


# ---------------------------------------------------------------------------
# PUT update
# ---------------------------------------------------------------------------

def test_update_lexicon_entry(client, project_id):
    create_resp = client.post(
        f"/api/projects/{project_id}/lexicon",
        data={"word": "cat", "replacement": "kitten"},
    )
    eid = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/projects/{project_id}/lexicon/{eid}",
        data={"word": "feline", "replacement": "fluffy cat"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "ok"

    entries = client.get(f"/api/projects/{project_id}/lexicon").json()["entries"]
    assert entries[0]["word"] == "feline"
    assert entries[0]["replacement"] == "fluffy cat"


def test_update_nonexistent_entry_returns_404(client, project_id):
    response = client.put(
        f"/api/projects/{project_id}/lexicon/nonexistent-id",
        data={"word": "x", "replacement": "y"},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

def test_delete_lexicon_entry(client, project_id):
    create_resp = client.post(
        f"/api/projects/{project_id}/lexicon",
        data={"word": "cat", "replacement": "kitten"},
    )
    eid = create_resp.json()["id"]

    del_resp = client.delete(f"/api/projects/{project_id}/lexicon/{eid}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "ok"

    entries = client.get(f"/api/projects/{project_id}/lexicon").json()["entries"]
    assert len(entries) == 0


def test_delete_nonexistent_entry_returns_404(client, project_id):
    response = client.delete(f"/api/projects/{project_id}/lexicon/nonexistent-id")
    assert response.status_code == 404
