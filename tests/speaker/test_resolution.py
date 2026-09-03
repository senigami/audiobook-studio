import json
from app.db.speakers import create_speaker, get_profile_wavs, get_profile_dir

def test_default_variant_resolution(clean_db, voices_root):
    voices_dir = voices_root

    # 1. Create speaker in DB
    create_speaker("Old Man")

    # 2. Create a variant folder (but don't set it as default in DB)
    variant_path = voices_dir / "Old Man" / "Angry"
    variant_path.parent.mkdir(parents=True, exist_ok=True)
    variant_path.mkdir()
    (variant_path.parent / "voice.json").write_text(json.dumps({"version": 2, "name": "Old Man"}))
    (variant_path / "profile.json").write_text(json.dumps({"variant_name": "Angry"}))
    (variant_path / "sample.wav").write_text("dummy")

    # 3. Resolve "Old Man" (the speaker name)
    # Since "Old Man" has no Default variant, it should pick the only available variant "Angry"
    # because _resolve_existing_profile_name scans nested directories.
    res = get_profile_wavs("Old Man")
    assert res is not None
    assert "Old Man" in res and "Angry" in res

    resolved_dir = get_profile_dir("Old Man")
    assert resolved_dir == (voices_dir / "Old Man" / "Angry").resolve()

def test_v1_flat_storage_is_ignored(clean_db, voices_root):
    voices_dir = voices_root

    # 1. Create a V1 flat storage directory
    v1_path = voices_dir / "Dracula - Angry"
    v1_path.mkdir()
    (v1_path / "profile.json").write_text(json.dumps({"variant_name": "Angry"}))
    (v1_path / "sample.wav").write_text("dummy")

    # 2. Create a V2 nested storage directory
    v2_path = voices_dir / "Dracula" / "Angry"
    v2_path.parent.mkdir()
    (v2_path.parent / "voice.json").write_text(json.dumps({"version": 2, "name": "Dracula"}))
    v2_path.mkdir()
    (v2_path / "profile.json").write_text(json.dumps({"variant_name": "Angry"}))
    (v2_path / "sample.wav").write_text("dummy_v2")

    # 3. Resolve "Dracula - Angry"
    # It MUST resolve to the V2 nested path, NOT the V1 flat path.
    resolved_dir = get_profile_dir("Dracula - Angry")
    assert resolved_dir == v2_path.resolve()

    # Prove V1 path is ignored by checking wav content if we were to read it
    # (In this case, just checking the resolved path is enough)

def test_v1_flat_storage_without_v2_fails_resolution(clean_db, voices_root):
    voices_dir = voices_root

    # Create ONLY a V1 flat storage directory
    v1_path = voices_dir / "Lone - Voice"
    v1_path.mkdir()
    (v1_path / "profile.json").write_text(json.dumps({"variant_name": "Voice"}))
    (v1_path / "sample.wav").write_text("dummy")

    # Attempt to resolve it
    resolved_dir = get_profile_dir("Lone - Voice")

    # It should NOT resolve to the V1 path.
    # Since it's a new name, it might return a NEW profile dir (Lone/Voice)
    # but it won't be the EXISTING V1 path.
    assert resolved_dir != v1_path.resolve()
    assert v1_path.resolve().as_posix() not in resolved_dir.as_posix()
