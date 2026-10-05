"""Tests for Phase E — HF-aligned voice bundle export/import.

Phase E acceptance criteria (doc 04 §Phase E):

E1-a  Export of a fully-tagged voice produces a voice.json that passes strict
       jsonschema validation against design-docs/specs/voice.schema.json.
E1-b  Export of an UNTAGGED voice raises VoiceBundleError with an actionable message
       describing the missing required attributes.
E1-c  Export of a voice with schema-invalid attribute values raises VoiceBundleError
       (e.g. class=alien).

E2-a  Exported bundle zip contains a README.md.
E2-b  README.md YAML frontmatter includes the tag ``audiobook-studio-voice``.
E2-c  README.md YAML frontmatter includes ``as-*`` namespaced tags for every
       attribute present in ``attributes`` (class, gender, age, tone[], timbre[],
       accent, pace, use_case[], quality[]).
E2-d  README.md body includes a ``# <voice name>`` heading.
E2-e  README.md widget block references the primary sample path.

E3-a  Importing a bundle with HF spec fields (spec/spec_version/attributes) stores
       those fields in the imported voice.json unchanged.
E3-b  Importing a bundle must NOT write ``version`` (integer storage marker) into
       voice.json — that is a legacy field.
E3-c  Importing a bundle must NOT write ``default_variant`` into voice.json — it goes
       into state.json.
E3-d  Importing a legacy bundle (old runtime shape: ``version: 2``, no spec fields)
       still succeeds via the lenient path; the resulting voice.json keeps name/id
       and state.json is written for default_variant.

Round-trip:
RT-1  Export a fully-tagged voice → import the bundle → re-exported voice.json
       attributes are identical to the original.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest  # noqa: F401 — imported for pytest.raises used in test methods


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FULLY_TAGGED_VOICE_JSON: dict[str, Any] = {
    "spec": "audiobook-studio-voice",
    "spec_version": "1.0",
    "taxonomy_version": "1.0",
    "id": "gravel-road",
    "name": "Gravel Road",
    "description": "A weathered, low Southern drawl.",
    "image": "icon.png",
    "samples": [
        {"path": "samples/preview.mp3", "text": "The sun went down slow over the dry creek.", "primary": True}
    ],
    "languages": ["en-US"],
    "attributes": {
        "class": "human",
        "gender": "masculine",
        "age": "senior",
        "accent": "us-southern",
        "tone": ["authoritative", "somber"],
        "timbre": ["deep", "gravelly"],
        "pace": "measured",
        "use_case": ["audiobook", "narration"],
        "quality": ["studio-quality"],
    },
    "tags": ["cowboy", "weathered"],
    "license": "cc-by-4.0",
}


def _write_voice(root: Path, name: str, voice_data: dict, variants: dict[str, dict] | None = None) -> Path:
    voice_dir = root / name
    voice_dir.mkdir(parents=True)
    (voice_dir / "voice.json").write_text(json.dumps(voice_data))
    if variants:
        for variant_name, profile_data in variants.items():
            variant_dir = voice_dir / variant_name
            variant_dir.mkdir()
            (variant_dir / "profile.json").write_text(json.dumps(profile_data))
            (variant_dir / "sample.mp3").write_bytes(b"mp3preview")
    return voice_dir


def _patch_voices_dir(voices_root: Path):
    return [
        patch("app.core.config.VOICES_DIR", voices_root, create=True),
        patch("app.domain.voices.manifest.VOICES_DIR", voices_root, create=True),
    ]


def _export(voices_root: Path, voice_name: str, **kwargs) -> bytes:
    from app.domain.voices.bundles import export_voice_bundle

    patches = _patch_voices_dir(voices_root)
    with patches[0], patches[1]:
        return export_voice_bundle(voices_root, voice_name, **kwargs)


def _import(voices_root: Path, bundle: bytes) -> dict:
    from app.domain.voices.bundles import import_voice_bundle

    patches = _patch_voices_dir(voices_root)
    with patches[0], patches[1]:
        return import_voice_bundle(voices_root, bundle)


def _zip_files(bundle: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(bundle)) as zf:
        return {name: zf.read(name) for name in zf.namelist()}


# ---------------------------------------------------------------------------
# E1 — Export strict validation gate
# ---------------------------------------------------------------------------

class TestExportStrictValidation:
    """E1: exports reject invalid / incomplete voice manifests."""

    def test_fully_tagged_voice_passes_export(self, tmp_path):
        """E1-a: export a fully-tagged voice, voice.json in the zip is schema-valid."""
        import jsonschema

        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Gravel Road", _FULLY_TAGGED_VOICE_JSON, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })
        bundle = _export(voices_root, "Gravel Road")
        files = _zip_files(bundle)
        assert "voice.json" in files

        # Validate against the schema
        repo_root = Path(__file__).resolve().parents[2]
        schema = json.loads((repo_root / "design-docs" / "specs" / "voice.schema.json").read_text())
        voice_data = json.loads(files["voice.json"])
        jsonschema.validate(instance=voice_data, schema=schema)  # should not raise

    def test_untagged_voice_export_raises(self, tmp_path):
        """E1-b: export of a voice with no attributes raises VoiceBundleError with actionable message."""
        from app.domain.voices.bundles import VoiceBundleError

        voices_root = tmp_path / "voices"
        untagged = {
            "spec": "audiobook-studio-voice",
            "spec_version": "1.0",
            "id": "untagged-voice",
            "name": "Untagged Voice",
            "image": "icon.png",
            "samples": [{"path": "samples/preview.mp3"}],
            "languages": ["en-US"],
            # no 'attributes'
        }
        _write_voice(voices_root, "Untagged Voice", untagged, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        with patch("app.core.config.VOICES_DIR", voices_root, create=True), \
             patch("app.domain.voices.manifest.VOICES_DIR", voices_root, create=True):
            with pytest.raises(VoiceBundleError) as exc_info:
                from app.domain.voices.bundles import export_voice_bundle
                export_voice_bundle(voices_root, "Untagged Voice")

        assert "attributes" in str(exc_info.value).lower() or "required" in str(exc_info.value).lower()

    def test_invalid_attribute_value_export_raises(self, tmp_path):
        """E1-c: export with invalid attribute value raises VoiceBundleError."""
        from app.domain.voices.bundles import VoiceBundleError

        voices_root = tmp_path / "voices"
        bad_attrs = dict(_FULLY_TAGGED_VOICE_JSON)
        bad_attrs = {**_FULLY_TAGGED_VOICE_JSON, "attributes": {**_FULLY_TAGGED_VOICE_JSON["attributes"], "class": "alien"}}
        _write_voice(voices_root, "Gravel Road", bad_attrs, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        with patch("app.core.config.VOICES_DIR", voices_root, create=True), \
             patch("app.domain.voices.manifest.VOICES_DIR", voices_root, create=True):
            with pytest.raises(VoiceBundleError):
                from app.domain.voices.bundles import export_voice_bundle
                export_voice_bundle(voices_root, "Gravel Road")


# ---------------------------------------------------------------------------
# E2 — HF README.md generation
# ---------------------------------------------------------------------------

class TestReadmeGeneration:
    """E2: exported bundle includes a HF-compatible README.md."""

    def _get_readme(self, tmp_path) -> str:
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Gravel Road", _FULLY_TAGGED_VOICE_JSON, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })
        bundle = _export(voices_root, "Gravel Road")
        files = _zip_files(bundle)
        assert "README.md" in files, "README.md not found in bundle"
        return files["README.md"].decode("utf-8")

    def test_readme_included_in_bundle(self, tmp_path):
        """E2-a: exported bundle contains README.md."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Gravel Road", _FULLY_TAGGED_VOICE_JSON, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })
        bundle = _export(voices_root, "Gravel Road")
        files = _zip_files(bundle)
        assert "README.md" in files

    def test_readme_frontmatter_has_audiobook_studio_voice_tag(self, tmp_path):
        """E2-b: README.md frontmatter includes audiobook-studio-voice tag."""
        readme = self._get_readme(tmp_path)
        assert "audiobook-studio-voice" in readme

    def test_readme_frontmatter_has_as_tags(self, tmp_path):
        """E2-c: README.md frontmatter includes as-* namespaced attribute tags."""
        readme = self._get_readme(tmp_path)
        assert "as-class-human" in readme
        assert "as-gender-masculine" in readme
        assert "as-age-senior" in readme
        assert "as-accent-us-southern" in readme
        # tone and timbre are arrays — check a few
        assert "as-tone-authoritative" in readme
        assert "as-timbre-deep" in readme

    def test_readme_body_has_voice_name_heading(self, tmp_path):
        """E2-d: README.md body includes # <voice name> heading."""
        readme = self._get_readme(tmp_path)
        assert "# Gravel Road" in readme

    def test_readme_widget_references_primary_sample(self, tmp_path):
        """E2-e: README.md widget block references the primary sample path."""
        readme = self._get_readme(tmp_path)
        # The template shows a widget block with sample URL
        assert "samples/preview.mp3" in readme

    def test_readme_frontmatter_has_language_and_style_as_tags(self, tmp_path):
        """G5: README.md frontmatter includes as-language-*/as-style-* tags when present."""
        voice_data = {
            **_FULLY_TAGGED_VOICE_JSON,
            "taxonomy_version": "2.0",
            "attributes": {
                **_FULLY_TAGGED_VOICE_JSON["attributes"],
                "language": ["english", "spanish"],
                "style": ["narration", "conversational"],
            },
        }
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Gravel Road", voice_data, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })
        bundle = _export(voices_root, "Gravel Road")
        readme = _zip_files(bundle)["README.md"].decode("utf-8")

        assert "as-language-english" in readme
        assert "as-language-spanish" in readme
        assert "as-style-narration" in readme
        assert "as-style-conversational" in readme


