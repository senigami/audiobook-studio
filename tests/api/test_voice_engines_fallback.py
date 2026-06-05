import pytest
from unittest.mock import patch, MagicMock
from app.engines.voice_engines import get_default_profile_engine, normalize_tts_engine

def test_get_default_profile_engine_filters_disabled_engines():
    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]

    # 1. Configured default is "voxtral", but "voxtral" is disabled.
    # Under strict policy, it returns "" instead of falling back.
    settings = {
        "default_engine": "voxtral",
        "enabled_plugins": {
            "voxtral": False,
            "xtts": True
        }
    }

    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == ""

def test_get_default_profile_engine_returns_empty_when_all_disabled():
    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]

    # 2. Both engines are disabled. It should return "" instead of falling back to a disabled one.
    settings = {
        "default_engine": "voxtral",
        "enabled_plugins": {
            "voxtral": False,
            "xtts": False
        }
    }

    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == ""

def test_normalize_tts_engine_returns_empty_when_disabled():
    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]

    # 3. Requesting "voxtral" when "voxtral" is disabled should resolve to ""
    settings = {
        "default_engine": "xtts",
        "enabled_plugins": {
            "voxtral": False,
            "xtts": True
        }
    }

    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests), \
         patch("app.db.state_settings.get_settings", return_value=settings):
        # We request "voxtral", but it is disabled. It should normalize to ""
        normalized = normalize_tts_engine("voxtral", settings=settings)
        assert normalized == ""


def test_get_default_profile_engine_ranking_prefers_local():
    # Registry has voxtral (cloud) first, then xtts (local non-cloud)
    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]
    settings = {
        "enabled_plugins": {
            "voxtral": True,
            "xtts": True
        }
    }
    # Under strict policy, with no explicit default set, it returns ""
    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests), \
         patch("app.db.state_settings.get_settings", return_value=settings):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == ""


def test_get_default_profile_engine_explicit_wins_when_valid():
    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]
    # Explicit default_engine is set to 'voxtral' and it is enabled
    settings = {
        "default_engine": "voxtral",
        "enabled_plugins": {
            "voxtral": True,
            "xtts": True
        }
    }
    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests), \
         patch("app.db.state_settings.get_settings", return_value=settings):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == "voxtral"


def test_normalize_profile_metadata_preserves_explicit_engine(tmp_path):
    from app.db.speakers import normalize_profile_metadata
    from app.core import config

    meta = {
        "engine": "xtts",
        "variant_name": "Angry"
    }

    # Verify that normalize_profile_metadata preserves the explicit engine "xtts"
    normalized = normalize_profile_metadata("Dracula - Angry", meta, persist=False)
    assert normalized["engine"] == "xtts"


def test_sync_speakers_from_profiles_preserves_existing_engine(tmp_path, monkeypatch):
    import json
    from app.db.speakers import sync_speakers_from_profiles, get_speaker
    from app.core import config

    # Set up temp voices dir
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)

    # Create a voice profile with an explicit engine 'xtts'
    voice_root = voices_dir / "Dracula"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({"id": "some-id", "default_variant": "Default"}))

    variant_dir = voice_root / "Default"
    variant_dir.mkdir()

    profile_data = {
        "engine": "xtts",
        "speaker_id": "some-id",
        "variant_name": "Default"
    }
    profile_file = variant_dir / "profile.json"
    profile_file.write_text(json.dumps(profile_data, indent=2))

    # Run sync
    sync_speakers_from_profiles(voices_dir=voices_dir)

    # Read the profile back and ensure the engine did not change
    with open(profile_file, "r") as f:
        saved_profile = json.load(f)
    assert saved_profile["engine"] == "xtts"


def test_get_default_profile_engine_ranking_all_layers():
    manifests = [
        {"engine_id": "cloud-engine", "local": False, "cloud": True, "network": True},
        {"engine_id": "network-local", "local": True, "cloud": False, "network": True},
        {"engine_id": "non-cloud-non-network-local", "local": True, "cloud": False, "network": False},
        {"engine_id": "another-non-cloud-non-network-local", "local": True, "cloud": False, "network": False}
    ]

    # No default_engine is set. Should strictly return "".
    settings = {
        "enabled_plugins": {
            "cloud-engine": True,
            "network-local": True,
            "non-cloud-non-network-local": True,
            "another-non-cloud-non-network-local": True
        }
    }
    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests), \
         patch("app.db.state_settings.get_settings", return_value=settings):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == ""


