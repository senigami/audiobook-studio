import pytest
from fastapi.testclient import TestClient
import os
from app.db.core import init_db
from app.api.web import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_chapters_assets.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def _make_project_and_chapter(client):
    pid = client.post("/api/projects", data={"name": "P1"}).json()["project_id"]
    cid = client.post(
        f"/api/projects/{pid}/chapters", data={"title": "C1", "text_content": "Some text"}
    ).json()["chapter"]["id"]
    return pid, cid


def test_export_video_chapter_not_found(clean_db, client):
    res = client.post("/api/chapters/00000000-0000-0000-0000-000000000000/export-video")
    assert res.status_code == 404


def test_export_video_no_audio(clean_db, client):
    from unittest.mock import patch
    pid, cid = _make_project_and_chapter(client)
    with patch(
        "app.api.routers.chapters_assets.config.resolve_chapter_asset_path",
        return_value=None,
    ):
        res = client.post(f"/api/chapters/{cid}/export-video?project_id={pid}")
    assert res.status_code == 404
    assert "audio" in res.json()["message"].lower()


def test_export_video_ffmpeg_missing(clean_db, client, tmp_path):
    from unittest.mock import patch
    from app.engines.video_utils import FFMPEG_MISSING_RC
    pid, cid = _make_project_and_chapter(client)
    fake_wav = tmp_path / "c.wav"
    fake_wav.write_bytes(b"RIFF....")
    with patch(
        "app.api.routers.chapters_assets.config.resolve_chapter_asset_path",
        return_value=fake_wav,
    ), patch(
        "app.engines.video_utils.generate_video_sample",
        return_value=FFMPEG_MISSING_RC,
    ):
        res = client.post(f"/api/chapters/{cid}/export-video?project_id={pid}")
    assert res.status_code == 503
    assert "ffmpeg" in res.json()["message"].lower()


def test_export_video_success_returns_mp4(clean_db, client, tmp_path):
    from unittest.mock import patch
    pid, cid = _make_project_and_chapter(client)
    fake_wav = tmp_path / "c.wav"
    fake_wav.write_bytes(b"RIFF....")

    def _fake_render(wav, output_video, cover, on_output, cancel, orientation, duration):
        output_video.write_bytes(b"\x00\x00\x00\x18ftypmp42")  # minimal MP4 stub
        return 0

    with patch(
        "app.api.routers.chapters_assets.config.resolve_chapter_asset_path",
        return_value=fake_wav,
    ), patch(
        "app.engines.video_utils.generate_video_sample",
        side_effect=_fake_render,
    ):
        res = client.post(f"/api/chapters/{cid}/export-video?project_id={pid}&orientation=portrait&duration=15")
    assert res.status_code == 200
    assert res.headers["content-type"] == "video/mp4"
    assert res.content.startswith(b"\x00\x00\x00\x18ftyp")


def test_preview_processed_fails_with_no_engine(clean_db, client):
    # 1. Create a project and chapter
    res = client.post("/api/projects", data={"name": "P1"})
    pid = res.json()["project_id"]
    res = client.post(f"/api/projects/{pid}/chapters", data={"title": "C1", "text_content": "Some text"})
    cid = res.json()["chapter"]["id"]

    # 2. Set default_engine in settings to empty
    from app.db.state import update_settings
    update_settings({"default_engine": ""})

    # 3. Call preview with processed=true, should return 400
    response = client.get(f"/api/chapters/{cid}/preview?processed=true")
    assert response.status_code == 400
    assert "No TTS engine" in response.json()["message"]
