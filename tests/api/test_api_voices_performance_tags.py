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


def test_settings_endpoint_accepts_and_normalizes_performance_tags(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_variant(voices_root, "SpeakerA", "Default")

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"performance_tags": ["Sad", "SAD", "slow"]},
    )
    assert response.status_code == 200

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["performance_tags"] == ["sad", "slow"]


def test_performance_tags_whitespace_runs_match_frontend_normalization(clean_db, voices_root, client):
    """INV-TAG-1: a multi-space or tab-separated tag submitted directly to the API
    must normalize to the SAME value TagAutocompleteInput.tsx would produce
    (`replace(/\\s+/g, '-')` collapses runs), not "epic--battle"/"epic\\tbattle"."""
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_variant(voices_root, "SpeakerA", "Default")

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"performance_tags": ["Epic  Battle", "war\tcry"]},
    )
    assert response.status_code == 200

    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["performance_tags"] == ["epic-battle", "war-cry"]


def test_performance_tags_visible_on_both_read_surfaces(clean_db, voices_root, client):
    """Connection 2 check: get_speaker_settings and list_speaker_profiles must agree."""
    voices_root.mkdir(parents=True, exist_ok=True)
    _make_variant(voices_root, "SpeakerA", "Default")

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"performance_tags": ["Bright", "warm"]},
    )
    assert response.status_code == 200

    direct = get_speaker_settings("SpeakerA")
    assert direct["performance_tags"] == ["bright", "warm"]

    profiles = list_speaker_profiles()
    profile = next(p for p in profiles if p["name"] == "SpeakerA")
    assert profile["performance_tags"] == ["bright", "warm"]

    assert direct["performance_tags"] == profile["performance_tags"]


def test_performance_tags_no_cross_variant_contamination(clean_db, voices_root, client):
    """INV-WRITE-1: writing tags to a compound-name variant ("SpeakerA - Angry")
    must not land on the base "SpeakerA" profile, and vice versa."""
    voices_root.mkdir(parents=True, exist_ok=True)
    base_dir = _make_variant(voices_root, "SpeakerA", "Default")
    angry_dir = _make_variant(voices_root, "SpeakerA", "Angry")

    base_response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"performance_tags": ["calm"]},
    )
    assert base_response.status_code == 200

    angry_response = client.post(
        "/api/speaker-profiles/SpeakerA%20-%20Angry/settings",
        json={"performance_tags": ["furious"]},
    )
    assert angry_response.status_code == 200

    base_meta = json.loads((base_dir / "profile.json").read_text())
    angry_meta = json.loads((angry_dir / "profile.json").read_text())

    assert base_meta["performance_tags"] == ["calm"]
    assert angry_meta["performance_tags"] == ["furious"]

    base_settings = get_speaker_settings("SpeakerA")
    angry_settings = get_speaker_settings("SpeakerA - Angry")
    assert base_settings["performance_tags"] == ["calm"]
    assert angry_settings["performance_tags"] == ["furious"]


def test_writing_empty_list_then_new_list_replaces_not_appends(clean_db, voices_root, client):
    voices_root.mkdir(parents=True, exist_ok=True)
    profile_dir = _make_variant(voices_root, "SpeakerA", "Default")

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"performance_tags": ["first", "second"]},
    )
    assert response.status_code == 200
    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["performance_tags"] == ["first", "second"]

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"performance_tags": []},
    )
    assert response.status_code == 200
    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["performance_tags"] == []

    response = client.post(
        "/api/speaker-profiles/SpeakerA/settings",
        json={"performance_tags": ["third"]},
    )
    assert response.status_code == 200
    meta = json.loads((profile_dir / "profile.json").read_text())
    assert meta["performance_tags"] == ["third"]
