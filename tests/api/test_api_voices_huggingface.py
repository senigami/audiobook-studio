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
import zipfile
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

    def upload_files(self, hub_id, folder_path, *, tags, token):
        self.upload_calls.append({"hub_id": hub_id, "folder_path": folder_path, "tags": tags, "token": token})
        return self._upload_commit_id


def _patch_client(monkeypatch, fake_client: FakeHFHubClient):
    from app.api.routers import voices_huggingface

    monkeypatch.setattr(voices_huggingface, "_client", lambda: fake_client)


def _make_voice_root(
    voices_root: Path,
    name: str = "gravel-road",
    *,
    variant_name: str = "Default",
    engine: str | None = "xtts",
    sample_bytes: bytes | None = b"fake-mp3-bytes",
    include_latent: bool = False,
) -> Path:
    """Builds a voice root matching the REAL on-disk layout: samples and
    engine assets live inside a variant subdirectory (``<VoiceName>/<VariantName>/``),
    never at the voice root. An earlier version of this fixture wrote
    ``samples/preview.mp3`` directly under the voice root, which doesn't
    reflect any real installed voice and hid a genuine bug where the export
    endpoint's sample lookup always missed (sample_bytes stayed empty) --
    see TestExportEndpoint's real-layout tests below.
    """
    voice_dir = voices_root / "Gravel Road"
    voice_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "spec": "audiobook-studio-voice",
        "spec_version": "1.0",
        "taxonomy_version": "1.0",
        "id": name,
        "name": "Gravel Road",
        "description": "",
        "languages": ["en-US"],
        "attributes": {"class": "human", "gender": "masculine", "age": "senior"},
        "tags": [],
    }
    (voice_dir / "voice.json").write_text(json.dumps(manifest))

    variant_dir = voice_dir / variant_name
    variant_dir.mkdir(parents=True, exist_ok=True)
    profile: dict[str, Any] = {"variant_name": variant_name}
    if engine:
        profile["engine"] = engine
    (variant_dir / "profile.json").write_text(json.dumps(profile))
    if sample_bytes is not None:
        (variant_dir / "sample.mp3").write_bytes(sample_bytes)
    if include_latent:
        (variant_dir / "latent.pth").write_bytes(b"fake-latent-bytes")

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

    def test_export_includes_the_variants_own_sample_bytes(self, client, voices_root, monkeypatch):
        """Real-layout regression test: the sample lives inside the variant
        directory (Default/sample.mp3), never at the voice root. Pins the
        fix for a real bug where the old lookup (voice_dir/"samples/preview.mp3"
        or voice_dir/"sample.mp3") always missed for every real voice,
        silently shipping an empty samples/preview.mp3 in every export."""
        _make_voice_root(voices_root, sample_bytes=b"real-variant-sample-bytes")

        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})
        assert resp.status_code == 200, resp.text

        with zipfile.ZipFile(resp.json()["bundle_path"]) as zf:
            assert zf.read("samples/preview.mp3") == b"real-variant-sample-bytes"

    def test_export_includes_the_same_variants_engine_asset(self, client, voices_root, monkeypatch):
        """Task 004: the engine asset (latent.pth) is published under
        assets/<engine_id>/ from the SAME variant as the sample (owner
        requirement: never pair a sample with a different model's asset)."""
        _make_voice_root(voices_root, engine="xtts", include_latent=True)

        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})
        assert resp.status_code == 200, resp.text

        with zipfile.ZipFile(resp.json()["bundle_path"]) as zf:
            assert zf.read("assets/xtts/latent.pth") == b"fake-latent-bytes"

    def test_export_readme_names_the_model_that_generated_the_sample(self, client, voices_root, monkeypatch):
        _make_voice_root(voices_root, engine="xtts", include_latent=True)

        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})
        assert resp.status_code == 200, resp.text

        with zipfile.ZipFile(resp.json()["bundle_path"]) as zf:
            readme = zf.read("README.md").decode()
        assert "xtts" in readme.lower()

    def test_export_has_no_assets_entry_when_variant_has_no_engine_asset(self, client, voices_root, monkeypatch):
        _make_voice_root(voices_root, engine="xtts", include_latent=False)

        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})
        assert resp.status_code == 200, resp.text

        with zipfile.ZipFile(resp.json()["bundle_path"]) as zf:
            assert not any(n.startswith("assets/") for n in zf.namelist())

    def test_export_triggers_sample_generation_when_variant_has_no_sample(self, client, voices_root, monkeypatch):
        """Owner requirement: never publish an empty sample -- if the
        resolved variant has none yet, kick off the same generation job the
        Voice Lab "Test"/"Generate" button submits, and tell the caller to
        retry once it completes, instead of exporting a 0-byte file."""
        from unittest.mock import patch

        voice_dir = voices_root / "Gravel Road"
        voice_dir.mkdir(parents=True, exist_ok=True)
        manifest = {"id": "gravel-road", "name": "Gravel Road", "tags": []}
        (voice_dir / "voice.json").write_text(json.dumps(manifest))
        variant_dir = voice_dir / "Default"
        variant_dir.mkdir(parents=True, exist_ok=True)
        (variant_dir / "profile.json").write_text(json.dumps({
            "variant_name": "Default",
            "engine": "xtts",
            "voice_asset_id": "voice_123",
        }))
        # No sample.mp3 written.

        with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True), \
             patch("app.db.state.put_job") as mock_put_job, \
             patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit") as mock_submit:
            resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "generating"
        assert data["job_id"]
        assert mock_put_job.called
        assert mock_submit.called

    def test_export_rejects_traversal_shaped_engine_id_from_variant_manifest(self, client, voices_root, monkeypatch):
        """A variant profile.json's ``engine`` value is disk-sourced, not
        API-validated -- a compromised/imported voice could carry a
        traversal-shaped value. It must never become a zip arcname segment
        (``assets/../../evil/...`` is a zip-slip payload for any naive
        extractor consuming the published bundle)."""
        _make_voice_root(voices_root, engine="../../evil", include_latent=True)

        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})
        assert resp.status_code == 200, resp.text

        with zipfile.ZipFile(resp.json()["bundle_path"]) as zf:
            names = zf.namelist()
        assert not any(".." in n for n in names)
        assert not any(n.startswith("assets/") for n in names)
        # The unsafe engine id must not leak into the README either.
        with zipfile.ZipFile(resp.json()["bundle_path"]) as zf:
            assert "evil" not in zf.read("README.md").decode()

    def test_upload_does_not_include_stale_files_from_a_previous_publish(self, client, voices_root, monkeypatch):
        """The upload extract dir is keyed by voice_id and reused across
        publishes; without a wipe, a file present in publish #1 but removed
        from the voice before publish #2 would still be pushed to the Hub."""
        from app.db.state import update_settings

        update_settings({"huggingface_token": "a-real-token"})
        voice_dir = _make_voice_root(voices_root, include_latent=True)
        fake = FakeHFHubClient()
        _patch_client(monkeypatch, fake)

        resp = client.post(
            "/api/voices/huggingface/upload",
            json={"voice_id": "gravel-road", "hub_id": "someone/gravel-road"},
        )
        assert resp.status_code == 200, resp.text

        (voice_dir / "Default" / "latent.pth").unlink()
        resp = client.post(
            "/api/voices/huggingface/upload",
            json={"voice_id": "gravel-road", "hub_id": "someone/gravel-road"},
        )
        assert resp.status_code == 200, resp.text

        folder = fake.upload_calls[1]["folder_path"]
        uploaded = {p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()}
        assert "assets/xtts/latent.pth" not in uploaded, "stale engine asset from the previous publish was re-uploaded"

    def test_export_honors_default_variant_from_state_over_alphabetical_fallback(self, client, voices_root, monkeypatch):
        """Two variants exist; state.json's default_variant picks the
        non-alphabetically-first one -- and its sample/asset must be the
        one published, not "Aardvark"'s."""
        voice_dir = _make_voice_root(voices_root, variant_name="Zebra", engine="voxtral", sample_bytes=b"zebra-sample", include_latent=True)
        aardvark_dir = voice_dir / "Aardvark"
        aardvark_dir.mkdir()
        (aardvark_dir / "profile.json").write_text(json.dumps({"variant_name": "Aardvark", "engine": "xtts"}))
        (aardvark_dir / "sample.mp3").write_bytes(b"aardvark-sample")
        (aardvark_dir / "latent.pth").write_bytes(b"aardvark-latent")
        (voice_dir / "state.json").write_text(json.dumps({"default_variant": "Zebra"}))

        resp = client.post("/api/voices/huggingface/export", json={"voice_id": "gravel-road"})
        assert resp.status_code == 200, resp.text

        with zipfile.ZipFile(resp.json()["bundle_path"]) as zf:
            assert zf.read("samples/preview.mp3") == b"zebra-sample"
            assert zf.read("assets/voxtral/latent.pth") == b"fake-latent-bytes"
            assert not any(n.startswith("assets/xtts") for n in zf.namelist())


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


