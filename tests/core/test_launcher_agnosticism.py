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


def test_launchers_do_not_contain_inline_xtts_conflict_logic():
    """Launcher scripts should not contain hardcoded XTTS conflict detection logic inline."""
    root_dir = Path(__file__).parent.parent.parent

    # Check run.sh
    run_sh = root_dir / "run.sh"
    if run_sh.exists():
        content = run_sh.read_text()
        assert "xtts_env_has_conflicts" not in content, "run.sh still contains xtts_env_has_conflicts function"
        assert "coqpit" not in content, "run.sh still contains inline 'coqpit' conflict check"

    # Check run.ps1
    run_ps1 = root_dir / "run.ps1"
    if run_ps1.exists():
        content = run_ps1.read_text()
        # Look for the stale XTTS environment reset logic
        # if ($Label -eq "XTTS" -and (Test-Path $EnvDir) -and -not (Test-VenvPythonHealthy $EnvDir))
        # We want this to be generalized or moved.
        assert '$Label -eq "XTTS"' not in content, "run.ps1 still contains hardcoded XTTS-specific environment reset branch"

def test_xtts_env_dir_compatibility():
    """Launchers should still support XTTS_ENV_DIR for backwards compatibility."""
    root_dir = Path(__file__).parent.parent.parent

    run_sh = root_dir / "run.sh"
    if run_sh.exists():
        content = run_sh.read_text()
        assert "XTTS_ENV_DIR" in content, "run.sh should still mention XTTS_ENV_DIR for compatibility"

    run_ps1 = root_dir / "run.ps1"
    if run_ps1.exists():
        content = run_ps1.read_text()
        assert "XTTS_ENV_DIR" in content, "run.ps1 should still mention XTTS_ENV_DIR for compatibility"
