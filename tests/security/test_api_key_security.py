"""Security tests for API key handling (S1 redaction, S2 timing-safe compare)."""
import importlib
import inspect
import os
import pytest
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

DB_PATH = "/tmp/test_api_key_security.db"


@pytest.fixture(autouse=True)
def isolated_db():
    """Each test gets a fresh, isolated SQLite database."""
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


def _set_api_key(key: str):
    """Write a raw (plain-text) API key directly into the settings store."""
    from app.db.state import update_settings
    update_settings({"tts_api_key": key})


# ---------------------------------------------------------------------------
# S1-A  GET /api/home does not expose the raw key
# ---------------------------------------------------------------------------

class TestHomeRedaction:
    def test_key_is_redacted_when_set(self, client):
        _set_api_key("super-secret-key")

        with patch("app.api.routers.system._build_runtime_services", return_value=[]), \
             patch("app.api.routers.system.get_voices_dir"):
            resp = client.get("/api/home")

        assert resp.status_code == 200
        data = resp.json()
        settings = data.get("settings", {})
        assert settings.get("tts_api_key") == "***", (
            "tts_api_key must be redacted to '***' when a key is stored"
        )
        assert "super-secret-key" not in resp.text, (
            "raw key must not appear anywhere in the response body"
        )

    def test_key_is_empty_string_when_not_set(self, client):
        # Ensure no key is stored
        from app.db.state import update_settings
        update_settings({"tts_api_key": ""})

        with patch("app.api.routers.system._build_runtime_services", return_value=[]), \
             patch("app.api.routers.system.get_voices_dir"):
            resp = client.get("/api/home")

        assert resp.status_code == 200
        settings = resp.json().get("settings", {})
        assert settings.get("tts_api_key", None) in ("", None), (
            "tts_api_key must be '' or absent when no key is configured"
        )


# ---------------------------------------------------------------------------
# S1-B  POST /api/settings does not expose the raw key
# ---------------------------------------------------------------------------

class TestSettingsEndpointRedaction:
    def test_settings_response_redacts_key(self, client):
        _set_api_key("another-secret")
        resp = client.post(
            "/api/settings",
            json={"safe_mode": False},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        settings = resp.json().get("settings", {})
        assert settings.get("tts_api_key") == "***"
        assert "another-secret" not in resp.text

    def test_posting_redacted_sentinel_does_not_overwrite_real_key(self, client):
        _set_api_key("real-key-value")

        # Round-trip the sentinel (as a UI would after reading the redacted value)
        resp = client.post(
            "/api/settings",
            json={"tts_api_key": "***"},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200

        # The stored key must still be the original
        from app.db.state import get_settings
        stored = get_settings().get("tts_api_key")
        assert stored == "real-key-value", (
            "Posting '***' must not overwrite the existing key"
        )

    def test_posting_new_key_value_is_accepted(self, client):
        _set_api_key("old-key")
        resp = client.post(
            "/api/settings",
            json={"tts_api_key": "new-key"},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200

        from app.db.state import get_settings
        stored = get_settings().get("tts_api_key")
        assert stored == "new-key", (
            "Posting a real new key value must update the stored key"
        )


# ---------------------------------------------------------------------------
# S2  Timing-safe comparison in security module
# ---------------------------------------------------------------------------

class TestTimingSafeComparison:
    def test_compare_digest_is_used_in_source(self):
        import app.core.security as sec_mod
        source = inspect.getsource(sec_mod)
        assert "compare_digest" in source, (
            "hmac.compare_digest must be used in app/core/security.py"
        )

    def test_correct_key_passes(self):
        from app.core.security import verify_api_key
        from fastapi.security import HTTPAuthorizationCredentials

        with patch("app.db.state.get_settings", return_value={
            "tts_api_enabled": True,
            "tts_api_key": "valid-key",
        }):
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-key")
            result = verify_api_key(credentials=creds)
            assert result == "valid-key"

    def test_wrong_key_raises_401(self):
        from app.core.security import verify_api_key
        from fastapi import HTTPException
        from fastapi.security import HTTPAuthorizationCredentials

        with patch("app.db.state.get_settings", return_value={
            "tts_api_enabled": True,
            "tts_api_key": "valid-key",
        }):
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong-key")
            with pytest.raises(HTTPException) as exc_info:
                verify_api_key(credentials=creds)
            assert exc_info.value.status_code == 401
