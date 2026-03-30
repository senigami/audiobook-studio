import pytest
import os
from unittest.mock import patch, MagicMock
from pathlib import Path
import time
from app.engines import assemble_audiobook

def test_incremental_assembly_skips_encoding(tmp_path):
    # Setup test environment
    input_folder = tmp_path / "input"
    input_folder.mkdir()

    chapter1 = input_folder / "chapter1.wav"
    chapter1.write_text("audio data 1")

    # Pre-create a cached m4a
    m4a_chapter1 = input_folder / "chapter1.m4a"
    m4a_chapter1.write_text("AAC encoded data 1")

    # Ensure m4a is newer than wav
    old_time = time.time() - 10
    os.utime(chapter1, (old_time, old_time))
    new_time = time.time()
    os.utime(m4a_chapter1, (new_time, new_time))

    output_m4b = tmp_path / "book.m4b"

    with patch('app.engines.run_cmd_stream', return_value=0) as mock_run_cmd, \
         patch('app.engines.get_audio_duration', return_value=123.4):

        on_output = MagicMock()
        def cancel_check(): return False

        rc = assemble_audiobook(
            input_folder=input_folder,
            book_title="Test Book",
            output_m4b=output_m4b,
            on_output=on_output,
            cancel_check=cancel_check,
            chapters=[{"filename": "chapter1.wav", "title": "Chapter 1"}]
        )

        assert rc == 0

        # Check that run_cmd_stream was NOT called for encoding (only for final concat)
        # There should be exactly 1 call for ffmpeg -f concat
        assert mock_run_cmd.call_count == 1
        concat_cmd = mock_run_cmd.call_args_list[0][0][0]
        assert "ffmpeg" in concat_cmd
        assert "-f" in concat_cmd and "concat" in concat_cmd
        assert "-c:a" in concat_cmd and "copy" in concat_cmd
        assert str(output_m4b) in concat_cmd
        assert any(str(arg).endswith(".list.txt") for arg in concat_cmd)

def test_incremental_assembly_performs_encoding_when_missing(tmp_path):
    # Setup test environment
    input_folder = tmp_path / "input"
    input_folder.mkdir()

    chapter1 = input_folder / "chapter1.wav"
    chapter1.write_text("audio data 1")

    output_m4b = tmp_path / "book.m4b"

    with patch('app.engines.run_cmd_stream', return_value=0) as mock_run_cmd, \
         patch('app.engines.get_audio_duration', return_value=123.4):

        on_output = MagicMock()
        def cancel_check(): return False

        rc = assemble_audiobook(
            input_folder=input_folder,
            book_title="Test Book",
            output_m4b=output_m4b,
            on_output=on_output,
            cancel_check=cancel_check,
            chapters=[{"filename": "chapter1.wav", "title": "Chapter 1"}]
        )

        assert rc == 0

        # Should be 2 calls: 1 for encoding chapter1.wav, 1 for concat
        assert mock_run_cmd.call_count == 2

        encode_cmd = mock_run_cmd.call_args_list[0][0][0]
        assert "ffmpeg" in encode_cmd
        assert str(chapter1) in encode_cmd
        assert str(input_folder / "chapter1.m4a") in encode_cmd
        assert "-c:a" in encode_cmd and "aac" in encode_cmd

        concat_cmd = mock_run_cmd.call_args_list[1][0][0]
        assert "-f" in concat_cmd and "concat" in concat_cmd
        assert "-c:a" in concat_cmd and "copy" in concat_cmd

def test_incremental_assembly_performs_encoding_when_outdated(tmp_path):
    # Setup test environment
    input_folder = tmp_path / "input"
    input_folder.mkdir()

    chapter1 = input_folder / "chapter1.wav"
    chapter1.write_text("audio data 1")

    m4a_chapter1 = input_folder / "chapter1.m4a"
    m4a_chapter1.write_text("old AAC data")

    # Ensure wav is NEWER than m4a
    new_time = time.time()
    os.utime(chapter1, (new_time, new_time))
    old_time = time.time() - 10
    os.utime(m4a_chapter1, (old_time, old_time))

    output_m4b = tmp_path / "book.m4b"

    with patch('app.engines.run_cmd_stream', return_value=0) as mock_run_cmd, \
         patch('app.engines.get_audio_duration', return_value=123.4):

        on_output = MagicMock()
        def cancel_check(): return False

        rc = assemble_audiobook(
            input_folder=input_folder,
            book_title="Test Book",
            output_m4b=output_m4b,
            on_output=on_output,
            cancel_check=cancel_check,
            chapters=[{"filename": "chapter1.wav", "title": "Chapter 1"}]
        )

        assert rc == 0

        # Should be 2 calls (encode + concat)
        assert mock_run_cmd.call_count == 2
