import pytest
import os
from pathlib import Path
from app.db.core import init_db, get_connection

def _existing_project_audio_dir(path: Path):
    return lambda _project_id, dirname: Path(path) if dirname == "audio" else None

@pytest.fixture
def db_conn(tmp_path):
    db_path = str(tmp_path / "test_audiobook_db.db")

    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    init_db()
    conn = get_connection()
    yield conn
    conn.close()
