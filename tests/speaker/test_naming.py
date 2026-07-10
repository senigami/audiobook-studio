import json
from unittest.mock import patch
from app.db.speakers import create_speaker

def test_variant_folder_naming(clean_db, voices_root, client):
    voices_dir = voices_root

    # 1. Create a speaker
    sid = create_speaker("TestSpeaker")

    # 2. Create a variant for it — engine validation is bypassed so the test
    #    exercises only the naming/folder-creation contract.
    with patch("app.api.routers.voices_management.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles", data={"speaker_id": sid, "variant_name": "Variant1", "engine": "xtts"})
    assert response.status_code == 200, response.text
    name = response.json()["name"]

    # MUST use dash convention: "TestSpeaker - Variant1"
    assert name == "TestSpeaker - Variant1"
    assert (voices_dir / "TestSpeaker" / "Variant1").exists()
    assert (voices_dir / "TestSpeaker" / "voice.json").exists()

def test_rename_unassigned_profile(clean_db, voices_root, client):
    voices_dir = voices_root

    # 1. Create a profile folder manually (unassigned) following V2 structure
    voice_root = voices_dir / "OldUnassigned"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({"version": 2, "name": "OldUnassigned"}))

    profile_path = voice_root / "Default"
    profile_path.mkdir()
    (profile_path / "profile.json").write_text(json.dumps({"variant_name": "Default"}))

    # 2. Rename it via the profile-specific endpoint
    response = client.post("/api/speaker-profiles/OldUnassigned/rename", data={"new_name": "NewUnassigned"})
    assert response.status_code == 200

    assert (voices_dir / "NewUnassigned" / "Default").exists()
    assert (voices_dir / "NewUnassigned" / "voice.json").exists()
    assert not (voices_dir / "OldUnassigned").exists()

def test_add_variant_to_unassigned(clean_db, voices_root, client):
    voices_dir = voices_root

    # 1. Create an unassigned voice root
    voice_root = voices_dir / "FreshVoice"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({"version": 2, "name": "FreshVoice"}))
    (voice_root / "Default").mkdir()
    (voice_root / "Default" / "profile.json").write_text("{}")

    # 2. Add a variant to it — engine validation bypassed; tests folder creation contract.
    with patch("app.api.routers.voices_management.voices_helpers._is_engine_active", return_value=True):
        response = client.post("/api/speaker-profiles", data={"speaker_id": "FreshVoice", "variant_name": "Variant1", "engine": "xtts"})
    assert response.status_code == 200, response.text
    name = response.json()["name"]

    # MUST use dash convention: "FreshVoice - Variant1"
    assert name == "FreshVoice - Variant1"
    assert (voices_dir / "FreshVoice" / "Variant1").exists()

    # Check metadata
    meta = json.loads((voices_dir / "FreshVoice" / "Variant1" / "profile.json").read_text())
    assert meta["speaker_id"] == "FreshVoice"
    assert meta["variant_name"] == "Variant1"

def test_rename_unassigned_profile_rejects_mismatched_name_field(clean_db, voices_root, client):
    """Regression guard for the actual bug this test used to claim to cover
    (but never reproduced): a caller sending payload key 'name' instead of
    the backend's required 'new_name' Form field. FastAPI must reject this
    with 422 (missing required field), and the rename must not happen --
    rather than silently doing nothing (or something unintended) with a 200.
    """
    voices_dir = voices_root

    voice_root = voices_dir / "OldName"
    voice_root.mkdir()
    (voice_root / "voice.json").write_text(json.dumps({"version": 2, "name": "OldName"}))
    (voice_root / "Default").mkdir()
    (voice_root / "Default" / "profile.json").write_text("{}")

    # Mismatched field name: 'name' instead of 'new_name'.
    response = client.post("/api/speaker-profiles/OldName/rename", data={"name": "NewName"})
    assert response.status_code == 422

    # Nothing was renamed.
    assert (voices_dir / "OldName" / "Default").exists()
    assert (voices_dir / "OldName" / "voice.json").exists()
    assert not (voices_dir / "NewName").exists()
