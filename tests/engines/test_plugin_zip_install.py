"""Security tests for the /plugins/import endpoint — zip path traversal."""

import io
import json
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


def _make_valid_zip(extra_files: dict[str, bytes] | None = None) -> bytes:
    """Build a minimal valid plugin zip in memory."""
    manifest = {
        "studio_tts_manifest": "1.0",
        "engine_id": "testplugin",
        "display_name": "Test Plugin",
        "entry_class": "engine:TestEngine",
        "capabilities": ["synthesis"],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        if extra_files:
            for name, data in extra_files.items():
                zf.writestr(name, data)
    return buf.getvalue()


def _make_zip_with_entry(entry_name: str, data: bytes = b"evil") -> bytes:
    """Build a zip containing a single entry with a given (possibly unsafe) name."""
    manifest = {
        "studio_tts_manifest": "1.0",
        "engine_id": "testplugin",
        "display_name": "Test Plugin",
        "entry_class": "engine:TestEngine",
        "capabilities": ["synthesis"],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr(entry_name, data)
    return buf.getvalue()


@pytest.fixture()
def tts_client(tmp_path, monkeypatch):
    """Return a TestClient for the TTS server with a temp plugins dir."""
    import app.tts_server.server as server_mod

    monkeypatch.setattr(server_mod, "_plugins_dir", tmp_path)
    # Ensure no stale plugins bleed in
    monkeypatch.setattr(server_mod, "_plugins", [])

    from app.tts_server.server import app

    return TestClient(app), tmp_path


class TestZipInstallPathTraversal:
    """Verify that backslash traversal entries are rejected at import time."""

    def test_backslash_traversal_is_rejected(self, tts_client):
        client, plugins_dir = tts_client
        # Entry name uses backslash to attempt directory traversal
        zip_data = _make_zip_with_entry("..\\evil.txt")
        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 400, resp.text
        # Nothing should have been written outside the plugins dir
        assert not (plugins_dir.parent / "evil.txt").exists()

    def test_double_dot_posix_traversal_is_rejected(self, tts_client):
        client, plugins_dir = tts_client
        zip_data = _make_zip_with_entry("../evil.txt")
        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 400, resp.text

    def test_nested_backslash_traversal_is_rejected(self, tts_client):
        client, plugins_dir = tts_client
        # Deeper traversal attempt
        zip_data = _make_zip_with_entry("subdir\\..\\..\\evil.txt")
        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 400, resp.text

    def test_absolute_path_entry_is_rejected(self, tts_client):
        client, plugins_dir = tts_client
        zip_data = _make_zip_with_entry("/etc/passwd")
        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 400, resp.text

    def test_staging_dir_cleaned_up_after_rejection(self, tts_client):
        client, plugins_dir = tts_client
        zip_data = _make_zip_with_entry("..\\evil.txt")
        client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        # No leftover staging dirs (.import_*) should remain
        leftover = list(plugins_dir.glob(".import_*"))
        assert leftover == [], f"Staging dirs not cleaned up: {leftover}"

    def test_valid_zip_without_conflict_reaches_extraction(self, tts_client, monkeypatch):
        """A well-formed zip should not be rejected by path validation (extraction
        may fail for other reasons in unit context, but must not 400 on path checks)."""
        client, plugins_dir = tts_client
        zip_data = _make_valid_zip({"engine.py": b"class TestEngine: pass"})
        # load_plugins is called after rename; mock it to avoid side-effects
        import app.tts_server.server as server_mod
        monkeypatch.setattr(server_mod, "load_plugins", lambda *a, **kw: None)

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        # 200 ok (or 409 if somehow the dir already exists, but not 400)
        assert resp.status_code not in (400,), resp.text
