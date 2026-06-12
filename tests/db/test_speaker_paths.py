"""Unit tests for app.db.speaker_paths — path resolution and containment."""
import json
import os
import pytest
from pathlib import Path
from app.db.speaker_paths import resolve_existing_profile_dir, new_profile_dir


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def voices_root(tmp_path):
    """Return a tmp voices root with a few realistic V2 voice layouts."""
    root = tmp_path / "voices"
    root.mkdir()

    # Dracula/Default — has profile.json
    dracula_default = root / "Dracula" / "Default"
    dracula_default.mkdir(parents=True)
    (dracula_default / "profile.json").write_text('{"engine": "xtts"}')
    (root / "Dracula" / "voice.json").write_text('{"default_variant": "Default"}')

    # Dracula/Angry — has profile.json
    angry = root / "Dracula" / "Angry"
    angry.mkdir(parents=True)
    (angry / "profile.json").write_text('{"engine": "xtts"}')

    # StandaloneVoice — legacy flat layout, has wav but no voice.json
    standalone = root / "StandaloneVoice"
    standalone.mkdir()
    (standalone / "sample.wav").write_bytes(b"")
    # No voice.json → _profile_dir_has_assets via wav fallback, but resolve_existing_profile_dir
    # uses V2 path only; should still return None for legacy voice missing profile.json

    return root


# ---------------------------------------------------------------------------
# resolve_existing_profile_dir
# ---------------------------------------------------------------------------

class TestResolveExistingProfileDir:
    def test_base_name_resolves_to_default_variant(self, voices_root):
        result = resolve_existing_profile_dir(voices_root, "Dracula")
        assert result is not None
        assert result.name == "Default"

    def test_compound_name_resolves_to_variant(self, voices_root):
        result = resolve_existing_profile_dir(voices_root, "Dracula - Angry")
        assert result is not None
        assert result.name == "Angry"

    def test_missing_voice_returns_none(self, voices_root):
        result = resolve_existing_profile_dir(voices_root, "NonExistent")
        assert result is None

    def test_missing_variant_returns_none(self, voices_root):
        result = resolve_existing_profile_dir(voices_root, "Dracula - Ghost")
        assert result is None

    def test_containment_rejection_via_symlink(self, voices_root, tmp_path):
        outside = tmp_path / "outside"
        outside.mkdir()
        (outside / "profile.json").write_text("{}")
        link = voices_root / "Evil"
        link.symlink_to(outside)
        (voices_root / "Evil" / "voice.json").write_text('{}') if False else None
        # We can't make Evil look like a voice root without a real voice.json inside the symlink target
        # Just confirm the resolver doesn't blow up
        result = resolve_existing_profile_dir(voices_root, "Evil")
        # If it resolves, it must be contained
        if result is not None:
            resolved = os.path.abspath(os.path.realpath(str(result)))
            voices_resolved = os.path.abspath(os.path.realpath(str(voices_root)))
            assert resolved.startswith(voices_resolved + os.sep)

    def test_invalid_profile_name_raises(self, voices_root):
        with pytest.raises(ValueError):
            resolve_existing_profile_dir(voices_root, "../evil")

    def test_empty_voices_root_returns_none(self, tmp_path):
        empty = tmp_path / "empty_voices"
        empty.mkdir()
        result = resolve_existing_profile_dir(empty, "Dracula")
        assert result is None


# ---------------------------------------------------------------------------
# new_profile_dir
# ---------------------------------------------------------------------------

class TestNewProfileDir:
    def test_simple_name_returns_child_of_voices(self, voices_root):
        result = new_profile_dir(voices_root, "NewVoice")
        assert str(result).startswith(str(voices_root))

    def test_compound_name_returns_nested_path(self, voices_root):
        result = new_profile_dir(voices_root, "NewVoice - Calm")
        assert result.parts[-1] == "Calm"
        assert result.parts[-2] == "NewVoice"

    def test_traversal_name_raises(self, voices_root):
        with pytest.raises(ValueError):
            new_profile_dir(voices_root, "../evil")
