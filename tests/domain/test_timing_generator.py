"""Synced-reader Task 3: WAV-header duration measurement + timing sidecar generation.

Fixture WAV files are written with EXACTLY-computed frame counts for their target
durations (stdlib `wave`, fixed framerate) so every expected duration in these tests
comes from the fixture's own construction parameters (frames / framerate * 1000),
never from calling the code under test twice.
"""
import json
import wave
from pathlib import Path

import pytest

from app.domain.chapters.timing import validate_timing_sidecar
from app.domain.chapters.timing_generator import (
    DRIFT_HARD_CEILING_MS,
    DRIFT_WARN_TOLERANCE_MS,
    TimingReconciliationError,
    build_chapter_timing,
    measure_wav_duration_ms,
    write_timing_sidecar,
)

FRAMERATE = 24000


def _write_wav(path: Path, num_frames: int, framerate: int = FRAMERATE) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(b"\x00\x00" * num_frames)


def _frames_for_seconds(seconds: float, framerate: int = FRAMERATE) -> int:
    return round(seconds * framerate)


@pytest.fixture
def three_group_wavs(tmp_path):
    """Three group WAVs of known durations (2.0s, 1.5s, 3.25s) = 6.75s total."""
    durations_s = [2.0, 1.5, 3.25]
    frame_counts = [_frames_for_seconds(s) for s in durations_s]
    paths = []
    for index, frames in enumerate(frame_counts):
        wav_path = tmp_path / f"group_{index}.wav"
        _write_wav(wav_path, frames)
        paths.append(wav_path)
    return paths, frame_counts, durations_s


def _ordered_groups_from_paths(paths):
    return [
        {
            "group_id": f"grp_{index:04d}",
            "wav_path": path,
            "segment_ids": [f"seg_{index:04d}"],
        }
        for index, path in enumerate(paths)
    ]


class TestMeasureWavDurationMs:
    def test_returns_exact_expected_ms_for_known_duration_fixture(self, tmp_path):
        # 2.5s @ 24000Hz = exactly 60000 frames -> 2500ms, hand-computed independently
        # of the function under test.
        wav_path = tmp_path / "known.wav"
        _write_wav(wav_path, num_frames=60000)
        assert measure_wav_duration_ms(wav_path) == 2500

    def test_raises_for_missing_file(self, tmp_path):
        missing = tmp_path / "does_not_exist.wav"
        with pytest.raises(Exception):
            measure_wav_duration_ms(missing)

    def test_raises_for_unreadable_non_wav_file(self, tmp_path):
        bogus = tmp_path / "not_a_wav.wav"
        bogus.write_text("this is not a wav file")
        with pytest.raises(Exception):
            measure_wav_duration_ms(bogus)


