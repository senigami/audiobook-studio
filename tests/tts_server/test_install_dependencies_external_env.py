"""BUG 1 fix: ``POST /engines/{engine_id}/install`` must refuse to pip-install
into the server's own venv for engines that manage deps in a separate,
externally-provisioned environment (``dependency_check: "external"``).

Before this fix the endpoint always ran ``pip install -r requirements.txt``
against ``sys.executable`` (the server venv) regardless — for xtts that
would silently pull torch/coqui-tts into the app's own venv, defeating the
whole point of keeping heavy inference deps isolated in ``~/xtts-env``.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.tts_server.plugin_loader import LoadedPlugin


def _plugin(tmp_path, engine_id: str, *, dependency_check: str | None) -> LoadedPlugin:
    plugin_dir = tmp_path / f"tts_{engine_id}"
    plugin_dir.mkdir()
    manifest = {
        "studio_tts_manifest": "1.0",
        "engine_id": engine_id,
        "display_name": engine_id,
        "entry_class": "interface:Engine",
        "capabilities": ["synthesis"],
    }
    if dependency_check is not None:
        manifest["dependency_check"] = dependency_check
    (plugin_dir / "requirements.txt").write_text("some-package\n", encoding="utf-8")
    return LoadedPlugin(folder_name=f"tts_{engine_id}", plugin_dir=plugin_dir, manifest=manifest)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import app.tts_server.server as server_mod

    plugins = [
        _plugin(tmp_path, "xtts", dependency_check="external"),
        _plugin(tmp_path, "ordinary", dependency_check=None),
    ]
    monkeypatch.setattr(server_mod, "_plugins_dir", tmp_path)
    monkeypatch.setattr(server_mod, "_plugins", plugins)
    return TestClient(server_mod.app), tmp_path


def test_external_env_plugin_install_is_refused(client):
    c, _tmp_path = client
    resp = c.post("/engines/xtts/install")
    assert resp.status_code == 400
    assert "separate" in resp.json()["detail"]


def test_ordinary_plugin_install_is_not_short_circuited(client, monkeypatch):
    """Sanity: the guard is scoped to dependency_check="external" only —
    an ordinary plugin still reaches the real pip-install path (mocked here
    at the subprocess boundary per R2, not the endpoint itself)."""
    import subprocess as subprocess_mod

    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)

        class _Result:
            returncode = 0
            stdout = ""
            stderr = ""

        return _Result()

    monkeypatch.setattr(subprocess_mod, "run", fake_run)

    c, _tmp_path = client
    resp = c.post("/engines/ordinary/install")
    assert resp.status_code == 200
    assert len(calls) == 1
