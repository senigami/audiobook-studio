import json

from app.api.routers.voices_huggingface import _resolve_publish_variant
from app.api.routers.voices_management import list_speaker_profiles


def _make_variant(voices_root, speaker_name, variant_name, engine="xtts"):
    profile_root = voices_root / speaker_name
    profile_root.mkdir(parents=True, exist_ok=True)
    voice_json = profile_root / "voice.json"
    if not voice_json.exists():
        voice_json.write_text(json.dumps({"version": 2, "name": speaker_name}))
    profile_dir = profile_root / variant_name
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "profile.json").write_text(json.dumps({
        "variant_name": variant_name,
        "engine": engine,
    }))
    return profile_dir


def test_set_default_variant_updates_state_and_read_surface(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_variant(voices_root, "SpeakerA", "Default")
    _make_variant(voices_root, "SpeakerA", "Angry")

    response = client.post("/api/speaker-profiles/SpeakerA/variants/Angry/set-default")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "default_variant": "Angry"}

    state_path = voices_root / "SpeakerA" / "state.json"
    assert json.loads(state_path.read_text())["default_variant"] == "Angry"

    profiles = list_speaker_profiles()
    angry = next(p for p in profiles if p["name"] == "SpeakerA - Angry")
    default = next(p for p in profiles if p["name"] == "SpeakerA")
    assert angry["is_variant_default"] is True
    assert default["is_variant_default"] is False


def test_set_default_variant_is_mutually_exclusive(clean_db, voices_root, client):
    """INV-DEFAULT-2: setting a new default clears any prior default for the
    same character — exactly one variant is ever the default."""
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_variant(voices_root, "SpeakerA", "Default")
    _make_variant(voices_root, "SpeakerA", "Angry")
    _make_variant(voices_root, "SpeakerA", "Calm")

    resp1 = client.post("/api/speaker-profiles/SpeakerA/variants/Angry/set-default")
    assert resp1.status_code == 200

    profiles = list_speaker_profiles()
    speaker_a_profiles = [p for p in profiles if p["name"].startswith("SpeakerA")]
    assert sum(1 for p in speaker_a_profiles if p["is_variant_default"]) == 1

    resp2 = client.post("/api/speaker-profiles/SpeakerA/variants/Calm/set-default")
    assert resp2.status_code == 200

    profiles = list_speaker_profiles()
    speaker_a_profiles = [p for p in profiles if p["name"].startswith("SpeakerA")]
    defaults = [p for p in speaker_a_profiles if p["is_variant_default"]]
    assert len(defaults) == 1
    assert defaults[0]["name"] == "SpeakerA - Calm"


def test_set_default_variant_nonexistent_variant_404_no_state_change(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_variant(voices_root, "SpeakerA", "Default")
    _make_variant(voices_root, "SpeakerA", "Angry")

    # Establish a known-good default first.
    setup_response = client.post("/api/speaker-profiles/SpeakerA/variants/Angry/set-default")
    assert setup_response.status_code == 200

    response = client.post("/api/speaker-profiles/SpeakerA/variants/DoesNotExist/set-default")
    assert response.status_code == 404

    state_path = voices_root / "SpeakerA" / "state.json"
    assert json.loads(state_path.read_text())["default_variant"] == "Angry"

    profiles = list_speaker_profiles()
    angry = next(p for p in profiles if p["name"] == "SpeakerA - Angry")
    assert angry["is_variant_default"] is True


def test_set_default_variant_agrees_with_export_path_resolution(clean_db, voices_root, client):
    """Confirms the new write endpoint and `_resolve_publish_variant` (the
    HF-export read path) agree on the same fallback chain (Connection 3)."""
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_variant(voices_root, "SpeakerA", "Default")
    _make_variant(voices_root, "SpeakerA", "Angry")

    response = client.post("/api/speaker-profiles/SpeakerA/variants/Angry/set-default")
    assert response.status_code == 200

    resolved = _resolve_publish_variant(voices_root / "SpeakerA")
    assert resolved is not None
    assert resolved.name == "Angry"


def test_set_default_variant_rejects_compound_name_cross_contamination(clean_db, voices_root, client):
    """INV-WRITE-1: setting the default via a compound-name URL segment must
    resolve to the correct character root, never a sibling's."""
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_variant(voices_root, "SpeakerA", "Default")
    _make_variant(voices_root, "SpeakerA", "Angry")
    _make_variant(voices_root, "SpeakerB", "Default")

    response = client.post("/api/speaker-profiles/SpeakerA%20-%20Angry/variants/Angry/set-default")
    assert response.status_code == 200

    a_state = voices_root / "SpeakerA" / "state.json"
    assert json.loads(a_state.read_text())["default_variant"] == "Angry"

    b_state = voices_root / "SpeakerB" / "state.json"
    assert not b_state.exists()
