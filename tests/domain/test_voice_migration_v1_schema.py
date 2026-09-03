"""Tests for Phase B — migration of existing voices to v1 bundle schema.

Phase B acceptance criteria (doc 04 §Phase B):

B1-a  Migration adds spec/spec_version/taxonomy_version to voice.json.
B1-b  Integer `version` field is dropped (superseded by spec_version).
B1-c  `default_variant` is moved to state.json; voice.json no longer contains it.
B1-d  Migrated voice.json has NO `attributes` block (D7 — untagged, no placeholder).
B1-e  `labels[]` are migrated to `tags[]`; `labels` is dropped.
B1-f  `preview_audio` from variant profile.json is copied to `samples[]` in voice.json
      (conditional — only when the field is present).
B1-g  Migration is idempotent: running it twice produces the same result.
B1-h  A migrated voice.json loads via lenient loader as untagged (D7).
B1-i  `state.json` can be read back to recover `default_variant`.
"""

from __future__ import annotations

import json
import pytest
from pathlib import Path
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _write_voice(root: Path, name: str, voice_data: dict, variants: dict[str, dict]) -> Path:
    """Create a minimal on-disk voice structure for testing."""
    voice_dir = root / name
    voice_dir.mkdir(parents=True)
    (voice_dir / "voice.json").write_text(json.dumps(voice_data))
    for variant_name, profile_data in variants.items():
        variant_dir = voice_dir / variant_name
        variant_dir.mkdir()
        (variant_dir / "profile.json").write_text(json.dumps(profile_data))
    return voice_dir


# ---------------------------------------------------------------------------
# manifest helpers: load_voice_state / save_voice_state
# ---------------------------------------------------------------------------

class TestVoiceStateHelpers:
    """Unit tests for state.json read/write helpers in manifest.py."""

    def test_save_and_load_state_round_trip(self, tmp_path):
        from app.domain.voices.manifest import save_voice_state, load_voice_state

        voice_dir = tmp_path / "voices" / "Test"
        voice_dir.mkdir(parents=True)

        with patch("app.core.config.VOICES_DIR", tmp_path / "voices", create=True):
            with patch("app.domain.voices.manifest.VOICES_DIR", tmp_path / "voices", create=True):
                saved = save_voice_state(voice_dir, {"default_variant": "Angry"})
                assert saved is True

                state = load_voice_state(voice_dir)
                assert state["default_variant"] == "Angry"

    def test_load_missing_state_returns_empty(self, tmp_path):
        from app.domain.voices.manifest import load_voice_state

        voice_dir = tmp_path / "voices" / "Test"
        voice_dir.mkdir(parents=True)

        with patch("app.core.config.VOICES_DIR", tmp_path / "voices", create=True):
            with patch("app.domain.voices.manifest.VOICES_DIR", tmp_path / "voices", create=True):
                state = load_voice_state(voice_dir)
                assert state == {}

    def test_save_state_is_atomic(self, tmp_path):
        """save_voice_state writes atomically (tmp then replace)."""
        from app.domain.voices.manifest import save_voice_state, load_voice_state

        voice_dir = tmp_path / "voices" / "Test"
        voice_dir.mkdir(parents=True)

        with patch("app.core.config.VOICES_DIR", tmp_path / "voices", create=True):
            with patch("app.domain.voices.manifest.VOICES_DIR", tmp_path / "voices", create=True):
                save_voice_state(voice_dir, {"default_variant": "A"})
                save_voice_state(voice_dir, {"default_variant": "B"})
                state = load_voice_state(voice_dir)
                assert state["default_variant"] == "B"
                # No leftover .tmp file
                assert not (voice_dir / "state.json.tmp").exists()


# ---------------------------------------------------------------------------
# B1: migrate_voices_to_v1_schema
# ---------------------------------------------------------------------------