class TestBuildChapterTiming:
    def test_three_groups_zero_drift_tile_exactly(self, tmp_path, three_group_wavs):
        paths, frame_counts, durations_s = three_group_wavs
        total_frames = sum(frame_counts)
        chapter_wav = tmp_path / "chapter.wav"
        _write_wav(chapter_wav, num_frames=total_frames)

        ordered_groups = _ordered_groups_from_paths(paths)
        timing = build_chapter_timing(
            chapter_id="ch_abc123",
            chapter_wav_path=chapter_wav,
            ordered_groups=ordered_groups,
            audio_generated_at=1699999999.0,
        )

        assert timing is not None
        assert timing.audio_duration_ms == 6750
        assert timing.group_count == 3
        assert [(g.start_ms, g.end_ms) for g in timing.groups] == [
            (0, 2000),
            (2000, 3500),
            (3500, 6750),
        ]
        assert timing.groups[0].group_id == "grp_0000"
        assert timing.groups[0].segment_ids == ["seg_0000"]
        assert timing.chapter_id == "ch_abc123"
        assert timing.audio_file == "chapter.wav"
        assert timing.audio_generated_at == 1699999999.0

    def test_small_drift_within_warn_tolerance_succeeds_and_logs_warning(
        self, tmp_path, three_group_wavs, caplog
    ):
        paths, frame_counts, durations_s = three_group_wavs
        total_frames = sum(frame_counts)
        # Deliberately offset the chapter WAV by 100ms worth of frames -- in the
        # warn band (strictly above DRIFT_WARN_TOLERANCE_MS=50ms, strictly below
        # DRIFT_HARD_CEILING_MS=250ms) so a warning actually fires, and
        # independently computed from the fixture's own construction parameters.
        drift_ms = 100
        assert DRIFT_WARN_TOLERANCE_MS < drift_ms < DRIFT_HARD_CEILING_MS
        drift_frames = _frames_for_seconds(drift_ms / 1000.0)
        chapter_wav = tmp_path / "chapter.wav"
        _write_wav(chapter_wav, num_frames=total_frames + drift_frames)
        expected_chapter_duration_ms = round((total_frames + drift_frames) / FRAMERATE * 1000)

        ordered_groups = _ordered_groups_from_paths(paths)

        with caplog.at_level("WARNING"):
            timing = build_chapter_timing(
                chapter_id="ch_abc123",
                chapter_wav_path=chapter_wav,
                ordered_groups=ordered_groups,
                audio_generated_at=1699999999.0,
            )

        assert timing is not None
        assert any("drift" in record.message.lower() for record in caplog.records)
        # Last group's end_ms must still be snapped exactly to the (offset) chapter duration.
        assert timing.audio_duration_ms == expected_chapter_duration_ms
        assert timing.groups[-1].end_ms == expected_chapter_duration_ms
        assert timing.groups[-1].duration_ms == (
            timing.groups[-1].end_ms - timing.groups[-1].start_ms
        )

    def test_large_drift_beyond_hard_ceiling_raises(self, tmp_path, three_group_wavs):
        paths, frame_counts, durations_s = three_group_wavs
        total_frames = sum(frame_counts)
        # 300ms of drift -- beyond DRIFT_HARD_CEILING_MS (250ms).
        drift_ms = 300
        assert drift_ms > DRIFT_HARD_CEILING_MS
        drift_frames = _frames_for_seconds(drift_ms / 1000.0)
        chapter_wav = tmp_path / "chapter.wav"
        _write_wav(chapter_wav, num_frames=total_frames + drift_frames)

        ordered_groups = _ordered_groups_from_paths(paths)

        with pytest.raises(TimingReconciliationError):
            build_chapter_timing(
                chapter_id="ch_abc123",
                chapter_wav_path=chapter_wav,
                ordered_groups=ordered_groups,
                audio_generated_at=1699999999.0,
            )

    def test_empty_ordered_groups_returns_none(self, tmp_path):
        chapter_wav = tmp_path / "chapter.wav"
        _write_wav(chapter_wav, num_frames=1000)

        timing = build_chapter_timing(
            chapter_id="ch_abc123",
            chapter_wav_path=chapter_wav,
            ordered_groups=[],
            audio_generated_at=1699999999.0,
        )

        assert timing is None


class TestWriteTimingSidecar:
    def test_writes_valid_json_with_schema_key_and_round_trips(
        self, tmp_path, three_group_wavs
    ):
        paths, frame_counts, durations_s = three_group_wavs
        total_frames = sum(frame_counts)
        chapter_wav = tmp_path / "chapter.wav"
        _write_wav(chapter_wav, num_frames=total_frames)

        ordered_groups = _ordered_groups_from_paths(paths)
        timing = build_chapter_timing(
            chapter_id="ch_abc123",
            chapter_wav_path=chapter_wav,
            ordered_groups=ordered_groups,
            audio_generated_at=1699999999.0,
        )
        assert timing is not None

        sidecar_path = tmp_path / "chapter.timing.json"
        write_timing_sidecar(sidecar_path, timing)

        assert sidecar_path.exists()
        raw_text = sidecar_path.read_text(encoding="utf-8")
        raw = json.loads(raw_text)
        assert "schema" in raw
        assert "schema_" not in raw
        assert raw["schema"] == "chapter_segment_timing"

        round_tripped = validate_timing_sidecar(raw)
        assert round_tripped.chapter_id == "ch_abc123"

        # Atomic write: no lingering temp file after a successful write.
        tmp_sibling = sidecar_path.with_suffix(sidecar_path.suffix + ".tmp")
        assert not tmp_sibling.exists()
