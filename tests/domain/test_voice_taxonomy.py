"""Tests for Phase A voice taxonomy validation.

Covers:
- A2: lenient schema validation — invalid values demoted to tags, voice still loads
- A3: taxonomy_version reader — unknown major version warns but loads
- D7: missing attributes → is_untagged=True
- Round-trip: valid attributes pass through unchanged
- Schema conformance: design-docs/specs/voice-bundle-template/voice.json passes strict
"""

import json
import logging
import pytest
from pathlib import Path
from unittest.mock import patch


# ---------------------------------------------------------------------------
# taxonomy module tests
# ---------------------------------------------------------------------------

class TestValidateAndDegradeAttributes:
    def test_valid_attributes_pass_through(self):
        from app.domain.voices.taxonomy import validate_and_degrade_attributes

        attrs = {
            "class": "human",
            "gender": "masculine",
            "age": "senior",
            "accent": "us-southern",
            "tone": ["authoritative", "somber"],
            "timbre": ["deep", "gravelly"],
            "pace": "measured",
            "use_case": ["audiobook"],
            "quality": ["studio-quality"],
        }
        cleaned, tags, is_untagged = validate_and_degrade_attributes(attrs, [])

        assert cleaned["class"] == "human"
        assert cleaned["gender"] == "masculine"
        assert cleaned["age"] == "senior"
        assert cleaned["tone"] == ["authoritative", "somber"]
        assert is_untagged is False
        assert tags == []

    def test_invalid_scalar_value_demoted_to_tag(self):
        """A2 acceptance: class='alien' is invalid; voice still loads; 'alien' in tags."""
        from app.domain.voices.taxonomy import validate_and_degrade_attributes

        attrs = {
            "class": "alien",  # not a valid value
            "gender": "masculine",
            "age": "adult",
        }
        cleaned, tags, is_untagged = validate_and_degrade_attributes(attrs, [])

        assert "class" not in cleaned
        assert "alien" in tags
        # Required fields missing (class was invalid) → untagged
        assert is_untagged is True

    def test_invalid_array_item_demoted_to_tag(self):
        """One bad tone value is dropped; the rest remain; bad value appears in tags."""
        from app.domain.voices.taxonomy import validate_and_degrade_attributes

        attrs = {
            "class": "human",
            "gender": "feminine",
            "age": "adult",
            "tone": ["warm", "operatic"],  # "operatic" not valid
        }
        cleaned, tags, is_untagged = validate_and_degrade_attributes(attrs, [])

        assert cleaned["tone"] == ["warm"]
        assert "operatic" in tags
        assert is_untagged is False

    def test_missing_attributes_block_is_untagged(self):
        """D7: attributes absent → is_untagged=True; no placeholder written."""
        from app.domain.voices.taxonomy import validate_and_degrade_attributes

        cleaned, tags, is_untagged = validate_and_degrade_attributes(None, [])

        assert cleaned is None
        assert is_untagged is True

    def test_existing_tags_preserved(self):
        from app.domain.voices.taxonomy import validate_and_degrade_attributes

        attrs = {"class": "human", "gender": "neutral", "age": "young-adult"}
        cleaned, tags, is_untagged = validate_and_degrade_attributes(attrs, ["cowboy", "rancher"])

        assert "cowboy" in tags
        assert "rancher" in tags

    def test_demoted_values_do_not_duplicate_existing_tags(self):
        from app.domain.voices.taxonomy import validate_and_degrade_attributes

        attrs = {
            "class": "alien",  # invalid → would become "alien" tag
            "gender": "masculine",
            "age": "adult",
        }
        cleaned, tags, is_untagged = validate_and_degrade_attributes(attrs, ["alien"])

        # "alien" already in tags — must not be duplicated
        assert tags.count("alien") == 1


