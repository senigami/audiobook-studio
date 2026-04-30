"""Tests for the new Studio 2.0 Task implementations."""

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.orchestration.tasks.assembly import AssemblyTask
from app.orchestration.tasks.bake import BakeTask
from app.orchestration.tasks.export import ExportTask
from app.orchestration.tasks.mixed_synthesis import MixedSynthesisTask


def test_assembly_task_validation():
    with pytest.raises(ValueError, match="output_path"):
        AssemblyTask(
            task_id="t1",
            segment_paths=[Path("a.wav")],
            output_path=None
        ).validate()


@patch("app.engines.stitch_segments")
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


@patch("app.engines.wav_to_mp3")
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


@patch("app.engines.assemble_audiobook")
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


def test_mixed_synthesis_task_validation():
    with pytest.raises(ValueError, match="segments list cannot be empty"):
        MixedSynthesisTask(
            task_id="t1",
            chapter_id="c1",
            segments=[]
        ).validate()

    with pytest.raises(ValueError, match="Segment 0 missing engine_id"):
        MixedSynthesisTask(
            task_id="t1",
            chapter_id="c1",
            segments=[{"script_text": "hello", "output_path": "a.wav"}]
        ).validate()


@patch("app.engines.bridge.create_voice_bridge")
def test_mixed_synthesis_task_run(mock_create_bridge):
    mock_bridge = MagicMock()
    mock_bridge.synthesize.return_value = {"status": "ok"}
    mock_create_bridge.return_value = mock_bridge

    t = MixedSynthesisTask(
        task_id="t1",
        chapter_id="c1",
        segments=[
            {"engine_id": "xtts", "script_text": "One", "output_path": "1.wav"},
            {"engine_id": "voxtral", "script_text": "Two", "output_path": "2.wav"}
        ]
    )
    res = t.run()

    assert res.status == "completed"
    assert mock_bridge.synthesize.call_count == 2

    first_call = mock_bridge.synthesize.call_args_list[0][0][0]
    assert first_call["engine_id"] == "xtts"

    second_call = mock_bridge.synthesize.call_args_list[1][0][0]
    assert second_call["engine_id"] == "voxtral"
