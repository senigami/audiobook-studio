import json

from app.db.speakers import get_speaker_settings
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


def test_settings_endpoint_accepts_and_normalizes_tone_and_timbre(clean_db, voices_root, client):
    """tone/timbre moved off voice-level VoiceAttributes to per-variant settings
    (owner-requested, 2026-07-16) -- they use the same TagAutocompleteInput.tsx
    component as performance_tags, so they get the same INV-TAG-1 normalization."""
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_variant(voices_root, "SpeakerA", "Default")

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"tone": ["Warm", "WARM", "gentle  soft"], "timbre": ["Rich", "velvety"]},
    )
    assert response.status_code == 200

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["tone"] == ["warm", "gentle-soft"]
    assert meta["timbre"] == ["rich", "velvety"]


def test_pace_is_a_plain_string_field(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_variant(voices_root, "SpeakerA", "Default")

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"pace": "measured"},
    )
    assert response.status_code == 200

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["pace"] == "measured"


def test_tone_timbre_pace_visible_on_both_read_surfaces(clean_db, voices_root, client):
    """Connection check: get_speaker_settings and list_speaker_profiles must agree,
    same pattern as performance_tags."""
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_variant(voices_root, "SpeakerA", "Default")

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"tone": ["bright"], "timbre": ["deep"], "pace": "brisk"},
    )
    assert response.status_code == 200

    direct = get_speaker_settings("SpeakerA")
    assert direct["tone"] == ["bright"]
    assert direct["timbre"] == ["deep"]
    assert direct["pace"] == "brisk"

    profiles = list_speaker_profiles()
    profile = next(p for p in profiles if p["name"] == "SpeakerA")
    assert profile["tone"] == ["bright"]
    assert profile["timbre"] == ["deep"]
    assert profile["pace"] == "brisk"


def test_tone_timbre_pace_no_cross_variant_contamination(clean_db, voices_root, client):
    """INV-WRITE-1: writing to a compound-name variant must not land on the base
    profile, and vice versa -- same guarantee performance_tags already has."""
    voices_root.mkdir(parents=True, exist_ok=True)
    base_dir = _make_variant(voices_root, "SpeakerA", "Default")
    angry_dir = _make_variant(voices_root, "SpeakerA", "Angry")

    base_response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"tone": ["calm"], "pace": "slow"},
    )
    assert base_response.status_code == 200

    angry_response = client.post(
        "/api/speaker-profiles/SpeakerA%20-%20Angry/settings",
        json={"tone": ["furious"], "pace": "fast"},
    )
    assert angry_response.status_code == 200

    base_meta = json.loads((base_dir / "profile.json").read_text())
    angry_meta = json.loads((angry_dir / "profile.json").read_text())

    assert base_meta["tone"] == ["calm"]
    assert base_meta["pace"] == "slow"
    assert angry_meta["tone"] == ["furious"]
    assert angry_meta["pace"] == "fast"
