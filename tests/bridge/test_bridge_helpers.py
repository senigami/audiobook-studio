from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from app.jobs.handlers.bridge_helpers import generate_via_bridge

def test_generate_via_bridge_propagates_task_id():
    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"audio_path": "/tmp/out.wav"}

    with patch("app.jobs.handlers.bridge_helpers.create_voice_bridge", return_value=mock_bridge), \
         patch("shutil.move"):

        generate_via_bridge(
            engine="xtts",
            text="Hello",
            out_wav=Path("/tmp/out.wav"),
            task_id="my-test-task-id",
        )

        # Verify that synthesize was called with the task_id in the request payload
        mock_bridge.synthesize.assert_called_once()
        called_args = mock_bridge.synthesize.call_args[0][0]
        assert "task_id" in called_args, "task_id should be in the request payload"
        assert called_args["task_id"] == "my-test-task-id"


def _bridge_request(mock_bridge):
    mock_bridge.synthesize.assert_called_once()
    return mock_bridge.synthesize.call_args[0][0]


def test_generate_via_bridge_derives_voice_profile_dir_from_profile_name(tmp_path):
    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"audio_path": "/tmp/out.wav"}
    profile_dir = tmp_path / "voices" / "Test"

    with patch("app.jobs.handlers.bridge_helpers.create_voice_bridge", return_value=mock_bridge), \
         patch("app.db.speakers.get_profile_dir", return_value=profile_dir), \
         patch("shutil.move"):
        generate_via_bridge(
            engine="voxtral",
            text="Hello",
            out_wav=Path("/tmp/out.wav"),
            profile_name="Test",
        )

    request = _bridge_request(mock_bridge)
    assert request.get("voice_profile_dir") == str(profile_dir)


def test_generate_via_bridge_explicit_voice_profile_dir_wins(tmp_path):
    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"audio_path": "/tmp/out.wav"}
    explicit_dir = tmp_path / "voices" / "Explicit"

    with patch("app.jobs.handlers.bridge_helpers.create_voice_bridge", return_value=mock_bridge), \
         patch("app.db.speakers.get_profile_dir", return_value=tmp_path / "voices" / "Derived"), \
         patch("shutil.move"):
        generate_via_bridge(
            engine="voxtral",
            text="Hello",
            out_wav=Path("/tmp/out.wav"),
            profile_name="Test",
            voice_profile_dir=explicit_dir,
        )

    request = _bridge_request(mock_bridge)
    assert request.get("voice_profile_dir") == str(explicit_dir)


def test_generate_via_bridge_unresolvable_profile_omits_dir():
    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"audio_path": "/tmp/out.wav"}

    with patch("app.jobs.handlers.bridge_helpers.create_voice_bridge", return_value=mock_bridge), \
         patch("app.db.speakers.get_profile_dir", side_effect=ValueError("bad profile")), \
         patch("shutil.move"):
        generate_via_bridge(
            engine="voxtral",
            text="Hello",
            out_wav=Path("/tmp/out.wav"),
            profile_name="Test",
        )

    request = _bridge_request(mock_bridge)
    assert "voice_profile_dir" not in request


def test_generate_via_bridge_post_success_bookkeeping_cannot_fail_the_job():
    # Audit task 003: once synthesis succeeded, a raise while persisting
    # synthesis_duration_seconds must not surface as a synthesis failure.
    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"audio_path": "/tmp/out.wav", "duration_sec": 2.5}

    with patch("app.jobs.handlers.bridge_helpers.create_voice_bridge", return_value=mock_bridge), \
         patch("app.db.state.update_job", side_effect=RuntimeError("state store unavailable")), \
         patch("shutil.move"):
        rc = generate_via_bridge(
            engine="xtts",
            text="Hello",
            out_wav=Path("/tmp/out.wav"),
            task_id="job-1",
        )

    assert rc == 0
