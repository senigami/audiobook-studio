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
import struct
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


def _forge_declared_size(zip_bytes: bytes, member_name: str, forged_size: int) -> bytes:
    """Return ``zip_bytes`` with ``member_name``'s DECLARED uncompressed size
    (both local file header and central directory) overwritten to
    ``forged_size``, leaving its actual compressed data stream untouched.

    This is the archive-forgery step behind issue #219a's real defect: a
    member's declared ``file_size`` is ordinary attacker-controlled metadata
    from the archive's own headers. Python's ``zipfile`` reads it back
    faithfully via ``ZipInfo.file_size`` and never cross-checks it against
    the real decompressed byte count while decompressing -- it only compares
    afterward, via CRC, once decompression has already happened. A member
    can therefore claim ``forged_size`` bytes while its real DEFLATE stream
    expands to however much data was actually written into it, which is
    exactly what these tests exploit to prove the streaming ceiling is a
    real bound rather than one checking the attacker's own claim.
    """
    data = bytearray(zip_bytes)
    needle = member_name.encode("utf-8")
    idx = data.find(needle)
    while idx != -1:
        lfh = data.rfind(b"PK\x03\x04", 0, idx)
        if lfh != -1 and idx - lfh < 40:
            struct.pack_into("<I", data, lfh + 22, forged_size)
        cdh = data.rfind(b"PK\x01\x02", 0, idx)
        if cdh != -1 and idx - cdh < 60:
            struct.pack_into("<I", data, cdh + 24, forged_size)
        idx = data.find(needle, idx + 1)
    return bytes(data)


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
        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UPLOAD_BYTES", 50, raising=False)

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
        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UPLOAD_BYTES", 50, raising=False)

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

        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UNCOMPRESSED_BYTES", 50, raising=False)
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

        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_UNCOMPRESSED_BYTES", 50, raising=False)
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

        monkeypatch.setattr(plugin_staging_mod, "MAX_PLUGIN_ZIP_MEMBERS", 3, raising=False)
        # manifest.json + 4 tiny extras = 5 members > the patched ceiling of 3.
        extra = {f"file_{i}.txt": b"x" for i in range(4)}
        zip_data = _make_valid_zip(extra_files=extra)

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not list(plugins_dir.iterdir())


