import pytest
from fastapi.testclient import TestClient
from app.web import app
from app.models import Job

client = TestClient(app)

def test_crud_projects():
    # create
    res = client.post("/api/projects", data={"name": "P1", "series": "S1", "author": "A1"})
    assert res.status_code == 200
    pid = res.json()["project_id"]

    # fetch list
    res = client.get("/api/projects")
    assert any(p["id"] == pid for p in res.json())

    # get one
    res = client.get(f"/api/projects/{pid}")
    assert res.status_code == 200
    assert res.json()["name"] == "P1"

    # update
    res = client.put(f"/api/projects/{pid}", data={"name": "P2"})
    assert res.status_code == 200
    assert client.get(f"/api/projects/{pid}").json()["name"] == "P2"

    # delete
    res = client.delete(f"/api/projects/{pid}")
    assert res.status_code == 200
    assert client.get(f"/api/projects/{pid}").status_code == 404

def test_chapter_endpoints():
    res = client.post("/api/projects", data={"name": "ChapProj"})
    pid = res.json()["project_id"]

    # create chapter
    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "C1", "text_content": "hello world", "sort_order": 0})
    assert res.status_code == 200
    cid = res.json()["chapter"]["id"]

    # get list
    res = client.get(f"/api/projects/{pid}/chapters")
    assert len(res.json()) >= 1

    # updated chapter text
    res = client.put(f"/api/chapters/{cid}", data={"title": "C1", "text_content": "updated world"})
    assert res.status_code == 200

    # test analyze
    res = client.post("/api/analyze_text", json={"text_content": "A" * 500})
    assert res.status_code == 200

    # Add another chapter for reordering
    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "C2", "text_content": "second chapter", "sort_order": 1})
    assert res.status_code == 200
    cid2 = res.json()["chapter"]["id"]

    # test reorder API
    ids_list = [cid2, cid] # reverse order
    import json
    res = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": json.dumps(ids_list)})
    assert res.status_code == 200

    # verify order
    res = client.get(f"/api/projects/{pid}/chapters")
    chapters = res.json()
    assert chapters[0]["id"] == cid2
    assert chapters[1]["id"] == cid

    # reset audio
    res = client.post(f"/api/chapters/{cid}/reset")
    assert res.status_code == 200

    res = client.delete(f"/api/chapters/{cid}")
    assert res.status_code == 200
    res = client.delete(f"/api/chapters/{cid2}")
    assert res.status_code == 200

    res = client.delete(f"/api/projects/{pid}")
    assert res.status_code == 200

def test_missing_entities():
    # missing project
    assert client.get("/api/projects/999").status_code == 404
    client.put("/api/projects/999", data={"name": "x"})
    client.delete("/api/projects/999")

    res = client.get("/api/projects/999/chapters")
    assert res.status_code == 200 # Returns empty list
    assert res.json() == []

    # missing chapter
    pid = client.post("/api/projects", data={"name": "x"}).json()["project_id"]
    assert client.delete("/api/chapters/999").status_code == 404
    client.delete(f"/api/projects/{pid}")

def test_reports():
    res = client.get("/report/missing_report.json")
    assert res.status_code == 404

def test_speaker_endpoints():
    res = client.get("/api/speaker-profiles")
    assert res.status_code == 200

    res = client.delete("/api/speaker-profiles/non_existent")
    assert res.status_code == 404

def test_queue_endpoints():
    res = client.get("/api/jobs")
    assert res.status_code == 200

    res = client.get("/api/processing_queue")
    assert res.status_code == 200

    res = client.post("/queue/pause")
    assert res.status_code in [200, 422, 405]

    res = client.post("/queue/resume")
    assert res.status_code in [200, 422, 405]

    res = client.post("/api/queue/cancel_pending")
    assert res.status_code in [200, 422, 405]

def test_audiobooks_endpoints():
    res = client.get("/api/audiobooks")
    assert res.status_code == 200
    res = client.delete("/api/audiobook/missing")
    assert res.status_code == 404


def test_serves_top_level_frontend_dist_files(monkeypatch, tmp_path):
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    logo_file = dist_dir / "logo.png"
    logo_file.write_bytes(b"fake-image")

    monkeypatch.setattr("app.web.FRONTEND_DIST", dist_dir)

    res = client.get("/logo.png")
    assert res.status_code == 200
    assert res.content == b"fake-image"


def test_serves_nested_frontend_dist_files_with_containment(monkeypatch, tmp_path):
    dist_dir = tmp_path / "dist"
    nested_dir = dist_dir / "images"
    nested_dir.mkdir(parents=True)
    nested_file = nested_dir / "hero.png"
    nested_file.write_bytes(b"hero-image")

    monkeypatch.setattr("app.web.FRONTEND_DIST", dist_dir)

    res = client.get("/images/hero.png")
    assert res.status_code == 200
    assert res.content == b"hero-image"
    assert client.get("/images/../secret.txt").status_code == 404


def test_serves_legacy_output_files_without_precreated_mounts(monkeypatch, tmp_path):
    xtts_dir = tmp_path / "xtts_audio"
    audiobook_dir = tmp_path / "audiobooks"
    cover_dir = tmp_path / "uploads" / "covers"
    xtts_dir.mkdir(parents=True)
    audiobook_dir.mkdir(parents=True)
    cover_dir.mkdir(parents=True)

    (xtts_dir / "clip.wav").write_bytes(b"wav")
    (audiobook_dir / "book.m4b").write_bytes(b"m4b")
    (cover_dir / "cover.jpg").write_bytes(b"jpg")

    monkeypatch.setattr("app.web.XTTS_OUT_DIR", xtts_dir)
    monkeypatch.setattr("app.web.AUDIOBOOK_DIR", audiobook_dir)
    monkeypatch.setattr("app.web.COVER_DIR", cover_dir)

    assert client.get("/out/xtts/clip.wav").status_code == 200
    assert client.get("/out/audiobook/book.m4b").status_code == 200
    assert client.get("/out/covers/cover.jpg").status_code == 200
    assert client.get("/out/xtts/../secrets.txt").status_code == 404
