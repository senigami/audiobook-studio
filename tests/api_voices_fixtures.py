import pytest
import os
import importlib
from app.db.core import init_db

@pytest.fixture(autouse=True)
def voices_root(tmp_path, monkeypatch):
    import app.config
    import app.web
    import app.api.routers.voices
    import app.api.routers.voices_helpers
    import app.api.routers.voices_management
    import app.api.routers.voices_bundles
    import app.db.speakers

    voices_dir = (tmp_path / "voices").resolve()
    monkeypatch.setattr(app.web, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.api.routers.voices, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.api.routers.voices_helpers, "VOICES_DIR", voices_dir)
    # app.db.speakers uses config.VOICES_DIR directly, so patching config is sufficient.
    # Ensure V2 DB module also points to the test directory
    monkeypatch.setattr(app.db.speakers, "config", app.config)
    return voices_dir


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)


@pytest.fixture
def clean_db(tmp_path):
    from app.web import app as fastapi_app
    db_path = "/tmp/test_api_voices.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    importlib.reload(app.db.core)
    init_db()

    yield

    if os.path.exists(db_path):
        os.unlink(db_path)
    fastapi_app.dependency_overrides = {}