class TestForgedDeclaredSizeIsRejectedCleanly:
    """``_reject_oversized_zip`` sums ``ZipInfo.file_size`` -- the archive's own
    central-directory declaration, which is ordinary attacker-controlled
    metadata. A member can forge a tiny declared size while its real content
    is much larger.

    Measured directly (see the module docstring in ``plugin_staging.py``):
    that lie does NOT let real bytes past this module's actual ceilings.
    ``zipfile``'s streaming reader (``zf.open(member)``, which both
    ``extractall()`` and this module's ``_safe_read_member``/
    ``_safe_extractall`` use) truncates a member's decompressed OUTPUT at its
    declared size before validating CRC, so a forged-small-declared/
    real-large member is caught almost instantly with negligible memory --
    but only as a **corrupted-archive rejection (400)**, because the CRC
    computed over the real (large) content can never match what got
    truncated to the (small) forged declared size. There is no way to forge
    a declared size AND keep the CRC honest at the same time; one or the
    other always gives it away.

    What these tests actually pin down, then, is not a size-ceiling bypass
    (there isn't one) but the error-HANDLING gap this module had: before this
    fix, that CRC mismatch propagated as an unhandled ``zipfile.BadZipFile``,
    landing as either a bare 500 (from extraction) or a misleading 400
    "Invalid manifest.json" (mis-caught by the JSON-parse handler, which
    hides that the archive was tampered with, not just badly formed JSON).
    Now it is a single, correctly-labeled 400 with the partial staging
    directory cleaned up.
    """

    def test_import_rejects_corrupted_payload_member_cleanly(self, tts_client):
        client, plugins_dir = tts_client

        # payload.bin's real decompressed content is 10,000 zero bytes; its
        # declared size is forged down to 10, so its CRC (computed over the
        # real 10,000 bytes) can never match what a truncated-at-10 read
        # would produce.
        zip_data = _make_valid_zip(extra_files={"payload.bin": b"\x00" * 10_000})
        zip_data = _forge_declared_size(zip_data, "payload.bin", forged_size=10)

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 400, resp.text
        assert "corrupt" in resp.text.lower() or "tamper" in resp.text.lower(), resp.text
        assert not list(plugins_dir.iterdir()), (
            "corrupted-archive rejection left a partial staging directory behind"
        )

    def test_preview_rejects_corrupted_payload_member_cleanly(self, tts_client):
        client, plugins_dir = tts_client

        zip_data = _make_valid_zip(extra_files={"payload.bin": b"\x00" * 10_000})
        zip_data = _forge_declared_size(zip_data, "payload.bin", forged_size=10)

        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 400, resp.text
        assert not list(plugins_dir.iterdir())

    def test_import_rejects_corrupted_manifest_member_cleanly(self, tts_client):
        """The earliest reached surface: manifest.json is read before
        extraction even starts. Pre-fix, this specific call
        (``zf.read(name)``) was the one genuinely unbounded read in this
        module -- unlike ``extractall()``, it does NOT truncate a member's
        output at its declared size, so a forged-small/real-large
        manifest.json would fully decompress before the (also pre-fix,
        also unhandled) CRC mismatch was ever noticed. Confirmed directly:
        an 800 MB payload declared as 100 bytes cost +839 MB RSS through
        ``zf.read()`` before raising; the identical forgery read through
        ``zf.open()`` in a chunked loop cost none.
        """
        client, plugins_dir = tts_client

        manifest = {
            "studio_tts_manifest": "1.0",
            "engine_id": "testplugin",
            "display_name": "Test Plugin",
            "entry_class": "engine:TestEngine",
            "capabilities": ["synthesis"],
            "padding": "x" * 5_000,
        }
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("manifest.json", json.dumps(manifest))
        zip_data = _forge_declared_size(buf.getvalue(), "manifest.json", forged_size=20)

        resp = client.post(
            "/plugins/import",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 400, resp.text
        assert "corrupt" in resp.text.lower() or "tamper" in resp.text.lower(), resp.text
        assert not list(plugins_dir.iterdir())


class TestStudioProxyUploadCeiling:
    """The TTS server's ceilings only bind requests that reach the TTS server.

    ``/api/engines/import`` and ``/api/engines/preview`` are the routes a
    browser or a LAN client actually talks to, and they read the body into the
    *Studio* process before the bridge forwards anything. Capping only the
    server side left the reachable surface unbounded (issue #219a).
    """

    @pytest.fixture()
    def studio_client(self, monkeypatch):
        from unittest.mock import MagicMock

        import app.api.routers.engines_plugins as ep
        from app.api.web import app as studio_app

        bridge = MagicMock()
        bridge.import_plugin.return_value = {"ok": True}
        bridge.preview_plugin.return_value = {"ok": True}
        monkeypatch.setattr(ep, "create_voice_bridge", lambda: bridge)
        return TestClient(studio_app), bridge, ep

    def test_studio_import_rejects_upload_over_byte_ceiling(self, studio_client, monkeypatch):
        client, bridge, ep = studio_client
        monkeypatch.setattr(ep, "MAX_PLUGIN_UPLOAD_BYTES", 50, raising=False)

        resp = client.post(
            "/api/engines/import",
            files={"file": ("plugin.zip", b"x" * 500, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not bridge.import_plugin.called, "oversized body was forwarded to the TTS server anyway"

    def test_studio_preview_rejects_upload_over_byte_ceiling(self, studio_client, monkeypatch):
        client, bridge, ep = studio_client
        monkeypatch.setattr(ep, "MAX_PLUGIN_UPLOAD_BYTES", 50, raising=False)

        resp = client.post(
            "/api/engines/preview",
            files={"file": ("plugin.zip", b"x" * 500, "application/zip")},
        )
        assert resp.status_code == 413, resp.text
        assert not bridge.preview_plugin.called

    def test_studio_import_under_ceiling_still_reaches_the_bridge(self, studio_client):
        client, bridge, _ = studio_client

        resp = client.post(
            "/api/engines/import",
            files={"file": ("plugin.zip", _make_valid_zip(), "application/zip")},
        )
        assert resp.status_code == 200, resp.text
        assert bridge.import_plugin.called

    def test_studio_and_server_upload_ceilings_agree(self):
        """The two constants are deliberately duplicated across a process
        boundary (app.api must not import the TTS server runtime). Pin them
        together so raising one and forgetting the other is a test failure
        rather than a silently half-applied ceiling."""
        import app.api.routers.engines_plugins as ep
        import app.tts_server.plugin_staging as plugin_staging_mod

        assert ep.MAX_PLUGIN_UPLOAD_BYTES == plugin_staging_mod.MAX_PLUGIN_UPLOAD_BYTES


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
