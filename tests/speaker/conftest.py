import pytest
import os
import importlib
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db

@pytest.fixture
def client():
    return TestClient(fastapi_app)

@pytest.fixture(autouse=True)
def voices_root(tmp_path, monkeypatch):
    import app.config
    import app.web
    import app.api.routers.voices
    import app.jobs.speaker

    voices_dir = (tmp_path / "voices").resolve()
    # Ensure it exists before use
    voices_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(app.web, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.api.routers.voices, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.jobs.speaker, "VOICES_DIR", voices_dir)

    # Also patch app.jobs.speaker.VOICES_DIR directly as some tests set it
    import app.jobs.speaker
    app.jobs.speaker.VOICES_DIR = voices_dir

    return voices_dir

@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_refinement.db"
    os.environ["DB_PATH"] = str(db_path)
    import app.db.core
    importlib.reload(app.db.core)
    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)