# ---------------------------------------------------------------------------
# E3 — Import validation and D8 state split
# ---------------------------------------------------------------------------

class TestImportValidation:
    """E3: import handles both HF-spec bundles and legacy runtime bundles correctly."""

    def _make_bundle(self, voice_data: dict, profile_data: dict | None = None) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("voice.json", json.dumps(voice_data))
            pd = profile_data or {"variant_name": "Default", "engine": "xtts"}
            zf.writestr("Default/profile.json", json.dumps(pd))
            zf.writestr("Default/sample.mp3", b"mp3")
        return buf.getvalue()

    def test_import_hf_bundle_stores_attributes(self, tmp_path):
        """E3-a: importing a bundle with attributes stores them unchanged."""
        voices_root = tmp_path / "voices"
        voices_root.mkdir()
        bundle = self._make_bundle(_FULLY_TAGGED_VOICE_JSON)

        result = _import(voices_root, bundle)
        voice_name = result["voice_name"]

        voice_data = json.loads((voices_root / voice_name / "voice.json").read_text())
        assert voice_data["attributes"]["class"] == "human"
        assert voice_data["attributes"]["gender"] == "masculine"
        assert voice_data["spec"] == "audiobook-studio-voice"

    def test_import_does_not_write_default_variant_to_voice_json(self, tmp_path):
        """E3-c: import strips a *present* default_variant out of voice.json and
        persists its real value (not the "Default" fallback) to state.json.

        Uses a fixture that actually carries a non-default `default_variant`
        value so the assertions exercise the real strip-and-relocate branch in
        import_voice_bundle(), instead of a fixture that never had the key
        (in which case "not in voice_data" would be trivially true).
        """
        voices_root = tmp_path / "voices"
        voices_root.mkdir()
        voice_json = {**_FULLY_TAGGED_VOICE_JSON, "default_variant": "Whisper"}
        bundle = self._make_bundle(voice_json)

        result = _import(voices_root, bundle)
        voice_data = json.loads((voices_root / result["voice_name"] / "voice.json").read_text())
        assert "default_variant" not in voice_data, "Import must not write 'default_variant' to voice.json"

        state_data = json.loads((voices_root / result["voice_name"] / "state.json").read_text())
        assert state_data["default_variant"] == "Whisper"

    def test_import_legacy_bundle_succeeds(self, tmp_path):
        """E3-d: importing a legacy runtime bundle (version:2, no spec fields) still works."""
        voices_root = tmp_path / "voices"
        voices_root.mkdir()
        legacy_voice = {
            "version": 2,
            "name": "Old Voice",
            "id": "old-voice-id",
            "default_variant": "Default",
        }
        bundle = self._make_bundle(legacy_voice)

        result = _import(voices_root, bundle)
        voice_name = result["voice_name"]
        assert (voices_root / voice_name / "voice.json").exists()
        voice_data = json.loads((voices_root / voice_name / "voice.json").read_text())
        assert voice_data["name"] == voice_name
        # state.json should exist for default_variant
        state_data = json.loads((voices_root / voice_name / "state.json").read_text())
        assert "default_variant" in state_data

    def test_import_legacy_bundle_no_version_in_voice_json(self, tmp_path):
        """E3-d corollary: legacy bundle import also does not persist 'version' in voice.json."""
        voices_root = tmp_path / "voices"
        voices_root.mkdir()
        legacy_voice = {
            "version": 2,
            "name": "Old Voice",
            "id": "old-voice-id",
            "default_variant": "Default",
        }
        bundle = self._make_bundle(legacy_voice)
        result = _import(voices_root, bundle)
        voice_data = json.loads((voices_root / result["voice_name"] / "voice.json").read_text())
        assert "version" not in voice_data


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------

class TestRoundTrip:
    """RT: export → import produces identical metadata."""

    def test_round_trip_attributes_preserved(self, tmp_path):
        """RT-1: export a fully-tagged voice, import the bundle, attributes are identical."""
        src_root = tmp_path / "src"
        _write_voice(src_root, "Gravel Road", _FULLY_TAGGED_VOICE_JSON, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })
        bundle = _export(src_root, "Gravel Road")

        dst_root = tmp_path / "dst"
        dst_root.mkdir()
        result = _import(dst_root, bundle)
        voice_name = result["voice_name"]

        imported_voice = json.loads((dst_root / voice_name / "voice.json").read_text())
        assert imported_voice["attributes"] == _FULLY_TAGGED_VOICE_JSON["attributes"]
        assert imported_voice.get("spec") == "audiobook-studio-voice"
        assert imported_voice.get("languages") == ["en-US"]
