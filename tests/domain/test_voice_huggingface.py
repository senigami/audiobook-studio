"""Tests for the Hugging Face voice import/export scaffold (foundation-only).

Covers (per the task spec, ``design-docs/plans/active/v2_huggingface_voice_interface.md``):

- Card inspection parses the license correctly.
- A restrictive license is flagged, never blocked.
- The consent-gate check gates on explicit confirmation only.
- Export produces the expected ``.asvoice.zip`` structure.
- The HF token is never present in any exported/serialized representation or
  log message.

All Hub network access is mocked at the ``HFHubClientProtocol`` boundary
(testing-standards.md R2 — network is a valid mock boundary); no real HTTP
call is made.
"""

from __future__ import annotations

import json
import logging
import zipfile
from pathlib import Path
from typing import Any, Optional

import pytest


# ---------------------------------------------------------------------------
# Fake Hub client (the mock boundary — implements HFHubClientProtocol)
# ---------------------------------------------------------------------------


class FakeHFHubClient:
    def __init__(
        self,
        *,
        search_results: Optional[list[dict[str, Any]]] = None,
        card: Optional[dict[str, Any]] = None,
        upload_commit_id: str = "abc123",
    ) -> None:
        self._search_results = search_results or []
        self._card = card or {}
        self._upload_commit_id = upload_commit_id
        self.upload_calls: list[dict[str, Any]] = []

    def search_models(self, *, tag: str, query: Optional[str] = None) -> list[dict[str, Any]]:
        assert tag == "audiobook-studio-voice"
        return self._search_results

    def get_model_card(self, hub_id: str, *, revision: Optional[str] = None) -> dict[str, Any]:
        return self._card

    def download_files(self, hub_id, *, revision=None, token=None) -> list[Path]:  # pragma: no cover - unused here
        return []

    def upload_files(self, hub_id, folder_path, *, tags, token) -> str:
        # Record everything the module handed us so tests can assert the
        # token is used only as an opaque credential, never serialized.
        self.upload_calls.append({"hub_id": hub_id, "folder_path": folder_path, "tags": tags, "token": token})
        return self._upload_commit_id


# ---------------------------------------------------------------------------
# Card inspection
# ---------------------------------------------------------------------------


class TestInspectCard:
    def test_parses_license_and_metadata(self):
        from app.domain.voices.huggingface import inspect_card

        client = FakeHFHubClient(
            card={
                "license": "cc-by-4.0",
                "sha": "deadbeef",
                "languages": ["en-US"],
                "tags": ["audiobook-studio-voice", "as-gender-masculine"],
                "author": "someone",
                "description": "A weathered narrator voice.",
                "sample_url": "https://huggingface.co/someone/voice/resolve/main/samples/preview.mp3",
            }
        )

        result = inspect_card(client, "someone/voice")

        assert result.hub_id == "someone/voice"
        assert result.license == "cc-by-4.0"
        assert result.revision == "deadbeef"
        assert result.languages == ["en-US"]
        assert result.author == "someone"
        assert result.description == "A weathered narrator voice."
        assert result.sample_url.endswith("preview.mp3")

    def test_permissive_license_not_flagged(self):
        from app.domain.voices.huggingface import inspect_card

        client = FakeHFHubClient(card={"license": "cc-by-4.0"})
        result = inspect_card(client, "someone/voice")

        assert result.is_restrictive_license is False

    def test_restrictive_license_is_flagged_not_blocked(self):
        from app.domain.voices.huggingface import inspect_card

        client = FakeHFHubClient(card={"license": "cc-by-nc-nd-4.0"})
        result = inspect_card(client, "someone/voice")

        # Flagged...
        assert result.is_restrictive_license is True
        # ...but inspect_card returns normally rather than raising/blocking.
        assert result.license == "cc-by-nc-nd-4.0"

    def test_missing_license_is_not_restrictive(self):
        from app.domain.voices.huggingface import inspect_card

        client = FakeHFHubClient(card={})
        result = inspect_card(client, "someone/voice")

        assert result.license is None
        assert result.is_restrictive_license is False


# ---------------------------------------------------------------------------
# Consent gate
# ---------------------------------------------------------------------------


