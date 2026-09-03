"""Tests for the optional manifest ``distribution`` block (plan 05 §1.2).

The block is OPTIONAL (absent → valid) but when present it must be shaped:
a dict whose known fields carry the right types. Free-form garbage in a
versioned contract is rejected at load time per the owner directive.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.tts_server.plugin_loader import PluginLoadError, _validate_manifest

REPO_ROOT = Path(__file__).parents[2]


def _minimal_manifest(**overrides) -> dict:
    manifest = {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": "demo",
        "display_name": "Demo",
        "entry_class": "interface:DemoPlugin",
        "capabilities": ["synthesis"],
    }
    manifest.update(overrides)
    return manifest


def _distribution_block(**overrides) -> dict:
    block = {
        "host": "github",
        "base_url": "https://github.com",
        "repo": "audiobook-studio/tts-demo",
        "git_url": "https://github.com/audiobook-studio/tts-demo.git",
        "topic": "audiobook-studio-tts",
        "pin_ref": None,
        "official": True,
    }
    block.update(overrides)
    return block


class TestDistributionBlockValidation:
    def test_absent_distribution_is_valid(self):
        _validate_manifest(manifest=_minimal_manifest(), folder_name="tts_demo")

    def test_valid_distribution_block_passes(self):
        manifest = _minimal_manifest(distribution=_distribution_block())
        _validate_manifest(manifest=manifest, folder_name="tts_demo")

    def test_distribution_must_be_dict(self):
        manifest = _minimal_manifest(distribution="github.com/foo/bar")
        with pytest.raises(PluginLoadError, match="distribution"):
            _validate_manifest(manifest=manifest, folder_name="tts_demo")

    @pytest.mark.parametrize("field", ["host", "base_url", "repo", "git_url", "topic"])
    def test_string_fields_reject_non_strings(self, field: str):
        manifest = _minimal_manifest(distribution=_distribution_block(**{field: 42}))
        with pytest.raises(PluginLoadError, match=f"distribution.{field}"):
            _validate_manifest(manifest=manifest, folder_name="tts_demo")

    def test_pin_ref_accepts_none_and_string(self):
        for pin_ref in (None, "v2.0.0"):
            manifest = _minimal_manifest(distribution=_distribution_block(pin_ref=pin_ref))
            _validate_manifest(manifest=manifest, folder_name="tts_demo")

    def test_pin_ref_rejects_non_string(self):
        manifest = _minimal_manifest(distribution=_distribution_block(pin_ref=123))
        with pytest.raises(PluginLoadError, match="distribution.pin_ref"):
            _validate_manifest(manifest=manifest, folder_name="tts_demo")

    def test_official_rejects_non_bool(self):
        manifest = _minimal_manifest(distribution=_distribution_block(official="yes"))
        with pytest.raises(PluginLoadError, match="distribution.official"):
            _validate_manifest(manifest=manifest, folder_name="tts_demo")


class TestShippedManifests:
    """The in-tree xtts/voxtral manifests carry final-shape distribution blocks."""

    @pytest.mark.parametrize(
        ("plugin", "repo"),
        [("tts_xtts", "audiobook-studio/tts-xtts"), ("tts_voxtral", "audiobook-studio/tts-voxtral")],
    )
    def test_distribution_block_matches_official_registry(self, plugin: str, repo: str):
        manifest = json.loads(
            (REPO_ROOT / "tts_engines" / plugin / "manifest.json").read_text(encoding="utf-8")
        )
        _validate_manifest(manifest=manifest, folder_name=plugin)

        dist = manifest["distribution"]
        assert dist["host"] == "github"
        assert dist["repo"] == repo
        assert dist["git_url"] == f"https://github.com/{repo}.git"
        assert dist["official"] is True

        # git_url must match the official registry's repo_url for the same engine.
        from app.engines.official_registry import get_official_registry

        entries = {e["id"]: e for e in get_official_registry()}
        assert entries[plugin]["repo_url"] == dist["git_url"]

    @pytest.mark.parametrize("plugin", ["tts_xtts", "tts_voxtral"])
    def test_standalone_manifests_never_set_built_in(self, plugin: str):
        manifest = json.loads(
            (REPO_ROOT / "tts_engines" / plugin / "manifest.json").read_text(encoding="utf-8")
        )
        assert "built_in" not in manifest
        assert "builtin" not in manifest
