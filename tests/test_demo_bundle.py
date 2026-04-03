import zipfile

import pytest

from app.demo_bundle import demo_restore_needed, restore_demo_bundle


def test_demo_restore_needed_only_when_library_is_empty(tmp_path):
    assert demo_restore_needed(tmp_path)

    (tmp_path / "audiobook_studio.db").write_bytes(b"sqlite bootstrap")
    assert demo_restore_needed(tmp_path)

    (tmp_path / "projects").mkdir()
    assert demo_restore_needed(tmp_path)

    (tmp_path / "projects" / "example").mkdir()
    assert not demo_restore_needed(tmp_path)


def test_restore_demo_bundle_extracts_supported_entries(tmp_path):
    bundle = tmp_path / "demo.zip"
    with zipfile.ZipFile(bundle, "w") as archive:
        archive.writestr("audiobook_studio.db", b"db")
        archive.writestr("projects/demo/text/ch1.txt", b"chapter")
        archive.writestr("voices/demo/profile.json", b"{}")

    target = tmp_path / "install"
    extracted = restore_demo_bundle(target, bundle)

    assert target.joinpath("audiobook_studio.db").read_bytes() == b"db"
    assert target.joinpath("projects/demo/text/ch1.txt").read_bytes() == b"chapter"
    assert target.joinpath("voices/demo/profile.json").read_bytes() == b"{}"
    assert len(extracted) == 3


def test_restore_demo_bundle_rejects_unexpected_entries(tmp_path):
    bundle = tmp_path / "demo.zip"
    with zipfile.ZipFile(bundle, "w") as archive:
        archive.writestr("uploads/covers/cover.png", b"bad")

    with pytest.raises(ValueError, match="Unsupported demo bundle entry"):
        restore_demo_bundle(tmp_path / "install", bundle)
