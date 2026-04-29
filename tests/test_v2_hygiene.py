import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.web import app
from app import db
from app.api.routers import voices_helpers

client = TestClient(app)

@pytest.fixture
def voices_root(tmp_path):
    vroot = tmp_path / "voices"
    vroot.mkdir()
    return vroot

def test_stale_root_profile_ignored(voices_root, monkeypatch):
    # Setup v2 voice structure with a STALE root profile.json
    voice_name = "V2Voice"
    vdir = voices_root / voice_name
    vdir.mkdir()

    # 1. Authoritative voice.json
    (vdir / "voice.json").write_text(json.dumps({"version": 2, "name": voice_name}))

    # 2. Stale root-level profile.json (should be ignored)
    (vdir / "profile.json").write_text(json.dumps({"speaker_id": "STALE", "variant_name": "ROOT"}))

    # 3. Valid Default variant
    default_dir = vdir / "Default"
    default_dir.mkdir()
    (default_dir / "profile.json").write_text(json.dumps({"speaker_id": "VALID", "variant_name": "Default"}))
    (default_dir / "sample.wav").write_text("audio content") # Has assets

    # Patch config.VOICES_DIR to use our temp root
    from app import config
    monkeypatch.setattr(config, "VOICES_DIR", voices_root)

    # Sync and List
    db.speakers.sync_speakers_from_profiles(voices_dir=voices_root)

    # Verify via voices_helpers (API discovery layer)
    dirs_map = voices_helpers._voice_dirs_map()

    # 1. The root voice name should resolve to the Default variant folder
    assert voice_name in dirs_map
    assert dirs_map[voice_name].name == "Default"
    assert dirs_map[voice_name].parent.name == voice_name

    # 2. There should be NO "STALE" profile discovered
    # (If the stale root was picked up, it would either override the name or appear as a duplicate if we weren't careful)
    all_profiles = list(dirs_map.keys())
    assert len(all_profiles) == 1
    assert all_profiles[0] == voice_name

def test_migration_moves_stale_profile(voices_root, monkeypatch):
    from app.domain.voices.migration import migrate_voices_to_v2

    voice_name = "MigrateMe"
    vdir = voices_root / voice_name
    vdir.mkdir()

    # V2 root but NO Default variant yet
    (vdir / "voice.json").write_text(json.dumps({"version": 2, "name": voice_name}))
    (vdir / "profile.json").write_text(json.dumps({"speaker_id": "MIGRATED", "variant_name": "OldRoot"}))
    (vdir / "sample.wav").write_text("audio")
    angry_dir = vdir / "Angry"
    angry_dir.mkdir()
    (angry_dir / "profile.json").write_text(json.dumps({"speaker_id": "ANGRY", "variant_name": "Angry"}))

    from app import config
    monkeypatch.setattr(config, "VOICES_DIR", voices_root)

    # Run migration
    migrate_voices_to_v2()

    # Should have moved to Default
    assert not (vdir / "profile.json").exists()
    assert (vdir / "Default" / "profile.json").exists()
    assert (vdir / "Default" / "sample.wav").exists()
    assert (angry_dir / "profile.json").exists()
    assert not (vdir / "Default" / "Angry").exists()

    meta = json.loads((vdir / "Default" / "profile.json").read_text())
    assert meta["speaker_id"] == "MIGRATED"

def test_migration_quarantines_conflicting_stale_profile(voices_root, monkeypatch):
    from app.domain.voices.migration import migrate_voices_to_v2

    voice_name = "ConflictVoice"
    vdir = voices_root / voice_name
    vdir.mkdir()

    # Both root and Default have profile.json
    (vdir / "voice.json").write_text(json.dumps({"version": 2, "name": voice_name}))
    (vdir / "profile.json").write_text(json.dumps({"speaker_id": "STALE"}))

    default_dir = vdir / "Default"
    default_dir.mkdir()
    (default_dir / "profile.json").write_text(json.dumps({"speaker_id": "VALID"}))

    from app import config
    monkeypatch.setattr(config, "VOICES_DIR", voices_root)

    # Run migration
    migrate_voices_to_v2()

    # Root profile should be gone (quarantined)
    assert not (vdir / "profile.json").exists()
    assert (vdir / ".quarantine").exists()
    assert len(list((vdir / ".quarantine").glob("stale_profile_*.json"))) == 1

    # Default remains valid
    meta = json.loads((default_dir / "profile.json").read_text())
    assert meta["speaker_id"] == "VALID"