def test_sync_speakers_from_profiles_does_not_write_inferred_engine(tmp_path, monkeypatch):
    import json
    from app.db.speakers import sync_speakers_from_profiles
    from app.core import config

    # Set up temp voices dir
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)

    # Create a voice profile with NO explicit engine
    voice_root = voices_dir / "Dracula"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({"id": "some-id", "default_variant": "Default"}))

    variant_dir = voice_root / "Default"
    variant_dir.mkdir()

    profile_data = {
        "variant_name": "Default"
    }
    profile_file = variant_dir / "profile.json"
    profile_file.write_text(json.dumps(profile_data, indent=2))

    # Run sync
    sync_speakers_from_profiles(voices_dir=voices_dir)

    # Read the profile back and ensure the engine was NOT written to disk
    with open(profile_file, "r") as f:
        saved_profile = json.load(f)

    assert "speaker_id" in saved_profile
    assert "engine" not in saved_profile, f"Engine should not be written to disk if not originally present, but found: {saved_profile.get('engine')}"


def test_update_settings_without_default_engine_does_not_persist_inferred(tmp_path, monkeypatch):
    import json
    from app.db import state
    from app.db.state_settings import update_settings, get_settings

    state_file = tmp_path / "state.json"
    monkeypatch.setattr(state, "STATE_FILE", state_file)

    # Initial state with no default_engine
    state_data = {
        "settings": {
            "safe_mode": True
        }
    }
    state_file.write_text(json.dumps(state_data, indent=2))

    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]

    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests):
        # Update another setting
        update_settings(safe_mode=False)

        # Read back raw state file
        with open(state_file, "r") as f:
            raw_state = json.load(f)

        assert "default_engine" not in raw_state["settings"], "default_engine should not be persisted if not originally present"


def test_update_settings_preserves_disabled_invalid_default_engine(tmp_path, monkeypatch):
    import json
    from app.db import state
    from app.db.state_settings import update_settings, get_settings

    state_file = tmp_path / "state.json"
    monkeypatch.setattr(state, "STATE_FILE", state_file)

    # Initial state with default_engine set to 'voxtral' but voxtral is disabled
    state_data = {
        "settings": {
            "default_engine": "voxtral",
            "safe_mode": True,
            "enabled_plugins": {
                "voxtral": False,
                "xtts": True
            }
        }
    }
    state_file.write_text(json.dumps(state_data, indent=2))

    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]

    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests):
        # Update another setting
        update_settings(safe_mode=False)

        # Read back raw state file from disk
        with open(state_file, "r") as f:
            raw_state = json.load(f)

        # The disk value must still be voxtral, NOT xtts
        assert raw_state["settings"]["default_engine"] == "voxtral", "Disabled/invalid default_engine should be preserved on disk"

        # The runtime memory value should resolve to ""
        runtime_settings = get_settings()
        assert runtime_settings["default_engine"] == "", "In memory, disabled default_engine should resolve to empty"


def test_normalize_profile_metadata_does_not_write_inferred_engine(tmp_path, monkeypatch):
    import json
    from app.db.speakers import normalize_profile_metadata
    from app.core import config

    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)

    # We do a normalization with persist=True on a profile with no engine in metadata
    meta = {
        "variant_name": "Default"
    }

    profile_dir = voices_dir / "Dracula" / "Default"
    profile_dir.mkdir(parents=True)
    profile_file = profile_dir / "profile.json"
    profile_file.write_text(json.dumps(meta, indent=2))

    manifests = [
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]

    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests):
        # Call normalize_profile_metadata with persist=True
        normalize_profile_metadata("Dracula", meta, persist=True)

        with open(profile_file, "r") as f:
            saved_profile = json.load(f)

        assert "engine" not in saved_profile, "Engine should not be written to profile.json when originally absent"


def test_no_registry_entries_yields_empty_resolution():
    with patch("app.engines.voice_engines._get_registry_manifests", return_value=[]), \
         patch("app.db.state_settings.get_settings", return_value={}):
        resolved = get_default_profile_engine()
        assert resolved == "", "No registry entries should yield an empty default engine resolution"



def test_explicit_valid_default_engine_resolves():
    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]
    settings = {
        "default_engine": "voxtral",
        "enabled_plugins": {
            "voxtral": True,
            "xtts": True
        }
    }
    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == "voxtral", "Explicit valid default_engine should resolve successfully"


def test_normalize_profile_metadata_empty_does_not_write_file(tmp_path, monkeypatch):
    import json
    from app.db.speakers import normalize_profile_metadata
    from app.core import config

    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)

    profile_dir = voices_dir / "Dracula" / "Default"
    profile_dir.mkdir(parents=True)
    profile_file = profile_dir / "profile.json"

    assert not profile_file.exists(), "profile.json should not be created if metadata was empty"


