import pytest
import os
import importlib
from app.db.core import init_db

@pytest.fixture(autouse=True)
def voices_root(tmp_path, monkeypatch):
    from app.core import config
    from app.api import web
    from app.api.routers import voices, voices_helpers, voices_management, voices_bundles
    import app.db.speakers
    from pathlib import Path

    voices_dir = (tmp_path / "voices").resolve()

    # Isolation guard assertion
    repo_root = Path(__file__).resolve().parents[2]
    real_voices_dir = (repo_root / "voices").resolve()
    assert voices_dir != real_voices_dir, f"VOICES_DIR is not isolated: {voices_dir}"
    assert "tmp" in str(voices_dir) or "pytest" in str(voices_dir), f"VOICES_DIR path seems unsafe: {voices_dir}"

    monkeypatch.setattr(web, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(voices, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(voices_helpers, "VOICES_DIR", voices_dir)
    # app.db.speakers uses config.VOICES_DIR directly, so patching config is sufficient.
    # Ensure V2 DB module also points to the test directory
    monkeypatch.setattr(app.db.speakers, "config", config)
    return voices_dir


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)


@pytest.fixture
def clean_db(tmp_path):
    from app.api.web import app as fastapi_app
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
