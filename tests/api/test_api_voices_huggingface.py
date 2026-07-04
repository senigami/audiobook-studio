"""Tests for the Hugging Face voice browse/import/export/upload router.

Covers:
  - GET  /api/voices/huggingface/search   -> maps Hub search results
  - GET  /api/voices/huggingface/inspect  -> card details + license flagging; rejects malformed hub_id
  - POST /api/voices/huggingface/import   -> consent gate, download, register as local voice,
                                              provenance = {"source": "imported", ...} (never "huggingface")
  - POST /api/voices/huggingface/export   -> wraps export_hf_voice_bundle for an installed voice
  - POST /api/voices/huggingface/upload   -> requires a configured token; wraps upload_voice_to_hub

All Hub network access is mocked at the ``HFHubClientProtocol`` boundary by
monkeypatching ``voices_huggingface._client`` to return a fake client
(testing-standards.md R2 — network is a valid mock boundary); no real HTTP
call is made anywhere in this file.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import pytest

# Fixture from the shared fixture file — voices_root + client + clean_db
from tests.api.api_voices_fixtures import *  # noqa: F401,F403


# ---------------------------------------------------------------------------
# Fake Hub client (the mock boundary)
# ---------------------------------------------------------------------------


class FakeHFHubClient:
    def __init__(self, *, search_results=None, card=None, download_paths=None, upload_commit_id="abc123"):
        self._search_results = search_results or []
        self._card = card or {}
        self._download_paths = download_paths or []
        self._upload_commit_id = upload_commit_id
        self.upload_calls: list[dict[str, Any]] = []
        self.download_calls: list[dict[str, Any]] = []

    def search_models(self, *, tag: str, query: Optional[str] = None):
        return self._search_results

    def get_model_card(self, hub_id: str, *, revision: Optional[str] = None):
        return self._card

    def download_files(self, hub_id, *, revision=None, token=None):
        self.download_calls.append({"hub_id": hub_id, "revision": revision, "token": token})
        return self._download_paths

    def upload_files(self, hub_id, files, *, tags, token):
        self.upload_calls.append({"hub_id": hub_id, "files": files, "tags": tags, "token": token})
        return self._upload_commit_id


def _patch_client(monkeypatch, fake_client: FakeHFHubClient):
    from app.api.routers import voices_huggingface

    monkeypatch.setattr(voices_huggingface, "_client", lambda: fake_client)


def _make_voice_root(voices_root: Path, name: str = "gravel-road") -> Path:
    voice_dir = voices_root / "Gravel Road"
    voice_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "spec": "audiobook-studio-voice",
        "spec_version": "1.0",
        "taxonomy_version": "1.0",
        "id": name,
        "name": "Gravel Road",
        "description": "",
        "samples": [{"path": "samples/preview.mp3", "primary": True}],
        "languages": ["en-US"],
        "attributes": {"class": "human", "gender": "masculine", "age": "senior"},
        "tags": [],
    }
    (voice_dir / "voice.json").write_text(json.dumps(manifest))
    samples_dir = voice_dir / "samples"
    samples_dir.mkdir()
    (samples_dir / "preview.mp3").write_bytes(b"fake-mp3-bytes")
    return voice_dir


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class TestSearchEndpoint:
    def test_search_maps_results(self, client, voices_root, monkeypatch):
        fake = FakeHFHubClient(
            search_results=[{"id": "someone/voice-a", "author": "someone", "tags": ["audiobook-studio-voice"], "likes": 3}]
        )
        _patch_client(monkeypatch, fake)

        resp = client.get("/api/voices/huggingface/search", params={"q": "narrator"})

        assert resp.status_code == 200
        data = resp.json()
        assert data == [{"hub_id": "someone/voice-a", "author": "someone", "tags": ["audiobook-studio-voice"], "likes": 3}]

    def test_search_failure_maps_to_502(self, client, voices_root, monkeypatch):
        from app.api.routers import voices_huggingface

        def _boom():
            raise RuntimeError("network down")

        monkeypatch.setattr(voices_huggingface, "_client", _boom)
        resp = client.get("/api/voices/huggingface/search")
        assert resp.status_code == 502


# ---------------------------------------------------------------------------
# Inspect
# ---------------------------------------------------------------------------


class TestInspectEndpoint:
    def test_inspect_returns_card_and_flags_restrictive_license(self, client, voices_root, monkeypatch):
        fake = FakeHFHubClient(card={"license": "cc-by-nc-4.0", "sha": "deadbeef", "author": "someone"})
        _patch_client(monkeypatch, fake)

        resp = client.get("/api/voices/huggingface/inspect", params={"hub_id": "someone/voice"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["license"] == "cc-by-nc-4.0"
        assert data["is_restrictive_license"] is True

    @pytest.mark.parametrize("hub_id", ["../escape", "no-slash", "a/b/c", ""])
    def test_inspect_rejects_malformed_hub_id(self, client, voices_root, monkeypatch, hub_id):
        fake = FakeHFHubClient()
        _patch_client(monkeypatch, fake)

        resp = client.get("/api/voices/huggingface/inspect", params={"hub_id": hub_id})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


class TestImportEndpoint:
    def test_import_requires_consent(self, client, voices_root, monkeypatch):
        fake = FakeHFHubClient(card={"license": "cc-by-4.0"})
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/import",
            json={"hub_id": "someone/voice", "consent": False},
        )
        assert resp.status_code == 422

    def test_import_rejects_malformed_hub_id(self, client, voices_root, monkeypatch):
        fake = FakeHFHubClient()
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/import",
            json={"hub_id": "not-valid", "consent": True},
        )
        assert resp.status_code == 422

    def test_import_downloads_and_registers_voice_with_correct_provenance(
        self, client, voices_root, monkeypatch, tmp_path
    ):
        sample_file = tmp_path / "sample.wav"
        sample_file.write_bytes(b"RIFF....fake-wav-bytes")

        fake = FakeHFHubClient(
            card={
                "license": "cc-by-4.0",
                "sha": "deadbeef",
                "languages": ["en-US"],
                "tags": ["audiobook-studio-voice"],
                "author": "someone",
                "description": "A weathered narrator voice.",
            },
            download_paths=[sample_file],
        )
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/import",
            json={"hub_id": "someone/voice", "consent": True, "voice_name": "Imported Narrator"},
        )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "ok"
        assert data["saved_samples"] == ["sample.wav"]

        metadata = data["metadata"]
        # This is the exact contract from voice-bundles.md §8.1: source must be
        # "imported" (not "huggingface", which is not a valid enum value) and
        # only these four fields are present.
        provenance = metadata["provenance"]
        assert provenance["source"] == "imported"
        assert provenance["author"] == "someone"
        assert provenance["consent_ack"] is True
        assert "created_at" in provenance
        assert set(provenance.keys()) == {"source", "author", "consent_ack", "created_at"}

        # The registered voice is now readable through the normal metadata endpoint.
        voice_id = data["voice_id"]
        get_resp = client.get(f"/api/voices/{voice_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["provenance"] == provenance

    def test_import_fails_when_no_audio_files_downloaded(self, client, voices_root, monkeypatch, tmp_path):
        readme = tmp_path / "README.md"
        readme.write_text("not audio")

        fake = FakeHFHubClient(card={"license": "cc-by-4.0"}, download_paths=[readme])
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/import",
            json={"hub_id": "someone/voice", "consent": True},
        )
        assert resp.status_code == 422

    def test_import_never_exposes_token_in_response(self, client, voices_root, monkeypatch, tmp_path):
        from app.db.state import update_settings

        update_settings({"huggingface_token": "super-secret-hf-token"})

        sample_file = tmp_path / "sample.wav"
        sample_file.write_bytes(b"fake-wav")
        fake = FakeHFHubClient(card={"license": "cc-by-4.0"}, download_paths=[sample_file])
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/import",
            json={"hub_id": "someone/voice", "consent": True},
        )

        assert resp.status_code == 200
        assert "super-secret-hf-token" not in resp.text
        # The client received the token object as a credential...
        assert fake.download_calls[0]["token"] is not None
        # ...but it was never serialized anywhere in the response.


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


class TestExportEndpoint:
    def test_export_produces_bundle_for_installed_voice(self, client, voices_root, monkeypatch):
        _make_voice_root(voices_root)

        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "ok"
        assert data["bundle_name"] == "gravel-road.asvoice.zip"
        assert Path(data["bundle_path"]).exists()

    def test_export_404_for_unknown_voice(self, client, voices_root, monkeypatch):
        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "does-not-exist"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


class TestUploadEndpoint:
    def test_upload_requires_a_configured_token(self, client, voices_root, monkeypatch):
        from app.db.state import update_settings

        update_settings({"huggingface_token": ""})
        _make_voice_root(voices_root)
        fake = FakeHFHubClient()
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/upload",
            json={"voice_id": "gravel-road", "hub_id": "someone/gravel-road"},
        )
        assert resp.status_code == 422

    def test_upload_rejects_malformed_hub_id(self, client, voices_root, monkeypatch):
        from app.db.state import update_settings

        update_settings({"huggingface_token": "a-real-token"})
        _make_voice_root(voices_root)
        fake = FakeHFHubClient()
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/upload",
            json={"voice_id": "gravel-road", "hub_id": "not-valid"},
        )
        assert resp.status_code == 422

    def test_upload_pushes_extracted_bundle_files_and_never_returns_token(self, client, voices_root, monkeypatch):
        from app.db.state import update_settings

        update_settings({"huggingface_token": "super-secret-hf-token"})
        _make_voice_root(voices_root)
        fake = FakeHFHubClient(upload_commit_id="commit-xyz")
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/upload",
            json={"voice_id": "gravel-road", "hub_id": "someone/gravel-road", "extra_tags": ["as-narrator"]},
        )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["commit_id"] == "commit-xyz"
        assert "super-secret-hf-token" not in resp.text

        assert len(fake.upload_calls) == 1
        call = fake.upload_calls[0]
        assert call["hub_id"] == "someone/gravel-road"
        uploaded_names = {Path(p).name for p in call["files"]}
        assert "voice.json" in uploaded_names
        assert "preview.mp3" in uploaded_names
        assert "as-narrator" in call["tags"]
