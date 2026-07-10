"""Security tests for S10: secret-aware plugin settings.

Spec: A ``settings_schema.json`` field marked ``"secret": true`` must be
(a) masked as ``"***"`` wherever engine settings are returned to a client, and
(b) never overwritten when the client saves the masked sentinel back.

Test structure mirrors the S1 precedent in test_api_key_security.py.
R2: only filesystem boundary is mocked (PLUGIN_DATA_DIR redirected to tmp_path).
R4: no sleeps.
"""
from __future__ import annotations

import json
import pytest
from pathlib import Path
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SENTINEL = "***"
_REAL_KEY = "sk-super-secret-key"

_SCHEMA_WITH_SECRET = {
    "type": "object",
    "properties": {
        "api_key": {
            "type": "string",
            "title": "API Key",
            "secret": True,
        },
        "model": {
            "type": "string",
            "title": "Model",
        },
    },
}

_SCHEMA_NO_SECRET = {
    "type": "object",
    "properties": {
        "temperature": {
            "type": "number",
            "title": "Temperature",
        },
    },
}


def _write_schema(plugin_dir: Path, schema: dict) -> None:
    (plugin_dir / "settings_schema.json").write_text(
        json.dumps(schema), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# secret_keys() helper
# ---------------------------------------------------------------------------

class TestSecretKeys:
    def test_returns_secret_keys(self):
        from app.tts_server.settings_store import secret_keys
        result = secret_keys(_SCHEMA_WITH_SECRET)
        assert result == {"api_key"}

    def test_empty_schema_returns_empty_set(self):
        from app.tts_server.settings_store import secret_keys
        assert secret_keys({}) == set()
        assert secret_keys({"properties": {}}) == set()

    def test_no_secret_flag_excluded(self):
        from app.tts_server.settings_store import secret_keys
        result = secret_keys(_SCHEMA_NO_SECRET)
        assert result == set()


# ---------------------------------------------------------------------------
# redact_secret_settings()
# ---------------------------------------------------------------------------

class TestRedactSecretSettings:
    def test_secret_key_with_value_is_masked(self):
        from app.tts_server.settings_store import redact_secret_settings
        settings = {"api_key": _REAL_KEY, "model": "v1"}
        result = redact_secret_settings(settings, _SCHEMA_WITH_SECRET)
        assert result["api_key"] == _SENTINEL

    def test_secret_key_empty_becomes_empty_string(self):
        from app.tts_server.settings_store import redact_secret_settings
        settings = {"api_key": "", "model": "v1"}
        result = redact_secret_settings(settings, _SCHEMA_WITH_SECRET)
        assert result["api_key"] == ""

    def test_non_secret_key_unchanged(self):
        from app.tts_server.settings_store import redact_secret_settings
        settings = {"api_key": _REAL_KEY, "model": "gpt-4"}
        result = redact_secret_settings(settings, _SCHEMA_WITH_SECRET)
        assert result["model"] == "gpt-4"

    def test_does_not_mutate_original(self):
        from app.tts_server.settings_store import redact_secret_settings
        settings = {"api_key": _REAL_KEY, "model": "v1"}
        _ = redact_secret_settings(settings, _SCHEMA_WITH_SECRET)
        assert settings["api_key"] == _REAL_KEY

    def test_no_schema_returns_unchanged(self):
        from app.tts_server.settings_store import redact_secret_settings
        settings = {"api_key": _REAL_KEY}
        result = redact_secret_settings(settings, {})
        assert result["api_key"] == _REAL_KEY


# ---------------------------------------------------------------------------
# merge_settings() sentinel guard
# ---------------------------------------------------------------------------

class TestMergeSettingsSentinelGuard:
    """Posting '***' on a secret key must leave the stored real value intact."""

    def test_sentinel_is_dropped_for_secret_key(self):
        from app.tts_server.settings_store import merge_settings
        base = {"api_key": _REAL_KEY, "model": "v1"}
        updates = {"api_key": _SENTINEL}
        merged, errors = merge_settings(base, updates, _SCHEMA_WITH_SECRET)
        assert errors == []
        assert merged["api_key"] == _REAL_KEY, (
            "Posting '***' must not overwrite the stored real key"
        )

    def test_real_new_value_is_accepted_for_secret_key(self):
        from app.tts_server.settings_store import merge_settings
        base = {"api_key": _REAL_KEY, "model": "v1"}
        updates = {"api_key": "sk-new-key"}
        merged, errors = merge_settings(base, updates, _SCHEMA_WITH_SECRET)
        assert errors == []
        assert merged["api_key"] == "sk-new-key"

    def test_sentinel_dropped_non_secret_is_accepted_normally(self):
        """'***' is only special for secret keys; non-secrets pass through."""
        from app.tts_server.settings_store import merge_settings
        base = {"temperature": 0.8}
        updates = {"temperature": 0.9}
        merged, errors = merge_settings(base, updates, _SCHEMA_NO_SECRET)
        assert errors == []
        assert merged["temperature"] == 0.9


# ---------------------------------------------------------------------------
# GET /engines/{engine_id}/settings — TTS server endpoint
# ---------------------------------------------------------------------------

class TestGetEngineSettingsRedaction:
    """
    R1: The redaction branch doesn't exist yet; run the test, confirm it fails
    (returns raw key instead of '***'), then implement.
    """

    @pytest.fixture
    def plugin_dir(self, tmp_path):
        """A minimal plugin dir with a secret-bearing schema."""
        pdir = tmp_path / "tts_myengine"
        pdir.mkdir()
        _write_schema(pdir, _SCHEMA_WITH_SECRET)
        return pdir

    def test_get_settings_returns_masked_secret(self, plugin_dir, tmp_path):
        from app.tts_server.settings_store import save_settings
        from app.tts_server import settings_store

        # Redirect PLUGIN_DATA_DIR so save/load use tmp_path
        with patch.object(settings_store, "_runtime_file") as mock_rf:
            settings_file = tmp_path / "plugin_data" / "myengine" / "settings.json"
            settings_file.parent.mkdir(parents=True)
            settings_file.write_text(
                json.dumps({"api_key": _REAL_KEY, "model": "v1"}),
                encoding="utf-8",
            )
            mock_rf.return_value = settings_file

            # Also redirect _load_settings_schema to the plugin_dir
            from app.tts_server import settings_store as ss
            from app.tts_server.settings_store import (
                load_settings,
                _load_settings_schema,
                redact_secret_settings,
            )

            raw = load_settings(plugin_dir)
            schema = _load_settings_schema(plugin_dir)
            result = redact_secret_settings(raw, schema)

        assert result["api_key"] == _SENTINEL, (
            "GET engine settings must mask secret keys as '***'"
        )
        assert result["model"] == "v1", (
            "Non-secret fields must pass through unchanged"
        )
        assert _REAL_KEY not in json.dumps(result), (
            "Real key value must not appear in the redacted output"
        )


# ---------------------------------------------------------------------------
# Integration: save sentinel → stored value is preserved
# ---------------------------------------------------------------------------

class TestSentinelRoundTrip:
    """End-to-end: user reads '***', posts it back; real key survives."""

    def test_posting_sentinel_preserves_stored_secret(self, tmp_path):
        from app.tts_server.settings_store import merge_settings

        # Simulate what is loaded from disk
        stored = {"api_key": _REAL_KEY, "model": "turbo"}

        # Simulate what the UI sends back (the masked value it received)
        payload = {"api_key": _SENTINEL, "model": "turbo"}

        merged, errors = merge_settings(stored, payload, _SCHEMA_WITH_SECRET)
        assert errors == []
        assert merged["api_key"] == _REAL_KEY

    def test_real_value_update_passes_through(self, tmp_path):
        from app.tts_server.settings_store import merge_settings

        stored = {"api_key": _REAL_KEY, "model": "turbo"}
        payload = {"api_key": "sk-updated-key", "model": "turbo-v2"}

        merged, errors = merge_settings(stored, payload, _SCHEMA_WITH_SECRET)
        assert errors == []
        assert merged["api_key"] == "sk-updated-key"
        assert merged["model"] == "turbo-v2"
