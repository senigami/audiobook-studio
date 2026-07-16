"""Tests for the new Studio 2.0 Task implementations."""

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.orchestration.tasks.assembly import AssemblyTask


def test_assembly_task_validation():
    with pytest.raises(ValueError, match="output_path"):
        AssemblyTask(
            task_id="t1",
            segment_paths=[Path("a.wav")],
            output_path=None
        ).validate()


@patch("app.engines.audio_ops.stitch_segments")
def test_assembly_task_run(mock_stitch):
    mock_stitch.return_value = 0
    t = AssemblyTask(
        task_id="t1",
        segment_paths=[Path("a.wav")],
        output_path=Path("out.wav")
    )

    with patch("pathlib.Path.exists", return_value=True):
        res = t.run()

    assert res.status == "completed"
    mock_stitch.assert_called_once()
    assert mock_stitch.call_args[1]["output_path"] == Path("out.wav")
