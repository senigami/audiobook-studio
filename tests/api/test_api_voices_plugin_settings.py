import pytest
import json
from unittest.mock import patch

def test_list_speaker_profiles_includes_generic_settings(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True)
    (profile_root / "voice.json").write_text(json.dumps({
        "version": 2,
        "name": "SpeakerA",
        "default_variant": "Default",
    }))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True)

    # Store plugin-specific setting (temperature) in profile.json
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "xtts",
        "temperature": 0.85
    }))
    (profile_dir / "v1.wav").write_text("audio")

    response = client.get("/api/speaker-profiles")
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 1
    # New 'settings' field should exist and contain the plugin setting
    assert "settings" in data[0]
    assert data[0]["settings"]["temperature"] == 0.85
    # Should still have the flattened speed (default 1.0)
    assert data[0]["speed"] == 1.0

def test_update_speaker_settings_validates_keys(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True)
    (profile_dir / "profile.json").write_text(json.dumps({"variant_name": "Default", "engine": "xtts"}))

    # 1. Update allowed key (temperature)
    response = client.post("/api/speaker-profiles/SpeakerA/settings", json={
        "temperature": 0.9,
        "speed": 1.1
    })
    assert response.status_code == 200
    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["temperature"] == 0.9
    assert meta["speed"] == 1.1

    # 2. Update invalid key (should be rejected)
    response = client.post("/api/speaker-profiles/SpeakerA/settings", json={
        "malicious_key": "some_value"
    })
    assert response.status_code == 400
    assert "not allowed" in response.json()["message"].lower()

    # 3. Verify malicious_key was NOT saved
    meta = json.loads((profile_dir / "profile.json").read_text())
    assert "malicious_key" not in meta


def test_update_speaker_settings_allows_profile_metadata_and_requested_engine(clean_db, voices_root, client):
    voices_root.mkdir()
    profile_root = voices_root / "SpeakerA"
    profile_root.mkdir(parents=True)
    (profile_root / "voice.json").write_text(json.dumps({"version": 2, "name": "SpeakerA"}))
    profile_dir = profile_root / "Default"
    profile_dir.mkdir(parents=True)
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": "Default",
        "engine": "xtts"
    }))

    response = client.post("/api/speaker-profiles/SpeakerA/settings", json={
        "engine": "voxtral",
        "test_text": "Voice draft",
        "model": "voxtral-1",
    })

    assert response.status_code == 200

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["engine"] == "voxtral"
    assert meta["test_text"] == "Voice draft"
    assert meta["model"] == "voxtral-1"
