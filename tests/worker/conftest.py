import pytest
import time
from unittest.mock import MagicMock
from app.models import Job
from app.db import init_db

@pytest.fixture
def mock_q():
    q = MagicMock()
    return q

@pytest.fixture
def sample_job():
    return Job(
        id="test_job_1",
        engine="xtts",
        chapter_file="chapter1.txt",
        chapter_id="chap_1",
        status="queued",
        created_at=time.time(),
        project_id="proj_1"
    )

@pytest.fixture(autouse=True)
def setup_db():
    init_db()
