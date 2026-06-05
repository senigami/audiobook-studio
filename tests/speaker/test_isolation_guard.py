import os
from pathlib import Path
from app.core import config

def test_speaker_voices_dir_isolation():
    # Retrieve the default repository path for VOICES_DIR
    # It would be in the current directory / "voices"
    repo_root = Path(__file__).resolve().parents[2]
    real_voices_dir = (repo_root / "voices").resolve()

    current_voices_dir = Path(config.VOICES_DIR).resolve()

    # Assert that config.VOICES_DIR is NOT pointing to the real repository voices/ directory
    assert current_voices_dir != real_voices_dir, f"config.VOICES_DIR is not isolated: {current_voices_dir}"

    # Assert that it is indeed isolated (e.g. inside a temp/pytest directory)
    assert "tmp" in str(current_voices_dir) or "pytest" in str(current_voices_dir), f"config.VOICES_DIR path seems unsafe: {current_voices_dir}"
