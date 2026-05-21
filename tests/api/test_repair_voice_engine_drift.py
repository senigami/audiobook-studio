import json
import sys
from pathlib import Path
from unittest.mock import patch
import pytest

from scripts.repair_voice_engine_drift import main


def test_repair_voice_engine_drift_dry_run(tmp_path, capsys):
    # 1. Create a temporary state.json
    state_file = tmp_path / "state.json"
    state_data = {
        "settings": {
            "default_engine": "voxtral",
            "safe_mode": True
        }
    }
    with open(state_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(state_data, indent=2) + "\n")

    # 2. Create a temporary voices dir with profile.json files
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()

    profile1_dir = voices_dir / "Dark Fantasy" / "Light Narrator"
    profile1_dir.mkdir(parents=True)
    profile1_data = {
        "variant_name": "Light Narrator",
        "engine": "voxtral",
        "speaker_id": "123"
    }
    profile1_file = profile1_dir / "profile.json"
    with open(profile1_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(profile1_data, indent=2) + "\n")

    profile2_dir = voices_dir / "Dracula" / "Angry"
    profile2_dir.mkdir(parents=True)
    profile2_data = {
        "variant_name": "Angry",
        "engine": "xtts",
        "speaker_id": "456"
    }
    profile2_file = profile2_dir / "profile.json"
    with open(profile2_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(profile2_data, indent=2) + "\n")

    # Call main with sys.argv mocked for dry-run
    test_args = [
        "repair_voice_engine_drift.py",
        "--state-file", str(state_file),
        "--voices-dir", str(voices_dir),
        "--engine", "xtts",
        "--source-engine", "voxtral"
    ]
    with patch.object(sys, "argv", test_args):
        main()

    # Capture stdout
    captured = capsys.readouterr()
    assert "DRY RUN MODE" in captured.out
    assert "Proposed:" in captured.out
    assert "Total files proposed/modified: 2" in captured.out

    # Verify no changes were made to files
    with open(state_file, "r", encoding="utf-8") as f:
        assert json.load(f)["settings"]["default_engine"] == "voxtral"

    with open(profile1_file, "r", encoding="utf-8") as f:
        assert json.load(f)["engine"] == "voxtral"


def test_repair_voice_engine_drift_apply(tmp_path, capsys):
    # 1. Create a temporary state.json
    state_file = tmp_path / "state.json"
    state_data = {
        "settings": {
            "default_engine": "voxtral",
            "safe_mode": True
        }
    }
    with open(state_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(state_data, indent=2) + "\n")

    # 2. Create a temporary voices dir with profile.json files
    voices_dir = tmp_path / "voices"
    voices_dir.mkdir()

    profile1_dir = voices_dir / "Dark Fantasy" / "Light Narrator"
    profile1_dir.mkdir(parents=True)
    profile1_data = {
        "variant_name": "Light Narrator",
        "engine": "voxtral",
        "speaker_id": "123"
    }
    profile1_file = profile1_dir / "profile.json"
    with open(profile1_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(profile1_data, indent=2) + "\n")

    # Call main with sys.argv mocked for apply mode
    test_args = [
        "repair_voice_engine_drift.py",
        "--state-file", str(state_file),
        "--voices-dir", str(voices_dir),
        "--engine", "xtts",
        "--source-engine", "voxtral",
        "--apply"
    ]
    with patch.object(sys, "argv", test_args):
        main()

    # Capture stdout
    captured = capsys.readouterr()
    assert "APPLY MODE" in captured.out
    assert "--> Done." in captured.out
    assert "Total files proposed/modified: 2" in captured.out

    # Verify changes were successfully written to files
    with open(state_file, "r", encoding="utf-8") as f:
        res_state = json.load(f)
        assert res_state["settings"]["default_engine"] == "xtts"

    # Check that file ends with a single newline (git diff check compliance)
    with open(state_file, "r", encoding="utf-8") as f:
        content = f.read()
        assert content.endswith("\n")
        assert not content.endswith("\n\n")

    with open(profile1_file, "r", encoding="utf-8") as f:
        res_profile = json.load(f)
        assert res_profile["engine"] == "xtts"

    # Check that file ends with a single newline
    with open(profile1_file, "r", encoding="utf-8") as f:
        content = f.read()
        assert content.endswith("\n")
        assert not content.endswith("\n\n")
