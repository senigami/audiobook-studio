from pathlib import Path

import pytest

from app.db.core import _assert_safe_db_path_for_tests


def test_non_test_db_path_is_rejected_in_test_mode(monkeypatch):
    monkeypatch.setenv("APP_TEST_MODE", "1")

    with pytest.raises(RuntimeError, match="non-test DB path"):
        _assert_safe_db_path_for_tests(Path("audiobook_studio.db"))


def test_test_db_path_is_allowed_in_test_mode(monkeypatch):
    monkeypatch.setenv("APP_TEST_MODE", "1")

    _assert_safe_db_path_for_tests(Path("/tmp/test_api.db"))
