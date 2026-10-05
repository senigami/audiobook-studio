import pytest
import os
import time
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.legacy_migration import import_legacy_filesystem_data

from app.db.migration import migrate_legacy_project_covers

def test_import_legacy_filesystem_data_no_files(tmp_path):
    chap_dir = tmp_path / "chapters"
    chap_dir.mkdir()

    with patch("app.db.legacy_migration.CHAPTER_DIR", chap_dir):
        res = import_legacy_filesystem_data()
        assert res["status"] == "success"
        assert "No legacy text files found" in res["message"]
