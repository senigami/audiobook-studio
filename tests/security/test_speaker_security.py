import pytest
import os
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

from app.db.speakers import update_speaker_settings, get_speaker_settings
from app import config

@pytest.fixture
def mock_voices_root(tmp_path):
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    # app.db.speakers uses config.VOICES_DIR
    with patch("app.config.VOICES_DIR", voices_dir):
        yield voices_dir

def test_update_speaker_settings_traversal_blocked(mock_voices_root):
    # Setup malicious profile name
    evil_name = "valid - ../../evil"

    # We want to verify that update_speaker_settings blocks traversal.
    # In app.db.speakers, it uses _existing_profile_dir which is V2-nested only.

    # If we have a profile that looks like it might escape
    with patch("app.db.speakers._profile_name_or_error", return_value=evil_name):
        outside_dir = mock_voices_root.parent / "evil_voice"
        outside_dir.mkdir(exist_ok=True)
        (outside_dir / "profile.json").write_text("{}")

        # The new implementation uses _existing_profile_dir internally.
        # We want to prove that even if it returns an outside dir, the containment check in normalize_profile_metadata blocks it.
        with patch("app.db.speakers._existing_profile_dir", return_value=outside_dir):
            success = update_speaker_settings(evil_name, test_text="pwned")
            assert not success

    # Verify the file was NOT updated
    meta = json.loads((outside_dir / "profile.json").read_text())
    assert "test_text" not in meta

def test_update_speaker_settings_success(mock_voices_root):
    profile_name = "SpeakerA"
    # Create V2 structure: voices/SpeakerA/Default/profile.json
    pdir = mock_voices_root / profile_name / "Default"
    pdir.mkdir(parents=True)
    (pdir / "profile.json").write_text(json.dumps({"test_text": "old"}))

    success = update_speaker_settings(profile_name, test_text="new")
    assert success

    meta = json.loads((pdir / "profile.json").read_text())
    assert meta["test_text"] == "new"