class TestTaxonomyVersionCheck:
    def test_supported_version_accepted_silently(self):
        from app.domain.voices.taxonomy import check_taxonomy_version

        result = check_taxonomy_version("1.0")
        assert result is True

    def test_newer_major_version_warns_but_loads(self, caplog):
        """A3: unknown major version (2.0) logs a warning; still returns True."""
        from app.domain.voices.taxonomy import check_taxonomy_version

        with caplog.at_level(logging.WARNING, logger="app.domain.voices.taxonomy"):
            result = check_taxonomy_version("2.0")

        assert result is True
        assert any("2.0" in r.message for r in caplog.records)

    def test_missing_taxonomy_version_accepted(self):
        from app.domain.voices.taxonomy import check_taxonomy_version

        result = check_taxonomy_version(None)
        assert result is True


class TestStrictValidation:
    def test_valid_attributes_no_errors(self):
        from app.domain.voices.taxonomy import validate_attributes_strict

        errors = validate_attributes_strict({
            "class": "creature",
            "gender": "not-applicable",
            "age": "ageless",
        })
        assert errors == []

    def test_invalid_value_returns_error(self):
        from app.domain.voices.taxonomy import validate_attributes_strict

        errors = validate_attributes_strict({"class": "alien"})
        assert any("alien" in e for e in errors)

    def test_unknown_field_returns_error(self):
        from app.domain.voices.taxonomy import validate_attributes_strict

        errors = validate_attributes_strict({"species": "elf"})
        assert any("species" in e for e in errors)


class TestValidateProvenanceStrict:
    """Strict validation for the `provenance` field (voice.schema.json §provenance).

    provenance = {source?, author?, consent_ack?, created_at?}; only `source` is a
    controlled vocabulary (recorded/cloned/imported/designed). Decoupled from any
    HF importer — this only validates the shape/vocabulary on the write path.
    """

    def test_valid_provenance_no_errors(self):
        from app.domain.voices.taxonomy import validate_provenance_strict

        errors = validate_provenance_strict({
            "source": "imported",
            "author": "hf:some-namespace",
            "consent_ack": True,
            "created_at": "2026-07-03T00:00:00Z",
        })
        assert errors == []

    def test_empty_provenance_no_errors(self):
        from app.domain.voices.taxonomy import validate_provenance_strict

        assert validate_provenance_strict({}) == []

    def test_invalid_source_returns_error(self):
        from app.domain.voices.taxonomy import validate_provenance_strict

        errors = validate_provenance_strict({"source": "alien-abduction"})
        assert any("alien-abduction" in e for e in errors)

    def test_unknown_field_returns_error(self):
        from app.domain.voices.taxonomy import validate_provenance_strict

        errors = validate_provenance_strict({"hf_repo_id": "someone/some-voice"})
        assert any("hf_repo_id" in e for e in errors)

    def test_wrong_type_for_consent_ack_returns_error(self):
        from app.domain.voices.taxonomy import validate_provenance_strict

        errors = validate_provenance_strict({"consent_ack": "yes"})
        assert any("consent_ack" in e for e in errors)

    def test_wrong_type_for_author_returns_error(self):
        from app.domain.voices.taxonomy import validate_provenance_strict

        errors = validate_provenance_strict({"author": 12345})
        assert any("author" in e for e in errors)

    def test_oversized_author_string_returns_error(self):
        """Free-form string fields are capped so a malformed PATCH can't persist
        a multi-MB string that gets replayed on every GET /api/voices."""
        from app.domain.voices.taxonomy import validate_provenance_strict

        errors = validate_provenance_strict({"author": "x" * 513})
        assert any("author" in e and "512" in e for e in errors)

    def test_author_at_max_length_is_valid(self):
        from app.domain.voices.taxonomy import validate_provenance_strict

        errors = validate_provenance_strict({"author": "x" * 512})
        assert errors == []


# ---------------------------------------------------------------------------
# manifest loader integration tests
# ---------------------------------------------------------------------------

