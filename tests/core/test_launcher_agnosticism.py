import re
from pathlib import Path


def test_launchers_do_not_reference_root_requirements_xtts():
    """Launcher scripts should not hardcode the root requirements-xtts.txt path."""
    root_dir = Path(__file__).parent.parent.parent
    launcher_files = ["run.sh", "run.ps1"]

    pattern = re.compile(r"requirements-xtts\.txt")

    for filename in launcher_files:
        file_path = root_dir / filename
        if not file_path.exists():
            continue

        content = file_path.read_text()
        # We want to ensure it doesn't reference the root file.
        # It's okay if it references "plugins/tts_xtts/requirements.txt"
        # but "requirements-xtts.txt" as a literal string in these files
        # usually refers to the root file.
        matches = pattern.findall(content)
        assert not matches, f"{filename} still contains references to requirements-xtts.txt: {matches}"


def test_plugin_requirements_owns_full_xtts_dependency_set():
    """The XTTS plugin should own the full set of dependencies required for its environment."""
    root_dir = Path(__file__).parent.parent.parent
    plugin_reqs_path = root_dir / "plugins" / "tts_xtts" / "requirements.txt"

    plugin_content = plugin_reqs_path.read_text()

    # Essential heavy dependencies that must be present
    essentials = [
        "coqui-ai-TTS",
        "coqpit-config",
        "transformers",
        "torch",
        "torchcodec",
        "torchvision",
        "torchaudio",
        "requests",
        "pydantic",
    ]

    for dep in essentials:
        assert dep in plugin_content, f"Essential dependency '{dep}' missing from {plugin_reqs_path.relative_to(root_dir)}"


def test_root_requirements_xtts_is_deleted():
    """The root requirements-xtts.txt file should be deleted after relocation."""
    root_dir = Path(__file__).parent.parent.parent
    root_reqs_path = root_dir / "requirements-xtts.txt"
    assert not root_reqs_path.exists(), "Root requirements-xtts.txt still exists"