class TestUploadEndpoint:
    def test_upload_propagates_generating_status_instead_of_uploading_a_broken_bundle(self, client, voices_root, monkeypatch):
        """/upload calls export_hub_voice internally -- when that kicks off
        sample generation instead of producing a bundle, /upload must
        surface the same "generating" signal, never try to upload a bundle
        that was never built."""
        from unittest.mock import patch
        from app.db.state import update_settings

        update_settings({"huggingface_token": "a-real-token"})
        voice_dir = voices_root / "Gravel Road"
        voice_dir.mkdir(parents=True, exist_ok=True)
        (voice_dir / "voice.json").write_text(json.dumps({"id": "gravel-road", "name": "Gravel Road", "tags": []}))
        variant_dir = voice_dir / "Default"
        variant_dir.mkdir(parents=True, exist_ok=True)
        (variant_dir / "profile.json").write_text(json.dumps({
            "variant_name": "Default",
            "engine": "xtts",
            "voice_asset_id": "voice_123",
        }))

        fake = FakeHFHubClient()
        _patch_client(monkeypatch, fake)

        with patch("app.api.routers.voices_helpers._is_engine_active", return_value=True), \
             patch("app.db.state.put_job"), \
             patch("app.orchestration.scheduler.orchestrator.TaskOrchestrator.submit"):
            resp = client.post(
                "/api/voices/huggingface/upload",
                json={"voice_id": "gravel-road", "hub_id": "someone/gravel-road"},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "generating"
        assert fake.upload_calls == []

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
        folder = call["folder_path"]
        uploaded_rel_paths = {p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()}
        assert "voice.json" in uploaded_rel_paths
        assert "samples/preview.mp3" in uploaded_rel_paths  # pins structure preservation, not flattening
        assert "as-narrator" in call["tags"]
