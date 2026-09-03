import pytest
import os
import importlib
from fastapi.testclient import TestClient
from app.api.web import app as fastapi_app
from app.db.core import init_db

@pytest.fixture
def client():
    return TestClient(fastapi_app)

@pytest.fixture(autouse=True)
def voices_root(tmp_path, monkeypatch):
    import app.db.speakers
    from pathlib import Path

    voices_dir = (tmp_path / "voices").resolve()

    # Isolation guard assertion
    repo_root = Path(__file__).resolve().parents[2]
    real_voices_dir = (repo_root / "voices").resolve()
    assert voices_dir != real_voices_dir, f"VOICES_DIR is not isolated: {voices_dir}"
    assert "tmp" in str(voices_dir) or "pytest" in str(voices_dir), f"VOICES_DIR path seems unsafe: {voices_dir}"

    voices_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(app.api.web, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.core.config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.api.routers.voices, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(app.db.speakers, "config", app.core.config)

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
