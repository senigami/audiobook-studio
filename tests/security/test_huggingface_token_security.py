"""Security tests for the Hugging Face access-token setting (S1 redaction).

Mirrors ``test_api_key_security.py``'s coverage for ``tts_api_key`` — the HF
token is stored via the exact same generic ``_SECRET_FIELDS`` mechanism in
``app/api/routers/system.py``, so it must never be returned in plain text and
never overwritten by round-tripping the redacted sentinel.
"""
import importlib
import os

import pytest
from unittest.mock import patch

DB_PATH = "/tmp/test_hf_token_security.db"


@pytest.fixture(autouse=True)
def isolated_db():
    if os.path.exists(DB_PATH):
        os.unlink(DB_PATH)
    os.environ["DB_PATH"] = DB_PATH

    import app.db.core as db_core
    importlib.reload(db_core)
    db_core.init_db()

    yield

    if os.path.exists(DB_PATH):
        os.unlink(DB_PATH)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.api.web import app as fastapi_app
    return TestClient(fastapi_app)


def _set_hf_token(token: str):
    from app.db.state import update_settings
    update_settings({"huggingface_token": token})


class TestHomeRedaction:
    def test_token_is_redacted_when_set(self, client):
        _set_hf_token("super-secret-hf-token")

        with patch("app.api.routers.system._build_runtime_services", return_value=[]), \
             patch("app.api.routers.system.get_voices_dir"):
            resp = client.get("/api/home")

        assert resp.status_code == 200
        settings = resp.json().get("settings", {})
        assert settings.get("huggingface_token") == "***"
        assert "super-secret-hf-token" not in resp.text

    def test_token_is_empty_string_when_not_set(self, client):
        _set_hf_token("")

        with patch("app.api.routers.system._build_runtime_services", return_value=[]), \
             patch("app.api.routers.system.get_voices_dir"):
            resp = client.get("/api/home")

        assert resp.status_code == 200
        settings = resp.json().get("settings", {})
        assert settings.get("huggingface_token", None) in ("", None)


class TestSettingsEndpointRedaction:
    def test_settings_response_redacts_token(self, client):
        _set_hf_token("another-hf-secret")
        resp = client.post(
            "/api/settings",
            json={"safe_mode": False},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        settings = resp.json().get("settings", {})
        assert settings.get("huggingface_token") == "***"
        assert "another-hf-secret" not in resp.text

    def test_posting_redacted_sentinel_does_not_overwrite_real_token(self, client):
        _set_hf_token("real-hf-token-value")

        resp = client.post(
            "/api/settings",
            json={"huggingface_token": "***"},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200

        from app.db.state import get_settings
        assert get_settings().get("huggingface_token") == "real-hf-token-value"

    def test_posting_new_token_value_is_accepted(self, client):
        _set_hf_token("old-hf-token")
        resp = client.post(
            "/api/settings",
            json={"huggingface_token": "new-hf-token"},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200

        from app.db.state import get_settings
        assert get_settings().get("huggingface_token") == "new-hf-token"
