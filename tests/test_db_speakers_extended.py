import pytest
import os
import shutil
import json
from app.db.speakers import create_speaker, get_speaker, list_speakers, update_speaker, delete_speaker, update_voice_profile_references
from app import config

def test_create_speaker_with_collision():
    # Setup: Create a directory that looks like it belongs to another speaker
    collision_name = "CollisionSpeaker"
    profile_dir = config.VOICES_DIR / collision_name
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({"speaker_id": "other-id"}))

    # Create speaker with same name
    sid = create_speaker(collision_name)
    assert sid is not None

    # It should have created a suffix directory
    suffix_dir = config.VOICES_DIR / f"{collision_name}_1"
    assert suffix_dir.exists()
    assert (suffix_dir / "profile.json").exists()

    # Clean up
    shutil.rmtree(profile_dir)
    shutil.rmtree(suffix_dir)

def test_get_speaker():
    sid = create_speaker("Get Speaker Test")
    speaker = get_speaker(sid)
    assert speaker["name"] == "Get Speaker Test"

    assert get_speaker("non-existent") is None

def test_list_speakers():
    create_speaker("Speaker A")
    create_speaker("Speaker B")
    speakers = list_speakers()
    assert len(speakers) >= 2
    assert any(s["name"] == "Speaker A" for s in speakers)

def test_update_speaker():
    sid = create_speaker("Update Me")
    success = update_speaker(sid, name="Updated Me")
    assert success is True
    assert get_speaker(sid)["name"] == "Updated Me"

    assert update_speaker(sid) is False

def test_delete_speaker():
    sid = create_speaker("Delete Me")
    success = delete_speaker(sid)
    assert success is True
    assert get_speaker(sid) is None

def test_update_voice_profile_references():
    # This involves multiple tables, let's just check it doesn't crash
    update_voice_profile_references("old_profile", "new_profile")
