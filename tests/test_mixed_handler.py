import time
import os
import importlib
from pathlib import Path
from unittest.mock import patch

import pytest

from app.models import Job
from app.jobs.handlers.mixed import handle_mixed_job


@pytest.fixture
def clean_db(tmp_path):
    db_path = tmp_path / "test_mixed.db"
    os.environ["DB_PATH"] = str(db_path)
    import app.db.core
    importlib.reload(app.db.core)
    app.db.core.init_db()
    yield


def test_handle_mixed_job_renders_and_stitches(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="XTTS Voice")
    update_segment(segs[1]["id"], speaker_profile_name="Voxtral Voice")

    job = Job(
        id="mixed-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    output_wav = audio_dir / f"{cid}_0.wav"

    def fake_xtts_generate(*args, **kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    def fake_voxtral_generate(*args, **kwargs):
        Path(kwargs["out_wav"]).write_text("voxtral")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with patch("app.jobs.handlers.mixed.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.jobs.handlers.mixed.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("app.jobs.handlers.mixed.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("app.jobs.handlers.mixed.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.handlers.mixed.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("app.jobs.handlers.mixed.xtts_generate", side_effect=fake_xtts_generate), \
         patch("app.jobs.handlers.mixed.voxtral_generate", side_effect=fake_voxtral_generate), \
         patch("app.jobs.handlers.mixed.stitch_segments", side_effect=fake_stitch), \
         patch("app.jobs.handlers.mixed.update_job"):
        result = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)
        refreshed = get_chapter_segments(cid)
    assert result == "done"
    assert output_wav.exists()
    assert all(segment["audio_status"] == "done" for segment in refreshed)
    assert refreshed[0]["audio_file_path"] == f"chunk_{refreshed[0]['id']}.wav"
    assert refreshed[1]["audio_file_path"] == f"chunk_{refreshed[1]['id']}.wav"


def test_handle_mixed_job_groups_adjacent_segments_into_one_chunk(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world. Goodbye world.")
    sync_chapter_segments(cid, "Hello world. Goodbye world.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="XTTS Voice")
    update_segment(segs[1]["id"], speaker_profile_name="XTTS Voice")

    job = Job(
        id="mixed-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
        segment_ids=[segs[0]["id"], segs[1]["id"]],
    )

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()

    def fake_xtts_generate(*args, **kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    with patch("app.jobs.handlers.mixed.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.jobs.handlers.mixed.resolve_profile_engine", return_value="xtts"), \
         patch("app.jobs.handlers.mixed.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("app.jobs.handlers.mixed.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.handlers.mixed.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("app.jobs.handlers.mixed.xtts_generate", side_effect=fake_xtts_generate) as mock_xtts, \
         patch("app.jobs.handlers.mixed.update_job"):
        result = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)
        refreshed = get_chapter_segments(cid)

    assert result == "done"
    assert mock_xtts.call_count == 1
    expected_path = f"chunk_{refreshed[0]['id']}.wav"
    assert refreshed[0]["audio_file_path"] == expected_path
    assert refreshed[1]["audio_file_path"] == expected_path
