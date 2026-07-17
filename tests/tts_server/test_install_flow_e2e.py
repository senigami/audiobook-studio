"""E2E install-flow + trust tests for the GitHub plugin install path (plan 05 §5.3).

Uses a LOCAL bare git repository fixture (tmp_path) — no network. The URL
validator (``_normalize_github_repo_url``) only accepts
``https://github.com/<owner>/<repo>`` and is NOT weakened: the tests exercise
the post-validation clone/stage body ``_clone_and_stage`` directly with a
``file://`` URL, and separately pin the validator's rejection of ``file://``
and ``http://`` URLs as a security property.

Trust model pinned here (plan 05 §5.3, backend surface):
- Official trust is registry membership: every ``get_official_registry()``
  entry carries ``trust_level == "official"`` and its repo URL matches the
  in-tree manifest ``distribution.git_url``; an arbitrary community repo URL
  has no registry entry (the UI renders the Community badge + consent dialog
  from that absence).
- No code is loaded until consent: preview stages under ``.preview_<token>``
  only; the plugin reaches ``plugins_dir/tts_<engine_id>`` and the loader only
  after the explicit confirm step.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from fastapi import HTTPException


def _git(*args: str, cwd: Path) -> None:
    subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        timeout=30,
        env={
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@example.invalid",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@example.invalid",
            "HOME": str(cwd),
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_SYSTEM": "/dev/null",
            "PATH": "/usr/bin:/bin:/usr/local/bin",
        },
    )


def _make_plugin_repo(
    tmp_path: Path,
    *,
    engine_id: str = "localdemo",
    requirements_txt: str | None = "numpy\n# comment\n",
    add_symlink: bool = False,
) -> str:
    """Build a valid plugin repo, publish it as a local bare repo, return its file:// URL."""
    work = tmp_path / f"work_{engine_id}"
    work.mkdir()
    manifest = {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": engine_id,
        "display_name": "Local Demo Plugin",
        "version": "1.0.0",
        "entry_class": "interface:LocalDemoEngine",
        "capabilities": ["synthesis"],
    }
    (work / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (work / "interface.py").write_text(
        "class LocalDemoEngine:\n    pass\n", encoding="utf-8"
    )
    (work / "plugin").mkdir()
    (work / "plugin" / "__init__.py").write_text("", encoding="utf-8")
    if requirements_txt is not None:
        (work / "requirements.txt").write_text(requirements_txt, encoding="utf-8")
    if add_symlink:
        (work / "evil_link").symlink_to(work / "manifest.json")

    _git("init", "-q", cwd=work)
    _git("add", "-A", cwd=work)
    _git("commit", "-q", "-m", "plugin", cwd=work)
    bare = tmp_path / f"{engine_id}_bare.git"
    _git("clone", "-q", "--bare", str(work), str(bare), cwd=tmp_path)
    return f"file://{bare}"


@pytest.fixture()
def plugins_dir(tmp_path, monkeypatch):
    """Isolated plugins dir; server globals + staging store patched for the test."""
    import app.tts_server.server as server_mod
    import app.tts_server.plugin_staging as plugin_staging_mod

    pdir = tmp_path / "plugins"
    pdir.mkdir()
    monkeypatch.setattr(server_mod, "_plugins_dir", pdir)
    monkeypatch.setattr(server_mod, "_plugins", [])
    monkeypatch.setattr(plugin_staging_mod, "_staging", {})
    return pdir


class TestCloneAndStage:
    def test_preview_stages_without_installing(self, tmp_path, plugins_dir):
        """Preview returns manifest metadata + staging token; no code installed yet."""
        from app.tts_server.plugin_staging import _clone_and_stage

        url = _make_plugin_repo(tmp_path)
        body = _clone_and_stage(url, plugins_dir)

        assert body["ok"] is True
        assert body["engine_id"] == "localdemo"
        assert body["display_name"] == "Local Demo Plugin"
        assert body["version"] == "1.0.0"
        assert body["requirements"] == ["numpy"]
        assert len(body["staging_token"]) == 32

        # §5.3: no code loaded until consent — plugin is staged only.
        assert not (plugins_dir / "tts_localdemo").exists()
        staged = list(plugins_dir.glob(".preview_*"))
        assert len(staged) == 1
        assert (staged[0] / "manifest.json").is_file()

    def test_confirm_installs_into_plugins_dir(self, tmp_path, plugins_dir):
        from app.tts_server.plugin_staging import _clone_and_stage, confirm_staged_plugin

        url = _make_plugin_repo(tmp_path)
        token = _clone_and_stage(url, plugins_dir)["staging_token"]

        result = confirm_staged_plugin(token=token, plugins_dir=plugins_dir)
        assert result["ok"] is True
        assert result["engine_id"] == "localdemo"
        assert (plugins_dir / "tts_localdemo" / "manifest.json").is_file()
        assert not list(plugins_dir.glob(".preview_*"))

    def test_cancel_sweeps_staging_dir(self, tmp_path, plugins_dir):
        from app.tts_server.plugin_staging import _clone_and_stage, cancel_staged_plugin

        url = _make_plugin_repo(tmp_path)
        token = _clone_and_stage(url, plugins_dir)["staging_token"]
        assert list(plugins_dir.glob(".preview_*"))

        result = cancel_staged_plugin(token=token)
        assert result["ok"] is True
        assert not list(plugins_dir.glob(".preview_*"))
        assert not (plugins_dir / "tts_localdemo").exists()

    def test_symlink_repo_rejected(self, tmp_path, plugins_dir):
        """Cloned repos containing symlinks are rejected before trust confirmation."""
        from app.tts_server.plugin_staging import _clone_and_stage

        url = _make_plugin_repo(tmp_path, engine_id="evildemo", add_symlink=True)
        with pytest.raises(HTTPException) as exc_info:
            _clone_and_stage(url, plugins_dir)
        assert exc_info.value.status_code == 400
        assert "symlink" in exc_info.value.detail.lower()
        # Staging dir is cleaned up on rejection.
        assert not list(plugins_dir.glob(".preview_*"))

    def test_invalid_manifest_rejected(self, tmp_path, plugins_dir):
        """A repo whose manifest fails _validate_manifest is rejected at preview."""
        from app.tts_server.plugin_staging import _clone_and_stage

        work = tmp_path / "badwork"
        work.mkdir()
        (work / "manifest.json").write_text(
            json.dumps({"engine_id": "baddemo"}), encoding="utf-8"
        )
        _git("init", "-q", cwd=work)
        _git("add", "-A", cwd=work)
        _git("commit", "-q", "-m", "bad", cwd=work)
        bare = tmp_path / "baddemo_bare.git"
        _git("clone", "-q", "--bare", str(work), str(bare), cwd=tmp_path)

        with pytest.raises(HTTPException) as exc_info:
            _clone_and_stage(f"file://{bare}", plugins_dir)
        assert exc_info.value.status_code == 400
        assert not list(plugins_dir.glob(".preview_*"))


class TestUrlValidationHardening:
    """Security property (R1): only https://github.com/<owner>/<repo> passes validation.

    If validation is ever loosened to admit file:// or http:// URLs, these
    tests fail — that is the point.
    """

    @pytest.mark.parametrize(
        "bad_url",
        [
            "file:///tmp/x",
            "file:///tmp/x/y.git",
            "http://github.com/owner/repo",
            "https://evil.example.com/owner/repo",
            "https://github.com/owner/repo?ref=x",
            "https://user:pass@github.com/owner/repo",
            "/tmp/local/path",
            "git@github.com:owner/repo.git",
        ],
    )
    def test_non_github_https_urls_rejected(self, bad_url):
        from app.tts_server.plugin_staging import _normalize_github_repo_url

        with pytest.raises(HTTPException) as exc_info:
            _normalize_github_repo_url(bad_url)
        assert exc_info.value.status_code == 400

    def test_canonical_github_url_accepted(self):
        from app.tts_server.plugin_staging import _normalize_github_repo_url

        assert (
            _normalize_github_repo_url("https://github.com/audiobook-studio/tts-xtts.git")
            == "https://github.com/audiobook-studio/tts-xtts.git"
        )

    def test_preview_github_repo_routes_through_validation(self, plugins_dir):
        """The public entry point rejects a file:// URL before any clone happens."""
        from app.tts_server.plugin_staging import preview_github_repo

        with pytest.raises(HTTPException) as exc_info:
            preview_github_repo(git_url="file:///tmp/x", plugins_dir=plugins_dir)
        assert exc_info.value.status_code == 400
        assert not list(plugins_dir.glob(".preview_*"))


class TestTrustLevels:
    """§5.3 trust surface: official = registry membership; community = absence."""

    def test_official_registry_entries_are_official(self):
        from app.engines.official_registry import get_official_registry

        registry = get_official_registry()
        assert registry, "official registry must not be empty"
        for entry in registry:
            assert entry["trust_level"] == "official"
            assert entry["repo_url"].startswith("https://github.com/audiobook-studio/")

    def test_registry_urls_match_in_tree_manifest_distribution(self):
        """Official ids/urls agree with the shipped manifests' distribution blocks."""
        from app.engines.official_registry import get_official_registry

        registry = {e["id"]: e for e in get_official_registry()}
        repo_root = Path(__file__).resolve().parents[2]
        for plugin_id in ("tts_xtts", "tts_voxtral"):
            manifest = json.loads(
                (repo_root / "tts_engines" / plugin_id / "manifest.json").read_text(encoding="utf-8")
            )
            assert registry[plugin_id]["repo_url"] == manifest["distribution"]["git_url"]

    def test_unknown_repo_url_is_not_official(self):
        """A community repo URL has no registry entry — the UI's Community/consent basis."""
        from app.engines.official_registry import get_official_registry

        community_url = "https://github.com/some-community-dev/tts-random.git"
        assert all(e["repo_url"] != community_url for e in get_official_registry())
