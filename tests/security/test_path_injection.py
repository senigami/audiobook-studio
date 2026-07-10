import pytest
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch
from app.api.routers.projects_helpers import _store_project_cover
from app.storage.manager import StorageManager

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

    mock_manager = StorageManager(base_dir=tmp_path, projects_dir=tmp_path)
    with patch("app.storage.manager.get_storage_manager", return_value=mock_manager):
        result_url = await _store_project_cover("project1", cover)

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

    # Absolute path injection attempt. Use a target fully inside this test's
    # own tmp_path sandbox (rather than the real, shared /tmp/evil.jpg) and
    # pre-populate it with known sentinel bytes, so the "was it touched?"
    # assertion is deterministic and can't pass vacuously due to stale state
    # left over from another test run or process.
    outside_target = tmp_path / "outside" / "evil.jpg"
    outside_target.parent.mkdir(parents=True)
    sentinel = b"pre-existing, unrelated content"
    outside_target.write_bytes(sentinel)

    cover = AsyncMock()
    cover.filename = str(outside_target)
    cover.read = AsyncMock(return_value=b"evil")

    mock_manager = StorageManager(base_dir=tmp_path, projects_dir=tmp_path)
    with patch("app.storage.manager.get_storage_manager", return_value=mock_manager):
        await _store_project_cover("project1", cover)

    # Should still end up in project1/cover/cover.jpg
    assert (project_dir / "cover" / "cover.jpg").exists()
    assert (project_dir / "cover" / "cover.jpg").read_bytes() == b"evil"

    # The absolute-path target must be byte-for-byte untouched.
    assert outside_target.read_bytes() == sentinel
