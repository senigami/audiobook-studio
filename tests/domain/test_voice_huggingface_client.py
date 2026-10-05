"""Tests for the real ``HFHubClient`` implementation (app.domain.voices.huggingface).

Unlike ``test_voice_huggingface.py`` (which mocks at the ``HFHubClientProtocol``
boundary), these tests exercise ``HFHubClient`` itself and mock one level lower:
the ``huggingface_hub`` library's ``HfApi``/``hf_hub_download``/``ModelCard``
surface. No real HTTP call to huggingface.co is made anywhere in this file
(testing-standards.md R2 — network is a valid mock boundary).

Also covers ``validate_hub_id``, the strict namespace/repo-name validator that
guards every ``hub_id`` before it reaches an outbound HTTPS call or a local
file path (SSRF-via-malformed-hub-id / path-injection defense).
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# validate_hub_id
# ---------------------------------------------------------------------------


class TestValidateHubId:
    @pytest.mark.parametrize(
        "hub_id",
        [
            "someone/voice",
            "Org-Name/repo.name_2",
            "a/b",
        ],
    )
    def test_accepts_well_formed_ids(self, hub_id):
        from app.domain.voices.huggingface import validate_hub_id

        assert validate_hub_id(hub_id) == hub_id

    @pytest.mark.parametrize(
        "hub_id",
        [
            "",
            "no-slash-at-all",
            "../../etc/passwd",
            "someone/../escape",
            "someone/voice/extra",
            "/leading-slash/voice",
            "someone/",
            "/voice",
            "someone/voice with spaces",
            "http://evil.example.com/someone/voice",
            "someone/voice\n",
            "someone/..",
            "./someone/voice",
        ],
    )
    def test_rejects_malformed_ids(self, hub_id):
        from app.domain.voices.huggingface import validate_hub_id

        with pytest.raises(ValueError):
            validate_hub_id(hub_id)


# ---------------------------------------------------------------------------
# HFHubClient — mocked at the huggingface_hub.HfApi boundary
# ---------------------------------------------------------------------------


def _fake_model_info(**overrides):
    defaults = dict(
        id="someone/voice",
        author="someone",
        tags=["audiobook-studio-voice"],
        likes=3,
        sha="deadbeef",
        card_data=SimpleNamespace(to_dict=lambda: {"license": "cc-by-4.0", "language": ["en"]}),
        siblings=[SimpleNamespace(rfilename="samples/preview.mp3")],
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestHFHubClientSearch:
    def test_search_models_maps_hf_api_results(self):
        from app.domain.voices.huggingface import HFHubClient

        with patch("huggingface_hub.HfApi") as MockHfApi:
            instance = MockHfApi.return_value
            instance.list_models.return_value = [
                SimpleNamespace(id="someone/voice-a", author="someone", tags=["audiobook-studio-voice"], likes=5),
            ]
            client = HFHubClient()
            results = client.search_models(tag="audiobook-studio-voice", query="narrator")

        assert results == [{"id": "someone/voice-a", "author": "someone", "tags": ["audiobook-studio-voice"], "likes": 5}]
        instance.list_models.assert_called_once()
        _, kwargs = instance.list_models.call_args
        assert kwargs["tags"] == ["audiobook-studio-voice"]
        assert kwargs["search"] == "narrator"


class TestHFHubClientInspect:
    def test_get_model_card_rejects_malformed_hub_id_before_any_call(self):
        from app.domain.voices.huggingface import HFHubClient

        with patch("huggingface_hub.HfApi") as MockHfApi:
            client = HFHubClient()
            with pytest.raises(ValueError):
                client.get_model_card("../escape")
            MockHfApi.return_value.model_info.assert_not_called()

    def test_get_model_card_parses_license_languages_and_sample_url(self):
        from app.domain.voices.huggingface import HFHubClient

        with patch("huggingface_hub.HfApi") as MockHfApi, patch("huggingface_hub.ModelCard") as MockModelCard:
            instance = MockHfApi.return_value
            instance.model_info.return_value = _fake_model_info()
            MockModelCard.load.return_value = SimpleNamespace(text="A weathered narrator voice.")

            client = HFHubClient()
            card = client.get_model_card("someone/voice")

        assert card["license"] == "cc-by-4.0"
        assert card["languages"] == ["en"]
        assert card["sha"] == "deadbeef"
        assert card["author"] == "someone"
        assert card["description"] == "A weathered narrator voice."
        assert card["sample_url"] == "https://huggingface.co/someone/voice/resolve/main/samples/preview.mp3"

    def test_get_model_card_tolerates_missing_readme(self):
        from app.domain.voices.huggingface import HFHubClient

        with patch("huggingface_hub.HfApi") as MockHfApi, patch("huggingface_hub.ModelCard") as MockModelCard:
            instance = MockHfApi.return_value
            instance.model_info.return_value = _fake_model_info(card_data=None, siblings=[])
            MockModelCard.load.side_effect = Exception("no README")

            client = HFHubClient()
            card = client.get_model_card("someone/voice")

        assert card["license"] is None
        assert card["languages"] == []
        assert card["description"] == ""
        assert card["sample_url"] is None


class TestHFHubClientDownload:
    def test_download_files_rejects_malformed_hub_id(self):
        from app.domain.voices.huggingface import HFHubClient

        with patch("huggingface_hub.HfApi"):
            client = HFHubClient()
            with pytest.raises(ValueError):
                client.download_files("not-a-valid-id")

    def test_download_files_writes_under_transient_dir_containment(self, tmp_path, monkeypatch):
        from app.domain.voices.huggingface import HFHubClient

        monkeypatch.setattr("app.core.config.TRANSIENT_DIR", tmp_path)

        with patch("huggingface_hub.HfApi") as MockHfApi, patch("huggingface_hub.hf_hub_download") as mock_download:
            instance = MockHfApi.return_value
            instance.list_repo_files.return_value = ["voice.json", "samples/preview.mp3"]

            def fake_download(*, repo_id, filename, revision, token, local_dir):
                dest = Path(local_dir) / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"data")
                return str(dest)

            mock_download.side_effect = fake_download

            client = HFHubClient()
            paths = client.download_files("someone/voice")

        assert len(paths) == 2
        expected_root = (tmp_path / "hf_downloads" / "someone__voice").resolve()
        for path in paths:
            assert str(path.resolve()).startswith(str(expected_root))

    def test_download_files_never_logs_token(self, tmp_path, monkeypatch, caplog):
        import logging

        from app.domain.voices.huggingface import HFHubClient, HFToken

        monkeypatch.setattr("app.core.config.TRANSIENT_DIR", tmp_path)
        token = HFToken(value="super-secret-hf-token")

        with patch("huggingface_hub.HfApi") as MockHfApi, patch("huggingface_hub.hf_hub_download") as mock_download:
            instance = MockHfApi.return_value
            instance.list_repo_files.return_value = ["voice.json"]

            def fake_download(*, repo_id, filename, revision, token, local_dir):
                dest = Path(local_dir) / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"data")
                return str(dest)

            mock_download.side_effect = fake_download

            client = HFHubClient()
            with caplog.at_level(logging.DEBUG):
                client.download_files("someone/voice", token=token)

        assert "super-secret-hf-token" not in caplog.text
        # The raw token string (not the HFToken wrapper) is what's handed to hf_hub_download.
        _, kwargs = mock_download.call_args
        assert kwargs["token"] == "super-secret-hf-token"

    def test_download_files_rejects_path_traversal_filename_independent_of_the_library(
        self, tmp_path, monkeypatch
    ):
        """Gap 1: this module must not trust huggingface_hub's internal filename
        sanitization — a repo-controlled filename shaped like a path-traversal
        attempt must never reach hf_hub_download's local_dir/path construction.
        """
        from app.domain.voices.huggingface import HFHubClient

        monkeypatch.setattr("app.core.config.TRANSIENT_DIR", tmp_path)

        with patch("huggingface_hub.HfApi") as MockHfApi, patch("huggingface_hub.hf_hub_download") as mock_download:
            instance = MockHfApi.return_value
            instance.list_repo_files.return_value = ["../../evil", "voice.json"]

            def fake_download(*, repo_id, filename, revision, token, local_dir):
                dest = Path(local_dir) / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"data")
                return str(dest)

            mock_download.side_effect = fake_download

            client = HFHubClient()
            paths = client.download_files("someone/voice")

        # The traversal-shaped filename must never be handed to hf_hub_download.
        called_filenames = [kwargs["filename"] for _, kwargs in mock_download.call_args_list]
        assert "../../evil" not in called_filenames
        # The legitimate file still downloads.
        assert len(paths) == 1
        assert paths[0].name == "voice.json"

    def test_download_files_filters_to_audio_and_manifest_extensions(self, tmp_path, monkeypatch):
        """Gap 2: non-audio/manifest files (e.g. multi-GB model weights) must be
        filtered out before any download call is made."""
        from app.domain.voices.huggingface import HFHubClient

        monkeypatch.setattr("app.core.config.TRANSIENT_DIR", tmp_path)

        with patch("huggingface_hub.HfApi") as MockHfApi, patch("huggingface_hub.hf_hub_download") as mock_download:
            instance = MockHfApi.return_value
            instance.list_repo_files.return_value = [
                "voice.json",
                "samples/preview.mp3",
                "pytorch_model.bin",
                "model.safetensors",
                "README.md",
            ]

            def fake_download(*, repo_id, filename, revision, token, local_dir):
                dest = Path(local_dir) / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"data")
                return str(dest)

            mock_download.side_effect = fake_download

            client = HFHubClient()
            paths = client.download_files("someone/voice")

        called_filenames = {kwargs["filename"] for _, kwargs in mock_download.call_args_list}
        assert called_filenames == {"voice.json", "samples/preview.mp3"}
        assert len(paths) == 2

    def test_download_files_caps_file_count(self, tmp_path, monkeypatch):
        """Gap 2: a repo listing an excessive number of allowlisted files must
        not trigger unbounded downloads."""
        from app.domain.voices.huggingface import HFHubClient, MAX_DOWNLOAD_FILES

        monkeypatch.setattr("app.core.config.TRANSIENT_DIR", tmp_path)

        with patch("huggingface_hub.HfApi") as MockHfApi, patch("huggingface_hub.hf_hub_download") as mock_download:
            instance = MockHfApi.return_value
            instance.list_repo_files.return_value = [f"samples/track-{i}.wav" for i in range(500)]

            def fake_download(*, repo_id, filename, revision, token, local_dir):
                dest = Path(local_dir) / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"data")
                return str(dest)

            mock_download.side_effect = fake_download

            client = HFHubClient()
            paths = client.download_files("someone/voice")

        assert mock_download.call_count <= MAX_DOWNLOAD_FILES
        assert len(paths) <= MAX_DOWNLOAD_FILES


class TestHFHubClientUpload:
    def test_upload_files_rejects_malformed_hub_id(self):
        from app.domain.voices.huggingface import HFHubClient, HFToken

        with patch("huggingface_hub.HfApi"):
            client = HFHubClient()
            with pytest.raises(ValueError):
                client.upload_files("bad id", Path("/tmp/whatever"), tags=[], token=HFToken(value="x"))

    def test_upload_files_requires_a_token(self):
        from app.domain.voices.huggingface import HFHubClient, HFToken

        with patch("huggingface_hub.HfApi"):
            client = HFHubClient()
            with pytest.raises(ValueError):
                client.upload_files("someone/voice", Path("/tmp/whatever"), tags=[], token=HFToken(value=""))

    def test_upload_files_creates_repo_and_uploads_folder(self, tmp_path):
        from app.domain.voices.huggingface import HFHubClient, HFToken

        (tmp_path / "voice.json").write_text("{}")

        with patch("huggingface_hub.HfApi") as MockHfApi:
            instance = MockHfApi.return_value
            instance.upload_folder.return_value = SimpleNamespace(oid="abc123")

            client = HFHubClient()
            commit_id = client.upload_files(
                "someone/voice", tmp_path, tags=["as-narrator"], token=HFToken(value="secret-token")
            )

        instance.create_repo.assert_called_once()
        assert instance.create_repo.call_args.kwargs["repo_type"] == "model"
        instance.upload_folder.assert_called_once()
        assert instance.upload_folder.call_args.kwargs["folder_path"] == str(tmp_path)
        assert instance.upload_folder.call_args.kwargs["repo_type"] == "model"
        assert commit_id == "abc123"

    def test_upload_files_never_logs_or_returns_token(self, caplog, tmp_path):
        import logging

        from app.domain.voices.huggingface import HFHubClient, HFToken

        with patch("huggingface_hub.HfApi") as MockHfApi:
            instance = MockHfApi.return_value
            instance.upload_folder.return_value = SimpleNamespace(oid="abc123")

            client = HFHubClient()
            with caplog.at_level(logging.DEBUG):
                commit_id = client.upload_files(
                    "someone/voice", tmp_path, tags=[], token=HFToken(value="super-secret-hf-token")
                )

        assert "super-secret-hf-token" not in caplog.text
        assert "super-secret-hf-token" not in commit_id
