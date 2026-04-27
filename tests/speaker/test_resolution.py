import json
from app.db.speakers import create_speaker

def test_default_variant_resolution(clean_db, voices_root):
    import app.jobs.speaker
    voices_dir = voices_root
    app.jobs.speaker.VOICES_DIR = voices_dir

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
    from app.jobs.speaker import get_speaker_wavs, get_voice_profile_dir
    res = get_speaker_wavs("Old Man")
    assert res is not None
    assert "Old Man" in res and "Angry" in res

    resolved_dir = get_voice_profile_dir("Old Man")
    assert resolved_dir == (voices_dir / "Old Man" / "Angry").resolve()