class TestConsentGate:
    def test_explicit_true_grants_consent(self):
        from app.domain.voices.huggingface import check_consent

        decision = check_consent(user_confirmed=True)

        assert decision.granted is True
        assert decision.consent_ack is True
        assert decision.reason is None

    @pytest.mark.parametrize("value", [False, None])
    def test_missing_or_false_confirmation_denies_consent(self, value):
        from app.domain.voices.huggingface import check_consent

        decision = check_consent(user_confirmed=value)

        assert decision.granted is False
        assert decision.consent_ack is False
        assert decision.reason


# ---------------------------------------------------------------------------
# Export bundle structure
# ---------------------------------------------------------------------------


class TestExportHFVoiceBundle:
    def test_export_produces_expected_asvoice_zip_structure(self, tmp_path: Path):
        from app.domain.voices.huggingface import export_hf_voice_bundle

        voice_manifest = {
            "spec": "audiobook-studio-voice",
            "spec_version": "1.0",
            "id": "gravel-road",
            "name": "Gravel Road",
        }
        sample_bytes = b"fake-mp3-bytes"

        bundle_path = export_hf_voice_bundle(
            voice_manifest=voice_manifest,
            sample_mp3_bytes=sample_bytes,
            output_dir=tmp_path,
            bundle_name="gravel-road",
        )

        assert bundle_path == tmp_path / "gravel-road.asvoice.zip"
        assert bundle_path.exists()

        with zipfile.ZipFile(bundle_path) as zf:
            names = set(zf.namelist())
            assert names == {"voice.json", "samples/preview.mp3", "README.md"}

            manifest_out = json.loads(zf.read("voice.json"))
            # The manifest has no samples[] and a real sample is being
            # published, so the export synthesizes one (matching the
            # generated README's widget block) -- verified separately below.
            assert manifest_out == {
                **voice_manifest,
                "samples": [{"path": "samples/preview.mp3", "primary": True}],
            }

            assert zf.read("samples/preview.mp3") == sample_bytes
            assert "icon.png" not in names  # no icon_bytes passed -> optional path stays optional

    def test_export_creates_output_dir_when_missing(self, tmp_path: Path):
        """``output_dir`` doesn't exist yet -- export must create it
        (``output_dir.mkdir(parents=True, exist_ok=True)``) rather than
        raising, distinct from the sibling test which writes into a
        pre-existing directory."""
        from app.domain.voices.huggingface import export_hf_voice_bundle

        out_dir = tmp_path / "exports" / "nested"
        assert not out_dir.exists()

        bundle_path = export_hf_voice_bundle(
            voice_manifest={"id": "x", "name": "X"},
            sample_mp3_bytes=b"",
            output_dir=out_dir,
            bundle_name="x",
        )

        assert bundle_path.parent == out_dir
        assert out_dir.is_dir()
        assert bundle_path.exists()

    def test_export_rejects_bundle_name_path_traversal(self, tmp_path: Path):
        """A Hub-derived or user-typed bundle_name must not escape output_dir."""
        from app.domain.voices.huggingface import export_hf_voice_bundle

        out_dir = tmp_path / "exports"

        with pytest.raises(ValueError):
            export_hf_voice_bundle(
                voice_manifest={"id": "x", "name": "X"},
                sample_mp3_bytes=b"",
                output_dir=out_dir,
                bundle_name="../../escaped",
            )

        # Nothing was written outside output_dir.
        assert not (tmp_path / "escaped.asvoice.zip").exists()

    def test_export_includes_icon_when_provided(self, tmp_path: Path):
        from app.domain.voices.huggingface import export_hf_voice_bundle

        bundle_path = export_hf_voice_bundle(
            voice_manifest={"id": "x", "name": "X"},
            sample_mp3_bytes=b"fake-mp3-bytes",
            output_dir=tmp_path,
            bundle_name="x",
            icon_bytes=b"fake-png-bytes",
        )

        with zipfile.ZipFile(bundle_path) as zf:
            names = set(zf.namelist())
            assert "icon.png" in names
            assert zf.read("icon.png") == b"fake-png-bytes"

    def test_export_readme_reflects_voice_manifest(self, tmp_path: Path):
        from app.domain.voices.huggingface import export_hf_voice_bundle

        bundle_path = export_hf_voice_bundle(
            voice_manifest={
                "id": "gravel-road",
                "name": "Gravel Road",
                "description": "A weathered, low Southern drawl.",
                "attributes": {"class": "human", "gender": "masculine", "age": "senior"},
            },
            sample_mp3_bytes=b"fake-mp3-bytes",
            output_dir=tmp_path,
            bundle_name="gravel-road",
        )

        with zipfile.ZipFile(bundle_path) as zf:
            readme = zf.read("README.md").decode()

        assert "Gravel Road" in readme

    def test_export_readme_has_playable_widget_even_without_manifest_samples(self, tmp_path: Path):
        """The manifest handed in has no samples[] (the common case for an
        installed voice today) -- the export must still synthesize a widget
        entry pointing at the bundled sample, not silently ship a
        non-playable Hub card."""
        from app.domain.voices.huggingface import export_hf_voice_bundle

        voice_manifest = {"id": "gravel-road", "name": "Gravel Road"}
        assert "samples" not in voice_manifest

        bundle_path = export_hf_voice_bundle(
            voice_manifest=voice_manifest,
            sample_mp3_bytes=b"fake-mp3-bytes",
            output_dir=tmp_path,
            bundle_name="gravel-road",
        )

        with zipfile.ZipFile(bundle_path) as zf:
            readme = zf.read("README.md").decode()

        assert "widget:" in readme
        assert "url: samples/preview.mp3" in readme