class TestMigrateVoicesToV1Schema:
    """Tests for migrate_voices_to_v1_schema() in app/domain/voices/migration.py."""

    def _patch_voices_dir(self, voices_root: Path):
        return (
            patch("app.core.config.VOICES_DIR", voices_root, create=True),
            patch("app.domain.voices.manifest.VOICES_DIR", voices_root, create=True),
            patch("app.domain.voices.migration.VOICES_DIR", voices_root, create=True),
        )

    def _run_migration(self, voices_root: Path) -> bool:
        from app.domain.voices.migration import migrate_voices_to_v1_schema

        p1, p2, p3 = self._patch_voices_dir(voices_root)
        with p1, p2, p3:
            return migrate_voices_to_v1_schema(voices_root)

    def test_adds_spec_fields(self, tmp_path):
        """B1-a: spec, spec_version, taxonomy_version added to voice.json."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {"version": 2, "name": "Test", "id": "abc123"}, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        assert data["spec"] == "audiobook-studio-voice"
        assert data["spec_version"] == "1.0"
        assert data["taxonomy_version"] == "1.0"

    def test_drops_integer_version(self, tmp_path):
        """B1-b: integer `version` field removed from voice.json."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {"version": 2, "name": "Test", "id": "abc123"}, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        assert "version" not in data

    def test_default_variant_moved_to_state_json(self, tmp_path):
        """B1-c: default_variant is moved out of voice.json into state.json."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {
            "version": 2, "name": "Test", "id": "abc123", "default_variant": "Angry",
        }, {
            "Angry": {"variant_name": "Angry", "engine": "xtts"},
        })

        self._run_migration(voices_root)

        voice_data = json.loads((voices_root / "Test" / "voice.json").read_text())
        assert "default_variant" not in voice_data

        state_data = json.loads((voices_root / "Test" / "state.json").read_text())
        assert state_data["default_variant"] == "Angry"

    def test_no_attributes_block_written_for_untagged_voice(self, tmp_path):
        """B1-d: migrating a voice.json with no attributes must not add one (D7 --
        no placeholder). Migration never touches the "attributes" key at all, so
        this alone can't fail; paired with the sibling test below (a voice that
        DOES already carry attributes), together they cover the real branch --
        migration is attributes-neutral, neither adding nor stripping."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {"version": 2, "name": "Test", "id": "abc123"}, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        assert "attributes" not in data

    def test_pre_existing_attributes_block_is_preserved(self, tmp_path):
        """B1-d corollary: if a voice was already tagged (has an attributes
        block) before migration, migration must NOT strip it -- per the source
        comment in _migrate_one_voice_to_v1_schema: 'do NOT remove it here
        because the voice may have been user-tagged since.'"""
        voices_root = tmp_path / "voices"
        attributes = {"class": "human", "gender": "masculine"}
        _write_voice(voices_root, "Test", {
            "version": 2, "name": "Test", "id": "abc123", "attributes": attributes,
        }, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        assert data["attributes"] == attributes

    def test_labels_migrated_to_tags(self, tmp_path):
        """B1-e: labels[] migrated to tags[]; labels field dropped."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {
            "version": 2, "name": "Test", "id": "abc123",
            "labels": ["cowboy", "raspy"],
        }, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        assert "labels" not in data
        assert "cowboy" in data.get("tags", [])
        assert "raspy" in data.get("tags", [])

    def test_preview_audio_migrated_to_samples(self, tmp_path):
        """B1-f: preview_audio in profile.json → samples[] in voice.json (conditional)."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {
            "version": 2, "name": "Test", "id": "abc123", "default_variant": "Default",
        }, {
            "Default": {
                "variant_name": "Default", "engine": "xtts",
                "preview_audio": "samples/preview.mp3",
                "preview_text": "Hello world.",
            },
        })

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        samples = data.get("samples", [])
        assert len(samples) >= 1
        primary = [s for s in samples if s.get("primary")]
        assert len(primary) == 1
        assert primary[0]["path"] == "samples/preview.mp3"

    def test_no_preview_audio_no_samples_written(self, tmp_path):
        """B1-f conditional: if no preview_audio in any profile, samples[] not added."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {"version": 2, "name": "Test", "id": "abc123"}, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        # No samples key, or empty list — either is acceptable
        assert not data.get("samples")

    def test_idempotent_second_run(self, tmp_path):
        """B1-g: running migration twice produces identical output."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {
            "version": 2, "name": "Test", "id": "abc123", "default_variant": "Default",
            "labels": ["narrator"],
        }, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        self._run_migration(voices_root)
        data_after_first = json.loads((voices_root / "Test" / "voice.json").read_text())
        state_after_first = json.loads((voices_root / "Test" / "state.json").read_text())

        self._run_migration(voices_root)
        data_after_second = json.loads((voices_root / "Test" / "voice.json").read_text())
        state_after_second = json.loads((voices_root / "Test" / "state.json").read_text())

        assert data_after_first == data_after_second
        assert state_after_first == state_after_second

    def test_migrated_voice_loads_as_untagged(self, tmp_path):
        """B1-h: migrated voice.json loads via lenient loader and is untagged (D7)."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {"version": 2, "name": "Test", "id": "abc123"}, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })

        voice_dir = voices_root / "Test"

        p1 = patch("app.core.config.VOICES_DIR", voices_root, create=True)
        p2 = patch("app.domain.voices.manifest.VOICES_DIR", voices_root, create=True)
        p3 = patch("app.domain.voices.migration.VOICES_DIR", voices_root, create=True)
        with p1, p2, p3:
            from app.domain.voices.migration import migrate_voices_to_v1_schema
            migrate_voices_to_v1_schema(voices_root)

            from app.domain.voices.manifest import load_and_validate_voice_manifest
            result, is_untagged = load_and_validate_voice_manifest(voice_dir)

        assert is_untagged is True
        assert result.get("spec") == "audiobook-studio-voice"

    def test_returns_true_on_success(self, tmp_path):
        """migrate_voices_to_v1_schema returns True when complete."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {"version": 2, "name": "Test", "id": "abc123"}, {
            "Default": {"variant_name": "Default"},
        })
        result = self._run_migration(voices_root)
        assert result is True

    def test_returns_false_on_fatal_scan_error(self, tmp_path):
        """The docstring's other branch: a fatal error scanning voices_root
        (here, voices_root is a *file*, so ``.iterdir()`` raises
        NotADirectoryError) is caught by the outer try/except and reported
        as False -- not just the always-True happy path."""
        voices_root = tmp_path / "voices_root_is_a_file"
        voices_root.write_text("not a directory")

        result = self._run_migration(voices_root)
        assert result is False

    def test_skips_non_directory_entries(self, tmp_path):
        """A stray file in voices/ does not crash migration."""
        voices_root = tmp_path / "voices"
        voices_root.mkdir()
        (voices_root / "stray.txt").write_text("ignored")
        _write_voice(voices_root, "Test", {"version": 2, "name": "Test", "id": "abc123"}, {
            "Default": {"variant_name": "Default"},
        })
        result = self._run_migration(voices_root)
        assert result is True

    def test_already_migrated_voice_not_downgraded(self, tmp_path):
        """B1-g idempotency: a voice already at spec_version=1.0 is not changed."""
        voices_root = tmp_path / "voices"
        _write_voice(voices_root, "Test", {
            "spec": "audiobook-studio-voice",
            "spec_version": "1.0",
            "taxonomy_version": "1.0",
            "name": "Test",
            "id": "abc123",
            "tags": ["narrator"],
        }, {
            "Default": {"variant_name": "Default", "engine": "xtts"},
        })
        # Write state.json already
        (voices_root / "Test" / "state.json").write_text(
            json.dumps({"default_variant": "Default"})
        )

        self._run_migration(voices_root)

        data = json.loads((voices_root / "Test" / "voice.json").read_text())
        assert data["spec_version"] == "1.0"
        assert "narrator" in data["tags"]
        assert "version" not in data
        assert "default_variant" not in data
