import re
import zipfile
from pathlib import Path

import pytest

from app.domain.demo_bundle import demo_restore_needed, restore_demo_bundle

REPO_ROOT = Path(__file__).resolve().parents[2]


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


@pytest.mark.parametrize("launcher", ["run.sh", "run.ps1"])
def test_launcher_invokes_the_module_at_its_real_import_path(launcher):
    """run.sh/run.ps1 shell out to `python -m app.domain.demo_bundle`; this module lives under
    app/domain/, not app/ directly, so a path drift here breaks demo-library install silently
    (the launcher treats the resulting ModuleNotFoundError as "no restore needed" and continues).
    """
    text = (REPO_ROOT / launcher).read_text()
    assert re.search(r"app\.domain\.demo_bundle", text), (
        f"{launcher} does not reference app.domain.demo_bundle by its real module path"
    )
    assert "app.demo_bundle" not in text.replace("app.domain.demo_bundle", ""), (
        f"{launcher} still references the stale app.demo_bundle module path"
    )