def test_update_settings_explicit_invalid_default_engine_preserves_on_disk(tmp_path, monkeypatch):
    import json
    from app.db import state
    from app.db.state_settings import update_settings, get_settings

    state_file = tmp_path / "state.json"
    monkeypatch.setattr(state, "STATE_FILE", state_file)

    state_data = {
        "settings": {
            "safe_mode": True,
            "enabled_plugins": {
                "voxtral": False,
                "xtts": True
            }
        }
    }
    state_file.write_text(json.dumps(state_data, indent=2))

    manifests = [
        {"engine_id": "voxtral", "local": False, "cloud": True, "network": True},
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]

    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests):
        # Update settings explicitly setting default_engine to the disabled "voxtral"
        update_settings(default_engine="voxtral")

        # Read back raw state file from disk
        with open(state_file, "r") as f:
            raw_state = json.load(f)

        assert raw_state["settings"]["default_engine"] == "voxtral", "Disabled default_engine should be saved exactly as requested on disk"

        # But in memory, it resolves to ""
        runtime_settings = get_settings()
        assert runtime_settings["default_engine"] == ""


def test_normalize_tts_engine_fails_clear_when_invalid_and_no_usable_engine():
    # Empty registry means no active/usable engines exist
    with patch("app.engines.voice_engines._get_registry_manifests", return_value=[]):
        normalized = normalize_tts_engine("voxtral")
        assert normalized == "", "Should return empty string (or fail) when engine is invalid/disabled and no runtime candidate exists"


def test_alias_only_profile_metadata_resolves_to_empty():
    from app.db.speakers import get_profile_engine
    # If the profile metadata only has alias-related keys but no explicit engine key,
    # it must NOT resolve to that engine implicitly.
    meta = {
        "voice_profile_id": "some_id",
        # For example, xtts-specific aliases, but no explicit "engine": "xtts"
    }
    with patch("app.db.speakers.find_secure_file", return_value="/fake/profile.json"), \
         patch("app.db.speakers._existing_profile_dir", return_value="/fake/dir"), \
         patch("builtins.open", MagicMock()), \
         patch("json.loads", return_value=meta), \
         patch("app.engines.voice_engines.list_tts_engines", return_value=["xtts"]), \
         patch("app.engines.voice_engines._get_registry_manifests", return_value=[{"engine_id": "xtts"}]) as mock_manifests:
        # Note: get_profile_engine does normalize_tts_engine(_infer_profile_engine(meta), fallback)
        resolved = get_profile_engine("Dracula")
        assert resolved == "", "Alias-only metadata must resolve to empty engine"



def test_normalize_base_profiles_does_not_add_engine_when_absent(tmp_path, monkeypatch):
    import json
    from app.db.speakers import normalize_base_profiles
    from app.core import config

    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)

    voice_root = voices_dir / "Dracula"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({"id": "some-id", "default_variant": "Default"}))

    variant_dir = voice_root / "Default"
    variant_dir.mkdir()

    profile_data = {
        "variant_name": "Default"
    }
    profile_file = variant_dir / "profile.json"
    profile_file.write_text(json.dumps(profile_data, indent=2))

    mock_conn = MagicMock()
    mock_cursor = mock_conn.__enter__.return_value.cursor.return_value
    mock_cursor.fetchall.return_value = [
        {"id": "some-id", "name": "Dracula", "default_profile_name": "Dracula"}
    ]

    with patch("app.db.speakers.get_connection", return_value=mock_conn):
        normalize_base_profiles(voices_dir=voices_dir)

    with open(profile_file, "r") as f:
        saved_profile = json.load(f)

    assert "engine" not in saved_profile


def test_normalize_base_profiles_preserves_explicit_engine(tmp_path, monkeypatch):
    import json
    from app.db.speakers import normalize_base_profiles
    from app.core import config

    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)

    voice_root = voices_dir / "Dracula"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({"id": "some-id", "default_variant": "Default"}))

    variant_dir = voice_root / "Default"
    variant_dir.mkdir()

    profile_data = {
        "engine": "voxtral",
        "variant_name": "Default"
    }
    profile_file = variant_dir / "profile.json"
    profile_file.write_text(json.dumps(profile_data, indent=2))

    mock_conn = MagicMock()
    mock_cursor = mock_conn.__enter__.return_value.cursor.return_value
    mock_cursor.fetchall.return_value = [
        {"id": "some-id", "name": "Dracula", "default_profile_name": "Dracula"}
    ]

    with patch("app.db.speakers.get_connection", return_value=mock_conn):
        normalize_base_profiles(voices_dir=voices_dir)

    with open(profile_file, "r") as f:
        saved_profile = json.load(f)

    assert saved_profile["engine"] == "voxtral"


def test_normalize_tts_engine_returns_empty_when_no_valid_engine_or_fallback():
    manifests = [
        {"engine_id": "xtts", "local": True, "cloud": False, "network": False}
    ]
    # Under strict policy, if we ask to normalize with no requested engine, and no fallback engine,
    # it must return "" immediately, even if a valid default engine exists in settings.
    settings = {
        "default_engine": "xtts",
        "enabled_plugins": {
            "xtts": True
        }
    }
    with patch("app.engines.voice_engines._get_registry_manifests", return_value=manifests), \
         patch("app.db.state_settings.get_settings", return_value=settings):
        assert normalize_tts_engine(None, None, settings=settings) == ""