class TestLoadAndValidateVoiceManifest:
    def _make_voice_dir(self, tmp_path: Path, manifest: dict) -> Path:
        """Write voice.json inside a temp voices/<Name> directory."""
        voice_dir = tmp_path / "voices" / "TestVoice"
        voice_dir.mkdir(parents=True)
        (voice_dir / "voice.json").write_text(json.dumps(manifest))
        return voice_dir

    def test_valid_manifest_loads_and_not_untagged(self, tmp_path):
        from app.domain.voices.manifest import load_and_validate_voice_manifest

        manifest_data = {
            "spec": "audiobook-studio-voice",
            "spec_version": "1.0",
            "taxonomy_version": "1.0",
            "id": "test-voice",
            "name": "Test Voice",
            "image": "icon.png",
            "samples": [{"path": "samples/preview.mp3", "primary": True}],
            "languages": ["en-US"],
            "attributes": {
                "class": "human",
                "gender": "feminine",
                "age": "adult",
            },
            "tags": [],
        }
        voice_dir = self._make_voice_dir(tmp_path, manifest_data)

        with patch("app.domain.voices.manifest.VOICES_DIR", tmp_path / "voices", create=True):
            with patch("app.core.config.VOICES_DIR", tmp_path / "voices", create=True):
                result, is_untagged = load_and_validate_voice_manifest(voice_dir)

        assert is_untagged is False
        assert result["attributes"]["class"] == "human"

    def test_invalid_class_value_demoted_voice_loads(self, tmp_path):
        """A2 acceptance: class='alien' → voice loads, 'alien' in tags."""
        from app.domain.voices.manifest import load_and_validate_voice_manifest

        manifest_data = {
            "version": 2,
            "name": "Test Voice",
            "id": "test-voice",
            "attributes": {
                "class": "alien",
                "gender": "masculine",
                "age": "adult",
            },
            "tags": [],
        }
        voice_dir = self._make_voice_dir(tmp_path, manifest_data)

        with patch("app.domain.voices.manifest.VOICES_DIR", tmp_path / "voices", create=True):
            with patch("app.core.config.VOICES_DIR", tmp_path / "voices", create=True):
                result, is_untagged = load_and_validate_voice_manifest(voice_dir)

        assert "alien" in result["tags"]
        assert "class" not in (result.get("attributes") or {})
        # class was demoted → required attribute missing → untagged
        assert is_untagged is True

    def test_missing_attributes_block_is_untagged(self, tmp_path):
        """D7: migrated voice.json with no attributes block → untagged."""
        from app.domain.voices.manifest import load_and_validate_voice_manifest

        manifest_data = {"version": 2, "name": "Test Voice", "id": "test-voice"}
        voice_dir = self._make_voice_dir(tmp_path, manifest_data)

        with patch("app.domain.voices.manifest.VOICES_DIR", tmp_path / "voices", create=True):
            with patch("app.core.config.VOICES_DIR", tmp_path / "voices", create=True):
                result, is_untagged = load_and_validate_voice_manifest(voice_dir)

        assert is_untagged is True
        assert result.get("_untagged") is True

    def test_taxonomy_version_stored_on_result(self, tmp_path):
        """A3: _taxonomy_version is preserved on returned manifest."""
        from app.domain.voices.manifest import load_and_validate_voice_manifest

        manifest_data = {
            "version": 2,
            "name": "Test Voice",
            "id": "test-voice",
            "taxonomy_version": "1.0",
        }
        voice_dir = self._make_voice_dir(tmp_path, manifest_data)

        with patch("app.domain.voices.manifest.VOICES_DIR", tmp_path / "voices", create=True):
            with patch("app.core.config.VOICES_DIR", tmp_path / "voices", create=True):
                result, _ = load_and_validate_voice_manifest(voice_dir)

        assert result["_taxonomy_version"] == "1.0"


# ---------------------------------------------------------------------------
# Schema conformance: bundle template must pass strict jsonschema
# ---------------------------------------------------------------------------

class TestSchemaConformance:
    def test_bundle_template_passes_strict_schema(self):
        """A1 acceptance: voice-bundle-template/voice.json validates against voice.schema.json."""
        import jsonschema

        repo_root = Path(__file__).resolve().parents[2]
        schema = json.loads((repo_root / "design-docs/specs/voice.schema.json").read_text())
        instance = json.loads(
            (repo_root / "design-docs/specs/voice-bundle-template/voice.json").read_text()
        )
        # Should not raise
        jsonschema.validate(instance, schema)
