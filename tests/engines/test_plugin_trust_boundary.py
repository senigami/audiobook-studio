"""Tests for the plugin trust boundary — preview/confirm/cancel staging flow
and the requirements endpoint.

Verifies:
- /plugins/preview returns manifest metadata + requirements WITHOUT installing.
- /plugins/confirm/{token} completes the install.
- /plugins/staging/{token} (DELETE) cleans up staging.
- /engines/{engine_id}/requirements returns non-comment lines.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_plugin_zip(
    engine_id: str = "testplugin",
    display_name: str = "Test Plugin",
    version: str | None = "1.0.0",
    requirements_txt: str | None = None,
) -> bytes:
    manifest = {
        "studio_tts_manifest": "1.0",
        "engine_id": engine_id,
        "display_name": display_name,
        "entry_class": "engine:TestEngine",
        "capabilities": ["synthesis"],
    }
    if version:
        manifest["version"] = version

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        if requirements_txt is not None:
            zf.writestr("requirements.txt", requirements_txt)
    return buf.getvalue()


@pytest.fixture()
def tts_client(tmp_path, monkeypatch):
    """Return (TestClient, tmp_path) with an isolated plugins dir."""
    import app.tts_server.server as server_mod
    import app.tts_server.plugin_staging as plugin_staging_mod

    monkeypatch.setattr(server_mod, "_plugins_dir", tmp_path)
    monkeypatch.setattr(server_mod, "_plugins", [])
    # Reset staging dict between tests — the staging store now lives in
    # plugin_staging.py, not server.py (LF-7 extraction).
    monkeypatch.setattr(plugin_staging_mod, "_staging", {})

    from app.tts_server.server import app

    return TestClient(app), tmp_path


# ---------------------------------------------------------------------------
# Preview endpoint
# ---------------------------------------------------------------------------


class TestPluginPreview:
    def test_preview_returns_manifest_and_requirements(self, tts_client):
        client, plugins_dir = tts_client
        reqs = "torch>=2.0\ngit+https://github.com/example/repo.git\n# comment\nnumpy"
        zip_data = _make_plugin_zip(requirements_txt=reqs)

        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert body["engine_id"] == "testplugin"
        assert body["display_name"] == "Test Plugin"
        assert body["version"] == "1.0.0"
        # comments stripped, non-empty lines preserved
        assert "torch>=2.0" in body["requirements"]
        assert "git+https://github.com/example/repo.git" in body["requirements"]
        assert "numpy" in body["requirements"]
        assert not any(r.startswith("#") for r in body["requirements"])
        assert "staging_token" in body
        assert len(body["staging_token"]) == 32

    def test_preview_does_not_install_plugin(self, tts_client):
        client, plugins_dir = tts_client
        zip_data = _make_plugin_zip()

        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 200, resp.text
        # Final target dir must NOT exist after preview
        assert not (plugins_dir / "tts_testplugin").exists()
        # Only the staging dir (prefixed .preview_) should exist
        staging_dirs = list(plugins_dir.glob(".preview_*"))
        assert len(staging_dirs) == 1

    def test_preview_without_requirements_returns_empty_list(self, tts_client):
        client, plugins_dir = tts_client
        zip_data = _make_plugin_zip(requirements_txt=None)

        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["requirements"] == []

    def test_preview_rejects_non_zip(self, tts_client):
        client, _ = tts_client
        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.tar.gz", b"garbage", "application/gzip")},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GitHub Preview endpoint
# ---------------------------------------------------------------------------


class TestPluginPreviewGithub:
    @pytest.fixture
    def mock_subprocess_run(self, monkeypatch):
        from unittest.mock import MagicMock
        import subprocess

        mock_run = MagicMock()
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "Cloned successfully"
        mock_run.return_value.stderr = ""

        monkeypatch.setattr(subprocess, "run", mock_run)
        return mock_run

    def _setup_mock_repo(self, plugins_dir, mock_subprocess_run, engine_id="testgithub", requirements_txt=None):
        def side_effect(cmd, **kwargs):
            from pathlib import Path
            # cmd is ["git", "clone", "--depth", "1", url, target_dir]
            target_dir = Path(cmd[5])
            target_dir.mkdir(parents=True, exist_ok=True)
            manifest = {
                "studio_tts_manifest": "1.0",
                "contract_version": "1.0",
                "sdk_version": "1.0",
                "settings_schema_version": "1.0",
                "event_envelope_version": "1.0",
                "engine_id": engine_id,
                "display_name": "GitHub Plugin",
                "entry_class": "engine:GitHubEngine",
                "capabilities": ["synthesis"],
                "version": "1.0.0"
            }
            (target_dir / "manifest.json").write_text(json.dumps(manifest))
            if requirements_txt:
                (target_dir / "requirements.txt").write_text(requirements_txt)
            mock_subprocess_run.return_value.returncode = 0
            return mock_subprocess_run.return_value

        mock_subprocess_run.side_effect = side_effect
        return mock_subprocess_run

    def test_preview_github_clones_and_returns_metadata(self, tts_client, mock_subprocess_run):
        client, plugins_dir = tts_client
        self._setup_mock_repo(plugins_dir, mock_subprocess_run, requirements_txt="git+https://github.com/example.git\nnumpy")

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://github.com/audiobook-studio/tts-test.git"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert body["engine_id"] == "testgithub"
        assert body["display_name"] == "GitHub Plugin"
        assert body["version"] == "1.0.0"
        assert "git+https://github.com/example.git" in body["requirements"]
        assert "numpy" in body["requirements"]
        assert "staging_token" in body

        mock_subprocess_run.assert_called_once()
        cmd = mock_subprocess_run.call_args[0][0]
        assert cmd[0:5] == ["git", "clone", "--depth", "1", "https://github.com/audiobook-studio/tts-test.git"]

    def test_preview_github_rejects_non_github_urls(self, tts_client):
        client, plugins_dir = tts_client

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://gitlab.com/audiobook-studio/tts-test.git"},
        )
        assert resp.status_code == 400
        assert "Only https://github.com/" in resp.json()["detail"]

    def test_preview_github_rejects_urls_with_query_or_fragment(self, tts_client):
        client, plugins_dir = tts_client

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://github.com/audiobook-studio/tts-test.git?token=secret"},
        )
        assert resp.status_code == 400
        assert "must not include credentials, query, or fragment" in resp.json()["detail"]

    def test_preview_github_uses_loader_manifest_contract(self, tts_client, mock_subprocess_run):
        client, plugins_dir = tts_client
        self._setup_mock_repo(plugins_dir, mock_subprocess_run, engine_id="bad_engine")

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://github.com/audiobook-studio/bad-engine.git"},
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Plugin manifest failed validation."
        assert not list(plugins_dir.glob(".preview_*"))

    def test_preview_github_rejects_symlinks(self, tts_client, mock_subprocess_run):
        client, plugins_dir = tts_client

        def side_effect(cmd, **kwargs):
            from pathlib import Path
            target_dir = Path(cmd[5])
            target_dir.mkdir(parents=True, exist_ok=True)
            manifest = {
                "studio_tts_manifest": "1.0",
                "contract_version": "1.0",
                "sdk_version": "1.0",
                "settings_schema_version": "1.0",
                "event_envelope_version": "1.0",
                "engine_id": "symlink",
                "display_name": "Symlink Plugin",
                "entry_class": "engine:GitHubEngine",
                "capabilities": ["synthesis"],
                "version": "1.0.0"
            }
            (target_dir / "manifest.json").write_text(json.dumps(manifest))
            (target_dir / "escape").symlink_to("/etc/passwd")
            mock_subprocess_run.return_value.returncode = 0
            return mock_subprocess_run.return_value

        mock_subprocess_run.side_effect = side_effect

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://github.com/audiobook-studio/symlink.git"},
        )
        assert resp.status_code == 400
        assert "must not contain symlinks" in resp.json()["detail"]
        assert not list(plugins_dir.glob(".preview_*"))

    def test_preview_github_cleans_up_on_clone_timeout(self, tts_client, mock_subprocess_run):
        import subprocess

        client, plugins_dir = tts_client
        mock_subprocess_run.side_effect = subprocess.TimeoutExpired(cmd=["git", "clone"], timeout=120)

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://github.com/audiobook-studio/slow.git"},
        )
        assert resp.status_code == 408
        assert "Timed out" in resp.json()["detail"]
        assert not list(plugins_dir.glob(".preview_*"))

    def test_preview_github_cleans_up_on_clone_failure(self, tts_client, mock_subprocess_run):
        client, plugins_dir = tts_client
        mock_subprocess_run.return_value.returncode = 128
        mock_subprocess_run.return_value.stderr = "fatal: repository not found"

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://github.com/audiobook-studio/missing.git"},
        )
        assert resp.status_code == 400
        assert "Failed to clone" in resp.json()["detail"]

        staging_dirs = list(plugins_dir.glob(".preview_*"))
        assert len(staging_dirs) == 0

    def test_preview_github_missing_manifest(self, tts_client, mock_subprocess_run):
        client, plugins_dir = tts_client
        # Setup side effect that clones but doesn't write manifest.json
        def side_effect(cmd, **kwargs):
            from pathlib import Path
            target_dir = Path(cmd[5])
            target_dir.mkdir(parents=True, exist_ok=True)
            mock_subprocess_run.return_value.returncode = 0
            return mock_subprocess_run.return_value
        mock_subprocess_run.side_effect = side_effect

        resp = client.post(
            "/plugins/preview_github",
            json={"git_url": "https://github.com/audiobook-studio/no-manifest.git"},
        )
        assert resp.status_code == 400
        assert "missing manifest.json" in resp.json()["detail"]

        staging_dirs = list(plugins_dir.glob(".preview_*"))
        assert len(staging_dirs) == 0


# ---------------------------------------------------------------------------
# Confirm endpoint
# ---------------------------------------------------------------------------


class TestPluginConfirm:
    def _stage(self, client, plugins_dir, **kwargs):
        zip_data = _make_plugin_zip(**kwargs)
        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["staging_token"]

    def test_confirm_installs_plugin(self, tts_client):
        client, plugins_dir = tts_client
        token = self._stage(client, plugins_dir)

        resp = client.post(f"/plugins/confirm/{token}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert body["engine_id"] == "testplugin"
        # Plugin dir now exists
        assert (plugins_dir / "tts_testplugin").exists()
        # Staging dir was removed
        assert not list(plugins_dir.glob(".preview_*"))

    def test_confirm_consumes_token(self, tts_client):
        client, plugins_dir = tts_client
        token = self._stage(client, plugins_dir)

        client.post(f"/plugins/confirm/{token}")
        # Second confirm must fail — token already consumed
        resp2 = client.post(f"/plugins/confirm/{token}")
        assert resp2.status_code == 404

    def test_confirm_invalid_token_format(self, tts_client):
        client, _ = tts_client
        resp = client.post("/plugins/confirm/not-a-valid-token!!")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Cancel (staging DELETE) endpoint
# ---------------------------------------------------------------------------


class TestPluginStagingCancel:
    def _stage(self, client):
        zip_data = _make_plugin_zip()
        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["staging_token"]

    def test_cancel_cleans_staging_dir(self, tts_client):
        client, plugins_dir = tts_client
        token = self._stage(client)
        assert list(plugins_dir.glob(".preview_*")), "Staging dir should exist before cancel"

        resp = client.delete(f"/plugins/staging/{token}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["ok"] is True
        # Staging dir removed
        assert not list(plugins_dir.glob(".preview_*"))
        # Plugin NOT installed
        assert not (plugins_dir / "tts_testplugin").exists()

    def test_cancel_does_not_install(self, tts_client):
        client, plugins_dir = tts_client
        token = self._stage(client)
        client.delete(f"/plugins/staging/{token}")
        assert not (plugins_dir / "tts_testplugin").exists()

    def test_cancel_idempotent(self, tts_client):
        client, plugins_dir = tts_client
        token = self._stage(client)
        client.delete(f"/plugins/staging/{token}")
        # Second cancel must still return ok
        resp2 = client.delete(f"/plugins/staging/{token}")
        assert resp2.status_code == 200
        assert resp2.json()["ok"] is True

    def test_cancel_invalid_token_format(self, tts_client):
        client, _ = tts_client
        resp = client.delete("/plugins/staging/BADTOKEN")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Requirements endpoint
# ---------------------------------------------------------------------------


class TestEngineRequirements:
    def _install_plugin(self, client, plugins_dir, requirements_txt=None):
        """Install a plugin via preview+confirm cycle."""
        zip_data = _make_plugin_zip(requirements_txt=requirements_txt)
        resp = client.post(
            "/plugins/preview",
            files={"file": ("plugin.zip", zip_data, "application/zip")},
        )
        token = resp.json()["staging_token"]
        client.post(f"/plugins/confirm/{token}")

    def test_returns_requirements_lines(self, tts_client):
        client, plugins_dir = tts_client
        reqs = "torch>=2.0\n# comment\ngit+https://github.com/example/repo.git\n"
        self._install_plugin(client, plugins_dir, requirements_txt=reqs)

        # Manually register the plugin so the endpoint can look it up.
        import app.tts_server.server as server_mod
        from app.tts_server.plugin_loader import LoadedPlugin
        from unittest.mock import MagicMock

        mock_plugin = MagicMock(spec=LoadedPlugin)
        mock_plugin.engine_id = "testplugin"
        mock_plugin.plugin_dir = plugins_dir / "tts_testplugin"
        server_mod._plugins = [mock_plugin]

        resp = client.get("/engines/testplugin/requirements")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert "torch>=2.0" in body["requirements"]
        assert "git+https://github.com/example/repo.git" in body["requirements"]
        # comment lines excluded
        assert not any(r.startswith("#") for r in body["requirements"])

    def test_returns_empty_list_when_no_requirements(self, tts_client):
        client, plugins_dir = tts_client
        self._install_plugin(client, plugins_dir, requirements_txt=None)

        import app.tts_server.server as server_mod
        from unittest.mock import MagicMock
        from app.tts_server.plugin_loader import LoadedPlugin

        mock_plugin = MagicMock(spec=LoadedPlugin)
        mock_plugin.engine_id = "testplugin"
        mock_plugin.plugin_dir = plugins_dir / "tts_testplugin"
        server_mod._plugins = [mock_plugin]

        resp = client.get("/engines/testplugin/requirements")
        assert resp.status_code == 200, resp.text
        assert resp.json()["requirements"] == []

    def test_returns_404_for_unknown_engine(self, tts_client):
        client, _ = tts_client
        resp = client.get("/engines/nonexistent/requirements")
        assert resp.status_code == 404
