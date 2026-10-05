"""Regression test: enabling a delegation-only engine with no settings_schema.

``update_engine_settings`` used to hard-fail with a 500 ("engine provides no
settings_schema") for *any* settings update on an engine whose
``settings_schema()`` legitimately returns ``{}`` (e.g. the built-in "mixed"
orchestrator, which has no configurable settings of its own) -- including a
bare ``{"enabled": true}`` toggle that carries no schema-governed fields at
all. This blocked the "Mixed Synthesis" engine from ever being enabled.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest


def _make_schemaless_plugin(engine_id: str, plugin_dir) -> SimpleNamespace:
    class _NoSchemaEngine:
        def settings_schema(self) -> dict:
            return {}

        def check_env(self):
            return True, "OK"

    return SimpleNamespace(
        engine_id=engine_id,
        folder_name=f"tts_{engine_id}",
        plugin_dir=plugin_dir,
        engine=_NoSchemaEngine(),
        manifest={"engine_id": engine_id, "built_in": True},
        settings_schema=None,
        verified=True,
        verification_error=None,
        load_error=None,
        dependencies_satisfied=True,
        missing_dependencies=[],
        setup_message=None,
    )


@pytest.fixture
def schemaless_client(tmp_path, monkeypatch):
    from app.tts_server import server as server_module

    plugin = _make_schemaless_plugin("mixed", tmp_path / "tts_mixed")
    monkeypatch.setattr(server_module, "_plugins", [plugin])

    from fastapi.testclient import TestClient

    return TestClient(server_module.app)


def test_enable_toggle_succeeds_for_engine_with_no_settings_schema(schemaless_client):
    response = schemaless_client.put(
        "/engines/mixed/settings", json={"settings": {"enabled": True}}
    )
    assert response.status_code == 200, response.text


def test_enable_toggle_persists_enabled_true(schemaless_client, tmp_path):
    schemaless_client.put("/engines/mixed/settings", json={"settings": {"enabled": True}})

    from app.tts_server.settings_store import load_settings

    saved = load_settings(tmp_path / "tts_mixed")
    assert saved.get("enabled") is True


def test_real_schema_field_update_still_requires_schema(tmp_path, monkeypatch):
    """A schema-governed field update on a schemaless engine must still fail."""
    from app.tts_server import server as server_module

    plugin = _make_schemaless_plugin("mixed", tmp_path / "tts_mixed")
    monkeypatch.setattr(server_module, "_plugins", [plugin])

    from fastapi.testclient import TestClient

    client = TestClient(server_module.app)
    response = client.put(
        "/engines/mixed/settings", json={"settings": {"some_field": "value"}}
    )
    assert response.status_code == 500
