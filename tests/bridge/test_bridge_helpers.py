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
