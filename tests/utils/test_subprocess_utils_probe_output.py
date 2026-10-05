"""ffprobe helpers must not echo raw probe output to the process's stdout/stderr."""

from __future__ import annotations

import logging
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.utils.subprocess_utils import probe_audio_duration, probe_audio_stream_info


def _run_returning(stdout: str, returncode: int):
    return patch(
        "app.utils.subprocess_utils.subprocess.run",
        return_value=SimpleNamespace(stdout=stdout, returncode=returncode),
    )


def test_successful_duration_probe_prints_nothing(capsys):
    with _run_returning("1175.977333\n", 0):
        assert probe_audio_duration(Path("a.wav")) == 1175.977333
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == ""


def test_successful_stream_probe_prints_nothing(capsys):
    with _run_returning("24000\n1\n", 0):
        assert probe_audio_stream_info(Path("a.wav")) == (24000, 1)
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == ""


def test_failed_duration_probe_logs_labeled_output_not_raw_stdout(capsys, caplog):
    with caplog.at_level(logging.DEBUG, logger="app.utils.subprocess_utils"), \
         _run_returning("a.wav: Invalid data found\n", 1):
        assert probe_audio_duration(Path("a.wav")) == 0.0
    assert capsys.readouterr().out == ""
    assert any("ffprobe" in r.getMessage() and "Invalid data found" in r.getMessage() for r in caplog.records)


def test_failed_stream_probe_logs_labeled_output_not_raw_stdout(capsys, caplog):
    with caplog.at_level(logging.DEBUG, logger="app.utils.subprocess_utils"), \
         _run_returning("a.wav: Invalid data found\n", 1):
        assert probe_audio_stream_info(Path("a.wav")) == (0, 0)
    assert capsys.readouterr().out == ""
    assert any("ffprobe" in r.getMessage() and "Invalid data found" in r.getMessage() for r in caplog.records)