# ---------------------------------------------------------------------------
# Token never logged / never serialized
# ---------------------------------------------------------------------------


class TestTokenHandling:
    def test_token_repr_and_str_are_redacted(self):
        from app.domain.voices.huggingface import HFToken

        token = HFToken(value="super-secret-hf-token")

        assert "super-secret-hf-token" not in repr(token)
        assert "super-secret-hf-token" not in str(token)

    def test_token_not_present_in_upload_log_output(self, caplog: pytest.LogCaptureFixture, tmp_path: Path):
        from app.domain.voices.huggingface import HFToken, upload_voice_to_hub

        client = FakeHFHubClient()
        token = HFToken(value="super-secret-hf-token")
        (tmp_path / "voice.json").write_text("{}")

        with caplog.at_level(logging.INFO):
            commit_id = upload_voice_to_hub(
                client,
                "someone/voice",
                tmp_path,
                extra_tags=["as-gender-masculine"],
                token=token,
            )

        assert commit_id == "abc123"
        assert "super-secret-hf-token" not in caplog.text

        # The client receives the token as a credential (to make the call),
        # but it is never included in any returned/serialized value.
        assert client.upload_calls[0]["token"] is token
        serializable = {
            "hub_id": client.upload_calls[0]["hub_id"],
            "folder_path": str(client.upload_calls[0]["folder_path"]),
            "tags": client.upload_calls[0]["tags"],
        }
        assert "super-secret-hf-token" not in json.dumps(serializable)

    def test_token_not_present_in_exported_bundle(self, tmp_path: Path):
        from app.domain.voices.huggingface import HFToken, export_hf_voice_bundle

        token = HFToken(value="super-secret-hf-token")  # noqa: F841 - deliberately unused by export

        bundle_path = export_hf_voice_bundle(
            voice_manifest={"id": "x", "name": "X", "token_hint": str(token)},
            sample_mp3_bytes=b"data",
            output_dir=tmp_path,
            bundle_name="x",
        )

        raw_zip_bytes = bundle_path.read_bytes()
        assert b"super-secret-hf-token" not in raw_zip_bytes


# ---------------------------------------------------------------------------
# Search (small extra sanity check exercising the mocked client boundary)
# ---------------------------------------------------------------------------


class TestSearchVoices:
    def test_search_maps_raw_results_to_dataclasses(self):
        from app.domain.voices.huggingface import search_voices

        client = FakeHFHubClient(
            search_results=[
                {"id": "someone/voice-a", "author": "someone", "tags": ["audiobook-studio-voice"], "likes": 3},
            ]
        )

        results = search_voices(client, query="narrator")

        assert len(results) == 1
        assert results[0].hub_id == "someone/voice-a"
        assert results[0].author == "someone"
        assert results[0].likes == 3
