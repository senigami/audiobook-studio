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
    from app.db.chapters import create_chapter, get_chapter
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

    def fake_generate_via_bridge(**kwargs):
        engine = kwargs["engine"]
        out_wav = kwargs["out_wav"]
        on_output = kwargs.get("on_output")
        if engine == "xtts":
            if on_output:
                on_output("[PROGRESS] 50%\n")
            Path(out_wav).write_text("xtts")
        else:
            Path(out_wav).write_text("voxtral")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with patch("app.jobs.handlers.mixed.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("app.jobs.handlers.mixed.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("app.jobs.handlers.mixed.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.handlers.mixed.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("app.jobs.handlers.mixed.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("app.jobs.handlers.mixed.stitch_segments", side_effect=fake_stitch), \
         patch("app.jobs.handlers.mixed.update_job"):
        result = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)
        refreshed = get_chapter_segments(cid)
        chapter = get_chapter(cid)
    assert result == "done"
    assert output_wav.exists()
    assert all(segment["audio_status"] == "done" for segment in refreshed)
    assert refreshed[0]["audio_file_path"] == f"chunk_{refreshed[0]['id']}.wav"
    assert refreshed[1]["audio_file_path"] == f"chunk_{refreshed[1]['id']}.wav"
    assert chapter["audio_status"] == "done"
    assert chapter["audio_file_path"] == output_wav.name


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

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    with patch("app.jobs.handlers.mixed.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("app.jobs.handlers.mixed.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("app.jobs.handlers.mixed.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.handlers.mixed.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("app.jobs.handlers.mixed.generate_via_bridge", side_effect=fake_generate_via_bridge) as mock_bridge, \
         patch("app.jobs.handlers.mixed.update_job"):
        result = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)
        refreshed = get_chapter_segments(cid)

    assert result == "done"
    assert mock_bridge.call_count == 1
    expected_path = f"chunk_{refreshed[0]['id']}.wav"
    assert refreshed[0]["audio_file_path"] == expected_path
    assert refreshed[1]["audio_file_path"] == expected_path


def test_handle_mixed_job_progress_uses_render_group_count(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "One. Two. Three.")
    sync_chapter_segments(cid, "One. Two. Three.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="XTTS Voice")
    update_segment(segs[1]["id"], speaker_profile_name="XTTS Voice")
    update_segment(segs[2]["id"], speaker_profile_name="Voxtral Voice")

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

    def fake_generate_via_bridge(**kwargs):
        engine = kwargs["engine"]
        out_wav = kwargs["out_wav"]
        if engine == "xtts":
             Path(out_wav).write_text("xtts")
        else:
             Path(out_wav).write_text("voxtral")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with patch("app.jobs.handlers.mixed.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("app.jobs.handlers.mixed.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("app.jobs.handlers.mixed.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.handlers.mixed.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("app.jobs.handlers.mixed.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("app.jobs.handlers.mixed.stitch_segments", side_effect=fake_stitch), \
         patch("app.jobs.handlers.mixed.update_job") as mock_update:
        result = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    progress_updates = [
        call.kwargs["progress"]
        for call in mock_update.call_args_list
        if "progress" in call.kwargs and call.kwargs.get("active_segment_id") is None and call.kwargs.get("status") is None
    ]
    assert 0.54 in progress_updates


def test_handle_mixed_job_progress_weights_short_final_group(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "A" * 500 + "." + " " + "B" * 450 + "." + " " + "C" * 50 + ".")
    sync_chapter_segments(cid, "A" * 500 + "." + " " + "B" * 450 + "." + " " + "C" * 50 + ".")
    segs = get_chapter_segments(cid)
    for segment in segs:
        update_segment(segment["id"], speaker_profile_name="XTTS Voice")

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

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with patch("app.jobs.handlers.mixed.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.jobs.handlers.mixed.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("app.jobs.handlers.mixed.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.handlers.mixed.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("app.jobs.handlers.mixed.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("app.jobs.handlers.mixed.stitch_segments", side_effect=fake_stitch), \
         patch("app.jobs.handlers.mixed.update_job") as mock_update:
        result = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    progress_updates = [
        call.kwargs["progress"]
        for call in mock_update.call_args_list
        if "progress" in call.kwargs and call.kwargs.get("active_segment_id") is None and call.kwargs.get("status") is None
    ]
    assert 0.45 in progress_updates
    assert 0.85 in progress_updates


def test_handle_mixed_segment_job_persists_intermediate_progress(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    segment_id = segs[0]["id"]
    update_segment(segment_id, speaker_profile_name="XTTS Voice")

    job = Job(
        id="mixed-segment-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
        segment_ids=[segment_id],
    )

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()

    def fake_generate_via_bridge(**kwargs):
        on_output = kwargs["on_output"]
        if on_output:
            on_output("[PROGRESS] 25%\n")
            on_output("[PROGRESS] 50%\n")
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    with patch("app.jobs.handlers.mixed.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("app.jobs.handlers.mixed.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("app.jobs.handlers.mixed.get_speaker_wavs", return_value="ref.wav"), \
         patch("app.jobs.handlers.mixed.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("app.jobs.handlers.mixed.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("app.jobs.handlers.mixed.update_job") as mock_update:
        result = handle_mixed_job("mixed-segment-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    intermediate_updates = [
        call.kwargs
        for call in mock_update.call_args_list
        if call.kwargs.get("active_segment_id") == segment_id
        and call.kwargs.get("active_segment_progress", 0) > 0
    ]
    assert intermediate_updates
    assert intermediate_updates[0]["progress"] == 0.25
    assert intermediate_updates[-1]["progress"] == 0.5
