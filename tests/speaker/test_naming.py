import json
from app.db.speakers import create_speaker

def test_variant_folder_naming(clean_db, voices_root, client):
    voices_dir = voices_root

    # 1. Create a speaker
    sid = create_speaker("TestSpeaker")

    # 2. Create a variant for it
    response = client.post("/api/speaker-profiles", data={"speaker_id": sid, "variant_name": "Variant1"})
    assert response.status_code == 200
    name = response.json()["name"]

    # MUST use dash convention: "SpeakerName - VariantName"
    assert name == "TestSpeaker - Variant1"
    assert (voices_dir / "TestSpeaker" / "Variant1").exists()

def test_rename_unassigned_profile(clean_db, voices_root, client):
    voices_dir = voices_root

    # 1. Create a profile folder manually (unassigned)
    profile_path = voices_dir / "OldUnassigned"
    profile_path.mkdir()
    (profile_path / "profile.json").write_text(json.dumps({"variant_name": "Old"}))

    # 2. Rename it via the profile-specific endpoint
    response = client.post("/api/speaker-profiles/OldUnassigned/rename", data={"new_name": "NewUnassigned"})
    assert response.status_code == 200

    assert (voices_dir / "NewUnassigned").exists()
    assert (voices_dir / "NewUnassigned" / "profile.json").exists()
    assert not (voices_dir / "OldUnassigned").exists()

def test_add_variant_to_unassigned(clean_db, voices_root, client):
    voices_dir = voices_root

    # 1. Create an unassigned profile base
    (voices_dir / "FreshVoice").mkdir()
    (voices_dir / "FreshVoice" / "profile.json").write_text("{}")

    # 2. Add a variant to it (sending speaker_id="FreshVoice" since it's unassigned)
    response = client.post("/api/speaker-profiles", data={"speaker_id": "FreshVoice", "variant_name": "Variant1"})
    assert response.status_code == 200
    name = response.json()["name"]

    # MUST use dash convention: "FreshVoice - Variant1"
    assert name == "FreshVoice - Variant1"
    assert (voices_dir / "FreshVoice" / "Variant1").exists()

    # Check metadata
    meta = json.loads((voices_dir / "FreshVoice" / "Variant1" / "profile.json").read_text())
    assert meta["speaker_id"] == "FreshVoice"
    assert meta["variant_name"] == "Variant1"

def test_rename_unassigned_profile_payload(clean_db, voices_root, client):
    voices_dir = voices_root

    profile_path = voices_dir / "OldName"
    profile_path.mkdir()
    (profile_path / "profile.json").write_text("{}")

    # Frontend was sending 'name' but backend expects 'new_name'
    response = client.post("/api/speaker-profiles/OldName/rename", data={"new_name": "NewName"})
    assert response.status_code == 200
    assert (voices_dir / "NewName").exists()
    assert (voices_dir / "NewName" / "profile.json").exists()
