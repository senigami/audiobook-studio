import pytest
import os
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

from app.jobs.speaker import update_speaker_settings, get_speaker_settings
from app import config

@pytest.fixture
def mock_voices_root(tmp_path):
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    with patch("app.jobs.speaker.VOICES_DIR", voices_dir):
        yield voices_dir

def test_update_speaker_settings_traversal_blocked(mock_voices_root):
    # Setup malicious profile name that passes regex but tries to escape via get_voice_profile_dir
    # SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
    # Actually, the regex blocks ../ but maybe something else escapes.
    # The trace shows it flows into _abspath_realpath(os.path.join(base_dir, profile_name))

    # If we have a profile named "valid - ../../evil"
    evil_name = "valid - ../../evil"
    # This might be tricky because of how get_voice_profile_dir works.

    # Let's try a direct attack if possible, or verify that the startswith check blocks it.
    # The point of the check is to prevent any derived path from escaping.

    with patch("app.jobs.speaker._profile_name_or_error", return_value=evil_name):
        # We mock get_voice_profile_dir to return something outside
        outside_dir = mock_voices_root.parent / "evil_voice"
        outside_dir.mkdir(exist_ok=True)
        (outside_dir / "profile.json").write_text("{}")

        with patch("app.jobs.speaker.get_voice_profile_dir", return_value=outside_dir):
            success = update_speaker_settings(evil_name, test_text="pwned")
            assert not success

    # Verify the file was NOT updated
    meta = json.loads((outside_dir / "profile.json").read_text())
    assert "test_text" not in meta

def test_update_speaker_settings_success(mock_voices_root):
    profile_name = "SpeakerA"
    pdir = mock_voices_root / profile_name
    pdir.mkdir()
    (pdir / "profile.json").write_text(json.dumps({"test_text": "old"}))

    success = update_speaker_settings(profile_name, test_text="new")
    assert success

    meta = json.loads((pdir / "profile.json").read_text())
    assert meta["test_text"] == "new"
