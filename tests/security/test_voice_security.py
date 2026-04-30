import pytest
import os
from pathlib import Path
from unittest.mock import patch
from app.config import get_voice_storage_version, canonical_voice_name

@pytest.fixture
def mock_voices_root(tmp_path):
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()
    with patch("app.config.VOICES_DIR", voices_dir):
        yield voices_dir

def test_canonical_voice_name_validation():
    # Valid
    assert canonical_voice_name("Dracula") == "Dracula"
    assert canonical_voice_name("Dracula - Angry") == "Dracula - Angry"
    assert canonical_voice_name("Voice_1.2") == "Voice_1.2"

    # Invalid
    with pytest.raises(ValueError):
        canonical_voice_name("../evil")
    with pytest.raises(ValueError):
        canonical_voice_name("voice/../../../etc/passwd")
    with pytest.raises(ValueError):
        canonical_voice_name("   ")

def test_get_voice_storage_version_traversal_blocked(mock_voices_root):
    voices_dir = mock_voices_root

    # Create a legitimate voice with a manifest
    voice_v2 = voices_dir / "V2_Voice"
    voice_v2.mkdir()
    (voice_v2 / "voice.json").write_text('{"version": 2}')

    # Verify it works
    assert get_voice_storage_version("V2_Voice") == 2

    # Try traversal
    assert get_voice_storage_version("../evil") == 1
    assert get_voice_storage_version("V2_Voice/../../something") == 1
