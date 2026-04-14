"""Tests for the TTS Server HTTP client."""

from __future__ import annotations

import pytest

from unittest.mock import MagicMock, patch

from app.engines.tts_client import (
    TtsClient,
    TtsServerConnectionError,
    TtsServerResponseError,
    _safe_id,
)


class TestSafeId:
    def test_valid_id_passthrough(self):
        assert _safe_id("xtts") == "xtts"

    def test_strips_dangerous_characters(self):
        assert _safe_id("xtts/../secret") == "xttssecret"

    def test_empty_id_raises(self):
        with pytest.raises(ValueError):
            _safe_id("")

    def test_only_special_chars_raises(self):
        with pytest.raises(ValueError):
            _safe_id("../../")


class TestTtsClientHealth:
    def test_ping_returns_true_on_200(self):
        client = TtsClient("http://127.0.0.1:7862")

        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("httpx.get", return_value=mock_resp):
            assert client.ping() is True

    def test_ping_returns_true_on_207(self):
        client = TtsClient("http://127.0.0.1:7862")

        mock_resp = MagicMock()
        mock_resp.status_code = 207

        with patch("httpx.get", return_value=mock_resp):
            assert client.ping() is True

    def test_ping_returns_false_on_connection_error(self):
        import httpx
        client = TtsClient("http://127.0.0.1:7862")

        with patch("httpx.get", side_effect=httpx.ConnectError("refused")):
            assert client.ping() is False

    def test_ping_returns_false_on_non_200(self):
        client = TtsClient("http://127.0.0.1:7862")

        mock_resp = MagicMock()
        mock_resp.status_code = 500

        with patch("httpx.get", return_value=mock_resp):
            assert client.ping() is False


class TestTtsClientGet:
    def test_get_returns_json(self):
        client = TtsClient("http://127.0.0.1:7862")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "ok", "engines": []}

        with patch("httpx.get", return_value=mock_resp):
            result = client.health()

        assert result["status"] == "ok"

    def test_get_raises_on_500(self):
        import httpx as _httpx
        client = TtsClient("http://127.0.0.1:7862")

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"

        with patch("httpx.get", return_value=mock_resp):
            with pytest.raises(TtsServerResponseError):
                client.health()

    def test_get_engines_returns_list(self):
        client = TtsClient("http://127.0.0.1:7862")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [{"engine_id": "xtts"}]

        with patch("httpx.get", return_value=mock_resp):
            engines = client.get_engines()

        assert isinstance(engines, list)
        assert engines[0]["engine_id"] == "xtts"


class TestTtsClientSynthesize:
    def test_synthesize_sends_correct_payload(self):
        client = TtsClient("http://127.0.0.1:7862")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "ok": True,
            "engine_id": "xtts",
            "output_path": "/tmp/out.wav",
        }

        captured = {}

        def fake_post(url, json=None, timeout=None):
            captured["url"] = url
            captured["json"] = json
            return mock_resp

        with patch("httpx.post", fake_post):
            result = client.synthesize(
                engine_id="xtts",
                text="Hello world",
                output_path="/tmp/out.wav",
                language="en",
            )

        assert captured["json"]["engine_id"] == "xtts"
        assert captured["json"]["text"] == "Hello world"
        assert result["ok"] is True

    def test_synthesize_raises_on_connection_error(self):
        import httpx as _httpx
        client = TtsClient("http://127.0.0.1:7862")

        with patch("httpx.post", side_effect=_httpx.ConnectError("refused")):
            with pytest.raises(TtsServerConnectionError):
                client.synthesize(
                    engine_id="xtts",
                    text="Test",
                    output_path="/tmp/out.wav",
                )
