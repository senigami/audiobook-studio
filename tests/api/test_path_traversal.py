import pytest
import os
import uuid
import importlib
from fastapi.testclient import TestClient
from pathlib import Path
from app.core import config

# We need to reload web.py to pick up monkeypatched constants for StaticFiles
@pytest.fixture
def hardened_client(tmp_path, monkeypatch):
    projects_dir = tmp_path / "projects"
    voices_dir = tmp_path / "voices"
    projects_dir.mkdir()
    voices_dir.mkdir()

    monkeypatch.setattr(config, "PROJECTS_DIR", projects_dir)
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)

    # Reload web to ensure StaticFiles mounts use these dirs
    import app.api.web
    importlib.reload(app.api.web)

    return TestClient(app.api.web.app)

@pytest.fixture
def test_data(tmp_path):
    projects_dir = tmp_path / "projects"
    voices_dir = tmp_path / "voices"

    # Create a dummy project
    pid = str(uuid.uuid4())
    p_dir = projects_dir / pid
    p_dir.mkdir()

    # Public assets (subpaths we want to allow)
    m4b_dir = p_dir / "m4b"
    m4b_dir.mkdir()
    (m4b_dir / "book.m4b").write_bytes(b"m4b-content")

    cover_dir = p_dir / "cover"
    cover_dir.mkdir()
    (cover_dir / "cover.jpg").write_bytes(b"jpg-content")

    # Private assets (subpaths we want to block)
    chapters_dir = p_dir / "chapters"
    chapters_dir.mkdir()
    cid = str(uuid.uuid4())
    c_dir = chapters_dir / cid
    c_dir.mkdir()
    (c_dir / "chapter.txt").write_text("secret text")

    backups_dir = p_dir / "backups"
    backups_dir.mkdir()
    (backups_dir / "backup.zip").write_bytes(b"zip-content")

    # Create a dummy voice
    v_name = "TestVoice"
    v_dir = voices_dir / v_name
    v_dir.mkdir()
    def_dir = v_dir / "Default"
    def_dir.mkdir()

    # Public assets (filenames we want to allow)
    (def_dir / "sample.mp3").write_bytes(b"mp3-content")
    (def_dir / "sample.wav").write_bytes(b"wav-content")

    # Private assets (filenames we want to block)
    (def_dir / "profile.json").write_text("{}")
    (def_dir / "latent.pth").write_bytes(b"pth-content")

    return {
        "pid": pid,
        "cid": cid,
        "v_name": v_name
    }

def test_public_project_assets_serve(hardened_client, test_data):
    pid = test_data["pid"]

    # M4B should serve
    res = hardened_client.get(f"/projects/{pid}/m4b/book.m4b")
    assert res.status_code == 200
    assert res.content == b"m4b-content"

    # Cover should serve
    res = hardened_client.get(f"/projects/{pid}/cover/cover.jpg")
    assert res.status_code == 200
    assert res.content == b"jpg-content"

def test_private_project_assets_blocked(hardened_client, test_data):
    pid = test_data["pid"]
    cid = test_data["cid"]

    # Chapter text should NOT serve publicly
    res = hardened_client.get(f"/projects/{pid}/chapters/{cid}/chapter.txt")
    # CURRENT BEHAVIOR: This passes (returns 200) because of broad StaticFiles mount.
    # DESIRED BEHAVIOR: This should be 404.
    assert res.status_code == 404

    # Backups should NOT serve publicly
    res = hardened_client.get(f"/projects/{pid}/backups/backup.zip")
    assert res.status_code == 404

def test_public_voice_assets_serve(hardened_client, test_data):
    v_name = test_data["v_name"]

    # Voice preview should serve
    res = hardened_client.get(f"/out/voices/{v_name}/Default/sample.mp3")
    assert res.status_code == 200
    assert res.content == b"mp3-content"

def test_private_voice_assets_blocked(hardened_client, test_data):
    v_name = test_data["v_name"]

    # profile.json should NOT serve publicly
    res = hardened_client.get(f"/out/voices/{v_name}/Default/profile.json")
    assert res.status_code == 404

    # latent.pth should NOT serve publicly
    res = hardened_client.get(f"/out/voices/{v_name}/Default/latent.pth")
    assert res.status_code == 404

def test_path_traversal_blocked(hardened_client, test_data):
    # Try to go up from a public route
    pid = test_data["pid"]
    res = hardened_client.get(f"/projects/{pid}/m4b/../../{pid}/chapters/{test_data['cid']}/chapter.txt")
    assert res.status_code == 404


def test_project_public_assets_require_canonical_project_id(hardened_client, tmp_path):
    projects_dir = tmp_path / "projects"
    bad_project = projects_dir / "not-a-uuid"
    m4b_dir = bad_project / "m4b"
    cover_dir = bad_project / "cover"
    m4b_dir.mkdir(parents=True)
    cover_dir.mkdir(parents=True)
    (m4b_dir / "book.m4b").write_bytes(b"m4b-content")
    (cover_dir / "cover.jpg").write_bytes(b"jpg-content")

    assert hardened_client.get("/projects/not-a-uuid/m4b/book.m4b").status_code == 404
    assert hardened_client.get("/projects/not-a-uuid/cover/cover.jpg").status_code == 404
