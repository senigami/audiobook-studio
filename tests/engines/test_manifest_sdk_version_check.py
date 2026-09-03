"""Issue #200 A4: a manifest's declared sdk_version is checked against the package.

Before this, ``_SUPPORTED_VERSION_FIELDS`` held the literal ``{"1.0"}`` and
nothing compared it to ``studio_plugin_sdk.SDK_VERSION``. The two could drift
silently: bump the package and every manifest still declaring the old version
loads clean, which makes the field decorative. The check is now derived from
the package, so the allow-list cannot go stale.
"""
from __future__ import annotations

import pytest

from studio_plugin_sdk import SDK_VERSION

_BASE_MANIFEST = {
    "studio_tts_manifest": "1.0",
    "contract_version": "1.0",
    "sdk_version": "1.0",
    "settings_schema_version": "1.0",
    "event_envelope_version": "1.0",
    "engine_id": "mock",
    "display_name": "Mock",
    "entry_class": "engine:MockEngine",
    "capabilities": ["synthesis"],
}


def _validate(sdk_version: str) -> None:
    from app.tts_server.plugin_loader import _validate_manifest
    _validate_manifest(manifest={**_BASE_MANIFEST, "sdk_version": sdk_version}, folder_name="tts_mock")


def _bump_minor(version: str, by: int) -> str:
    major, minor = version.split(".", 1)
    return f"{major}.{int(minor) + by}"


def test_manifest_declaring_the_current_package_version_is_accepted():
    """The drift guard: whatever the package declares must always load.

    This is the assertion that fails if someone bumps SDK_VERSION and leaves a
    hardcoded allow-list behind.
    """
    _validate(SDK_VERSION)


def test_older_compatible_minor_is_accepted():
    """A plugin written against an earlier minor of the same major still loads."""
    _validate("1.0")


def test_newer_minor_than_the_installed_sdk_is_rejected():
    """A plugin needing SDK features this install does not have must not load."""
    too_new = _bump_minor(SDK_VERSION, 1)
    with pytest.raises(Exception) as exc:
        _validate(too_new)
    message = str(exc.value)
    assert "sdk_version" in message
    assert too_new in message, f"error must name the declared version: {message}"
    assert SDK_VERSION in message, f"error must name the installed SDK version: {message}"


def test_different_major_is_rejected():
    major = int(SDK_VERSION.split(".", 1)[0])
    with pytest.raises(Exception) as exc:
        _validate(f"{major + 1}.0")
    assert "sdk_version" in str(exc.value)


def test_malformed_version_is_rejected():
    with pytest.raises(Exception) as exc:
        _validate("not-a-version")
    assert "sdk_version" in str(exc.value)


def test_shipped_manifests_declare_a_loadable_sdk_version():
    """The three in-tree plugin manifests must pass the derived check."""
    import json
    from pathlib import Path

    engines_dir = Path(__file__).parents[2] / "tts_engines"
    manifests = sorted(engines_dir.glob("*/manifest.json"))
    assert manifests, "no in-tree plugin manifests found"
    for path in manifests:
        declared = json.loads(path.read_text(encoding="utf-8")).get("sdk_version")
        _validate(str(declared))
