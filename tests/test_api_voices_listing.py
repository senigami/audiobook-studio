import pytest
import json
import uuid
from unittest.mock import patch

def test_list_speaker_profiles(clean_db, voices_root, client):
    voices_dir = voices_root
    voices_dir.mkdir()
    (voices_dir / "SpeakerA").mkdir()
    (voices_dir / "SpeakerA" / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA", "default_variant": "Default"}))
    (voices_dir / "SpeakerA" / "Default").mkdir()
    (voices_dir / "SpeakerA" / "Default" / "profile.json").write_text(json.dumps({"variant_name": "Default"}))
    (voices_dir / "SpeakerA" / "Default" / "v1.wav").write_text("audio")

    with patch("app.jobs.get_speaker_settings", return_value={"built_samples": [], "speed": 1.0, "test_text": "", "engine": "xtts"}):
        response = client.get("/api/speaker-profiles")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "SpeakerA"
        assert data[0]["engine"] == "xtts"
        assert data[0]["asset_base_url"] == "/out/voices/SpeakerA/Default"


def test_legacy_profile_listing_repairs_missing_speaker_rows_and_preserves_default_switch(clean_db, voices_root, client):
    voices_root.mkdir()
    legacy_speaker_id = str(uuid.uuid4())

    for profile_name, variant_name in [
        ("Dark Fantasy - Default", "Default"),
        ("Dark Fantasy - Light Narrator", "Light Narrator"),
    ]:
        profile_dir = voices_root / profile_name
        profile_dir.mkdir()
        (profile_dir / "profile.json").write_text(json.dumps({
            "speaker_id": legacy_speaker_id,
            "variant_name": variant_name,
            "engine": "xtts",
        }))

    profiles_response = client.get("/api/speaker-profiles")
    assert profiles_response.status_code == 200
    profiles = profiles_response.json()

    # After V2 migration, "Dark Fantasy - Default" is canonicalized to "Dark Fantasy"
    repaired_default = next(p for p in profiles if p["name"] == "Dark Fantasy")
    repaired_variant = next(p for p in profiles if p["name"] == "Dark Fantasy - Light Narrator")
    assert repaired_default["speaker_id"] == legacy_speaker_id
    assert repaired_variant["speaker_id"] == legacy_speaker_id

    speakers_response = client.get("/api/speakers")
    assert speakers_response.status_code == 200
    repaired_speaker = next(s for s in speakers_response.json() if s["id"] == legacy_speaker_id)
    assert repaired_speaker["name"] == "Dark Fantasy"
    assert repaired_speaker["default_profile_name"] == "Dark Fantasy"

    set_default_response = client.post("/api/settings/default-speaker", data={"name": "Dark Fantasy"})
    assert set_default_response.status_code == 200

    refreshed_profiles = client.get("/api/speaker-profiles").json()
    refreshed_default = next(p for p in refreshed_profiles if p["name"] == "Dark Fantasy")
    assert refreshed_default["is_default"] is True
