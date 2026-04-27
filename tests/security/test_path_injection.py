import pytest
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock
from app.api.routers.projects_helpers import _store_project_cover

@pytest.mark.anyio
async def test_store_project_cover_injection_blocked(tmp_path):
    # Setup trusted project dir
    project_dir = tmp_path / "project1"
    project_dir.mkdir()

    # Untrusted cover with traversal filename
    cover = AsyncMock()
    cover.filename = "../../secret.txt"
    cover.read = AsyncMock(return_value=b"fake content")

    # We want to ensure that even with a traversal filename, it stays inside project_dir/cover
    # The current implementation uses safe_basename which strips directories,
    # so "../../secret.txt" becomes "secret.txt".
    # However, if we didn't use safe_basename, it would be dangerous.

    result_url = await _store_project_cover("project1", project_dir, cover)

    # Resulting path should be project1/cover/cover.txt (since safe_basename strips ../..)
    # and it should be relative to project1/cover
    assert "project1" in result_url
    assert "cover" in result_url

    cover_file = project_dir / "cover" / "cover.txt"
    assert cover_file.exists()
    assert cover_file.read_bytes() == b"fake content"

    # Verify no file was created outside project_dir
    secret_file = tmp_path / "secret.txt"
    assert not secret_file.exists()

@pytest.mark.anyio
async def test_store_project_cover_absolute_path_blocked(tmp_path):
    project_dir = tmp_path / "project1"
    project_dir.mkdir()

    cover = AsyncMock()
    # Absolute path injection attempt
    cover.filename = "/tmp/evil.jpg"
    cover.read = AsyncMock(return_value=b"evil")

    await _store_project_cover("project1", project_dir, cover)

    # Should still end up in project1/cover/cover.jpg
    assert (project_dir / "cover" / "cover.jpg").exists()
    assert not Path("/tmp/evil.jpg").exists() or Path("/tmp/evil.jpg").read_bytes() != b"evil"
