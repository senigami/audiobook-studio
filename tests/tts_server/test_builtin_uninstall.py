"""Built-in plugin uninstall protection (plan 05 Group 4 / M2).

``DELETE /engines/{engine_id}`` must refuse to uninstall a plugin whose
manifest declares ``built_in: true`` (tts_mixed is the shipped case) and
must still uninstall ordinary plugins.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.tts_server.plugin_loader import LoadedPlugin


def _plugin(tmp_path, engine_id: str, *, built_in: bool) -> LoadedPlugin:
    plugin_dir = tmp_path / f"tts_{engine_id}"
    plugin_dir.mkdir()
    manifest = {
        "studio_tts_manifest": "1.0",
        "engine_id": engine_id,
        "display_name": engine_id,
        "entry_class": "interface:Engine",
        "capabilities": ["synthesis"],
    }
    if built_in:
        manifest["built_in"] = True
    return LoadedPlugin(folder_name=f"tts_{engine_id}", plugin_dir=plugin_dir, manifest=manifest)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import app.tts_server.server as server_mod

    plugins = [
        _plugin(tmp_path, "mixedish", built_in=True),
        _plugin(tmp_path, "ordinary", built_in=False),
    ]
    monkeypatch.setattr(server_mod, "_plugins_dir", tmp_path)
    monkeypatch.setattr(server_mod, "_plugins", plugins)
    return TestClient(server_mod.app), tmp_path


def test_built_in_plugin_cannot_be_uninstalled(client):
    c, tmp_path = client
    resp = c.delete("/engines/mixedish")
    assert resp.status_code == 403
    assert "cannot be uninstalled" in resp.json()["detail"]
    # Directory untouched, plugin still registered.
    assert (tmp_path / "tts_mixedish").exists()
    assert c.delete("/engines/mixedish").status_code == 403


def test_ordinary_plugin_uninstalls(client):
    c, tmp_path = client
    resp = c.delete("/engines/ordinary")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert not (tmp_path / "tts_ordinary").exists()
