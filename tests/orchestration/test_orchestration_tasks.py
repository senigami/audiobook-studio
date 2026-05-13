"""Tests for the new Studio 2.0 Task implementations."""

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.orchestration.tasks.assembly import AssemblyTask
from app.orchestration.tasks.bake import BakeTask
from app.orchestration.tasks.export import ExportTask


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


def test_bake_task_validation():
    with pytest.raises(ValueError, match="input_path"):
        BakeTask(
            task_id="t1",
            input_path=None,
            output_path=Path("out.mp3")
        ).validate()


@patch("app.engines.audio_ops.wav_to_mp3")
def test_bake_task_run_mp3(mock_wav_to_mp3, tmp_path):
    mock_wav_to_mp3.return_value = 0
    in_wav = tmp_path / "in.wav"
    in_wav.touch()
    out_mp3 = tmp_path / "out.mp3"

    t = BakeTask(
        task_id="t1",
        input_path=in_wav,
        output_path=out_mp3,
        make_mp3=True
    )

    with patch("pathlib.Path.exists", return_value=True):
        res = t.run()

    assert res.status == "completed"
    mock_wav_to_mp3.assert_called_once()


def test_export_task_validation():
    with pytest.raises(ValueError, match="book_title"):
        ExportTask(
            task_id="t1",
            project_id="proj",
            audio_dir=Path("/tmp"),
            output_file=Path("/tmp/out.m4b"),
            book_title=""
        ).validate()


@patch("app.engines.audiobook_utils.assemble_audiobook")
def test_export_task_run(mock_assemble):
    mock_assemble.return_value = 0
    t = ExportTask(
        task_id="export-1",
        project_id="proj1",
        audio_dir=Path("/tmp/audio"),
        output_file=Path("/tmp/out.m4b"),
        book_title="My Book"
    )

    with patch("pathlib.Path.exists", return_value=True):
        res = t.run()

    assert res.status == "completed"
    mock_assemble.assert_called_once()
