"""SEC-2: LAN-protection middleware gates the dangerous mutating management
endpoints (voice-bundle import, settings writes) for non-loopback clients
unless the operator enables ``lan_binding_enabled``.

Revert-check: on pre-fix code the middleware only gated ``/api/v1/tts``, so a
LAN client POST to ``/api/voices/bundle/import`` was NOT blocked — the
"blocked" assertions here fail on the old middleware.
"""
import pytest
from fastapi.testclient import TestClient

from app.api.web import app
from app.db.state import update_settings

LAN = ("192.168.1.50", 40000)  # a non-loopback client


@pytest.fixture
def lan_client():
    return TestClient(app, base_url="http://localhost", client=LAN)


@pytest.fixture
def loopback_client():
    # "testclient" is treated as loopback by the middleware.
    return TestClient(app, base_url="http://localhost", client=("testclient", 50000))


def test_lan_client_blocked_from_bundle_import_when_disabled(lan_client):
    update_settings({"lan_binding_enabled": False})
    resp = lan_client.post("/api/voices/bundle/import")
    assert resp.status_code == 403
    assert "lan access" in resp.json()["detail"].lower()


def test_loopback_client_not_blocked_from_bundle_import(loopback_client):
    update_settings({"lan_binding_enabled": False})
    resp = loopback_client.post("/api/voices/bundle/import")
    # Passes the middleware; fails downstream on the missing file (422), never 403.
    assert resp.status_code != 403


def test_lan_client_allowed_bundle_import_when_enabled(lan_client):
    update_settings({"lan_binding_enabled": True})
    resp = lan_client.post("/api/voices/bundle/import")
    # Middleware lets it through once LAN access is enabled; downstream 422 (no file).
    assert resp.status_code != 403


def test_lan_client_blocked_from_settings_write_when_disabled(lan_client):
    update_settings({"lan_binding_enabled": False})
    resp = lan_client.post("/api/settings", json={"anything": 1})
    assert resp.status_code == 403


def test_lan_client_can_still_read_when_disabled(lan_client):
    """Reads (GET) are never gated — the UI stays browsable from the LAN."""
    update_settings({"lan_binding_enabled": False})
    resp = lan_client.get("/api/projects")
    assert resp.status_code != 403


@pytest.mark.parametrize(
    "path",
    [
        "/api/engines/import",
        "/api/engines/preview",
        "/api/engines/preview_github",
        "/api/engines/confirm/" + "0" * 32,
        # Dynamic {engine_id} mid-path — proves the whole /api/engines/ mutating
        # surface is gated, not just the four static plugin-management paths.
        "/api/engines/xtts/install",
        "/api/engines/xtts/calibrate/reset",
    ],
)
def test_lan_client_blocked_from_plugin_management_when_disabled(lan_client, path):
    """Plugin import/preview/confirm/install execute plugin code — a worse
    RCE than the bundle vector — so the whole engine-management write surface
    must be LAN-gated too."""
    update_settings({"lan_binding_enabled": False})
    resp = lan_client.post(path)
    assert resp.status_code == 403


def test_lan_client_blocked_from_engine_settings_put_when_disabled(lan_client):
    """PUT /api/engines/{id}/settings is a mutating engine-admin op — gated."""
    update_settings({"lan_binding_enabled": False})
    resp = lan_client.put("/api/engines/xtts/settings", json={})
    assert resp.status_code == 403


def test_loopback_client_not_blocked_from_plugin_import(loopback_client):
    update_settings({"lan_binding_enabled": False})
    resp = loopback_client.post("/api/engines/import")
    # Passes the middleware; fails downstream (no file), never 403.
    assert resp.status_code != 403
