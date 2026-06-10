import pytest
import os
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.api.web import app as fastapi_app
from app.db.core import init_db, get_connection
from app.db.projects import create_project
from app.db.chapters import create_chapter

# Unified validation script for 80%+ coverage
# DELETED: test_api_surgical_chapters_hits — VACUOUS: zero assert statements in the entire
# function body. Fires HTTP requests to bump coverage counters only; no assertion about
# any observable contract. Deleted per audit (2026-06-10).
