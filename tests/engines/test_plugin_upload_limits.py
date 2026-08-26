"""Issue #219a: /plugins/import and /plugins/preview both read an entire
uploaded file into memory and extractall() it with no size ceiling anywhere
-- a classic zip-bomb / memory-exhaustion vector. These tests exercise the
three independent ceilings (upload bytes, total declared uncompressed bytes,
member count) against the real endpoints, with the ceilings monkeypatched
down to small values so the tests stay fast and in-memory.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient


def _make_valid_zip(extra_files: dict[str, bytes] | None = None) -> bytes:
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


@pytest.fixture()
def tts_client(tmp_path, monkeypatch):
    """Return (TestClient, tmp_path) with an isolated plugins dir."""
    import app.tts_server.server as server_mod
    import app.tts_server.plugin_staging as plugin_staging_mod

    monkeypatch.setattr(server_mod, "_plugins_dir", tmp_path)
    monkeypatch.setattr(server_mod, "_plugins", [])
    monkeypatch.setattr(plugin_staging_mod, "_staging", {})

    from app.tts_server.server import app

    return TestClient(app), tmp_path


class TestUploadByteCeiling:
    def test_import_rejects_upload_over_byte_ceiling(self, tts_client, monkeypatch):
        client, plugins_dir = tts_client
        import app.tts_server.plugin_staging as plugin_staging_mod

        zip_data = _make_valid_zip()
        assert len(zip_data) > 50, "test zip must exceed the patched ceiling to be a real check"
        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UPLOAD_BYTES", 50)

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not list(plugins_dir.iterdir()), "oversized upload must not be extracted at all"

    def test_preview_rejects_upload_over_byte_ceiling(self, tts_client, monkeypatch):
        client, plugins_dir = tts_client
        import app.tts_server.plugin_staging as plugin_staging_mod

        zip_data = _make_valid_zip()
        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UPLOAD_BYTES", 50)

        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not list(plugins_dir.iterdir())


class TestUncompressedSizeCeiling:
    def test_import_rejects_zip_over_uncompressed_ceiling(self, tts_client, monkeypatch):
        client, plugins_dir = tts_client
        import app.tts_server.plugin_staging as plugin_staging_mod

        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UNCOMPRESSED_BYTES", 50)
        # Highly compressible payload -- the compressed upload stays tiny, but
        # the DECLARED (central-directory) uncompressed size is what must be
        # checked, and it exceeds the ceiling.
        zip_data = _make_valid_zip(extra_files={"payload.bin": b"A" * 200})

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not list(plugins_dir.iterdir()), "zip bomb must be rejected before extractall() runs"

    def test_preview_rejects_zip_over_uncompressed_ceiling(self, tts_client, monkeypatch):
        client, plugins_dir = tts_client
        import app.tts_server.plugin_staging as plugin_staging_mod

        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UNCOMPRESSED_BYTES", 50)
        zip_data = _make_valid_zip(extra_files={"payload.bin": b"A" * 200})

        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not list(plugins_dir.iterdir())


class TestMemberCountCeiling:
    def test_import_rejects_zip_over_member_count_ceiling(self, tts_client, monkeypatch):
        client, plugins_dir = tts_client
        import app.tts_server.plugin_staging as plugin_staging_mod

        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_ZIP_MEMBERS", 3)
        # manifest.json + 4 tiny extras = 5 members > the patched ceiling of 3.
        extra = {f"file_{i}.txt": b"x" for i in range(4)}
        zip_data = _make_valid_zip(extra_files=extra)

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not list(plugins_dir.iterdir())


class TestValidUploadsStillWork:
    def test_import_still_succeeds_under_all_ceilings(self, tts_client):
        """Regression guard: the new ceilings must not touch the happy path."""
        client, plugins_dir = tts_client
        zip_data = _make_valid_zip()

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 200, resp.text
        assert (plugins_dir / "tts_testplugin").exists()
