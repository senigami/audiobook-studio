import json

from app.domain.voices import variant_versions as vv


def _make_variant_dir(tmp_path, name="Variant"):
    variant_dir = tmp_path / "Voice" / name
    variant_dir.mkdir(parents=True)
    return variant_dir


def test_snapshot_current_as_version_copies_samples_and_artifact(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)
    (variant_dir / "sample1.wav").write_bytes(b"wav-one")
    (variant_dir / "sample2.wav").write_bytes(b"wav-two")
    (variant_dir / "sample.mp3").write_bytes(b"mp3-bytes")

    version_id = vv.snapshot_current_as_version(
        variant_dir, engine_id="xtts", test_text="hello world"
    )

    version_dir = variant_dir / "versions" / version_id
    samples_dir = version_dir / "samples"
    assert (samples_dir / "sample1.wav").read_bytes() == b"wav-one"
    assert (samples_dir / "sample2.wav").read_bytes() == b"wav-two"
    assert (version_dir / "artifact.mp3").read_bytes() == b"mp3-bytes"

    meta = json.loads((version_dir / "meta.json").read_text())
    assert meta["engine_id"] == "xtts"
    assert meta["test_text"] == "hello world"
    assert meta["backfilled"] is True
    assert {entry["filename"] for entry in meta["sample_manifest"]} == {"sample1.wav", "sample2.wav"}

    # snapshot must not set active_version_id
    assert vv.get_active_version_id(variant_dir) is None


def test_second_snapshot_is_not_backfilled(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)
    (variant_dir / "sample1.wav").write_bytes(b"wav-one")

    vv.snapshot_current_as_version(variant_dir, engine_id="xtts", test_text="first")
    second_id = vv.snapshot_current_as_version(variant_dir, engine_id="xtts", test_text="second")

    version = vv.get_version(variant_dir, second_id)
    assert version["backfilled"] is False


def test_record_new_version_sets_active_but_snapshot_does_not(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)
    (variant_dir / "sample1.wav").write_bytes(b"wav-one")

    outgoing_id = vv.snapshot_current_as_version(variant_dir, engine_id="xtts", test_text="outgoing")
    assert vv.get_active_version_id(variant_dir) is None

    new_id = vv.record_new_version(variant_dir, engine_id="xtts", test_text="new")
    assert vv.get_active_version_id(variant_dir) == new_id
    assert new_id != outgoing_id


def test_list_versions_oldest_first_with_summary_fields_only(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)
    (variant_dir / "sample1.wav").write_bytes(b"wav-one")

    first_id = vv.snapshot_current_as_version(
        variant_dir, engine_id="xtts", test_text="first", voice_job_settings={"model": "m1"}
    )
    second_id = vv.snapshot_current_as_version(
        variant_dir, engine_id="xtts", test_text="second", voice_job_settings={"model": "m2"}
    )

    versions = vv.list_versions(variant_dir)
    assert [v["id"] for v in versions] == [first_id, second_id]
    for entry in versions:
        assert "sample_manifest" not in entry
        assert "voice_job_settings" not in entry
        assert set(entry.keys()) == {
            "id",
            "created_at",
            "backfilled",
            "engine_id",
            "model",
            "test_text",
            "sample_count",
            "has_artifact",
        }
    assert versions[0]["sample_count"] == 1
    assert versions[0]["has_artifact"] is False


def test_get_version_unknown_returns_none(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)
    assert vv.get_version(variant_dir, "v-nonexistent") is None

    (variant_dir / "sample1.wav").write_bytes(b"wav-one")
    version_id = vv.snapshot_current_as_version(variant_dir, engine_id="xtts", test_text="hi")
    version = vv.get_version(variant_dir, version_id)
    assert version["id"] == version_id
    assert version["engine_id"] == "xtts"
    assert version["test_text"] == "hi"


def test_promote_version_restores_samples_and_artifact(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)
    (variant_dir / "old_sample.wav").write_bytes(b"old-wav")
    (variant_dir / "sample.mp3").write_bytes(b"old-mp3")

    old_version_id = vv.snapshot_current_as_version(variant_dir, engine_id="xtts", test_text="old")

    # Simulate a rebuild: live state changes.
    (variant_dir / "old_sample.wav").unlink()
    (variant_dir / "new_sample.wav").write_bytes(b"new-wav")
    (variant_dir / "sample.mp3").write_bytes(b"new-mp3")
    new_version_id = vv.record_new_version(variant_dir, engine_id="xtts", test_text="new")

    assert vv.get_active_version_id(variant_dir) == new_version_id

    result = vv.promote_version(variant_dir, old_version_id)
    assert result is True

    wav_files = sorted(p.name for p in variant_dir.glob("*.wav"))
    assert wav_files == ["old_sample.wav"]
    assert (variant_dir / "old_sample.wav").read_bytes() == b"old-wav"
    assert (variant_dir / "sample.mp3").read_bytes() == b"old-mp3"
    assert vv.get_active_version_id(variant_dir) == old_version_id


def test_promote_unknown_version_is_noop(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)
    (variant_dir / "sample1.wav").write_bytes(b"wav-one")
    version_id = vv.record_new_version(variant_dir, engine_id="xtts", test_text="v1")

    result = vv.promote_version(variant_dir, "v-does-not-exist")
    assert result is False
    assert (variant_dir / "sample1.wav").read_bytes() == b"wav-one"
    assert vv.get_active_version_id(variant_dir) == version_id


def test_versions_dir_not_listed_as_sibling_variant(tmp_path, monkeypatch):
    from app.core import config
    from app.api.routers import voices_helpers

    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    monkeypatch.setattr(config, "VOICES_DIR", voices_dir)
    monkeypatch.setattr(voices_helpers, "VOICES_DIR", voices_dir)

    voice_dir = voices_dir / "Voice"
    voice_dir.mkdir()
    (voice_dir / "voice.json").write_text("{}")

    variant_dir = voice_dir / "Variant"
    variant_dir.mkdir()
    (variant_dir / "profile.json").write_text("{}")
    (variant_dir / "sample1.wav").write_bytes(b"wav-one")

    vv.record_new_version(variant_dir, engine_id="xtts", test_text="hi")

    dirs_map = voices_helpers._voice_dirs_map()
    assert "versions" not in dirs_map
    assert "Voice - versions" not in dirs_map
    assert set(dirs_map.keys()) == {"Voice - Variant"}


def test_snapshot_with_no_samples_succeeds(tmp_path):
    variant_dir = _make_variant_dir(tmp_path)

    version_id = vv.snapshot_current_as_version(variant_dir, engine_id="xtts", test_text="empty")

    version = vv.get_version(variant_dir, version_id)
    assert version["sample_manifest"] == []
    samples_dir = variant_dir / "versions" / version_id / "samples"
    assert samples_dir.is_dir()
    assert list(samples_dir.iterdir()) == []
