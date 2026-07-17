import time
import os
import importlib
from pathlib import Path
from unittest.mock import patch

import pytest

from app.engines.errors import EngineBridgeError
from app.db.models import Job
from tts_engines.tts_mixed.handler import handle_mixed_job
from tests.utils.timeout import timeout_after


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

    output_wav = tmp_path / f"{cid}_0.wav"

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

    with timeout_after(5, "mixed handler render should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job"):
        result, _ = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)
        refreshed = get_chapter_segments(cid)
        chapter = get_chapter(cid)
    assert result == "done"
    assert output_wav.exists()
    assert all(segment["audio_status"] == "done" for segment in refreshed)
    assert refreshed[0]["audio_file_path"] == f"{refreshed[0]['id']}.wav"
    assert refreshed[1]["audio_file_path"] == f"{refreshed[1]['id']}.wav"
    assert chapter["audio_status"] == "done"
    assert chapter["audio_file_path"] == output_wav.name


def test_handle_mixed_job_does_not_write_queue_row_directly(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="XTTS Voice")

    job = Job(
        id="mixed-job-no-queue-write",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with timeout_after(5, "mixed handler completion should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("app.db.update_queue_item") as mock_update_queue, \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update_job:
        result, _ = handle_mixed_job("mixed-job-no-queue-write", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    assert mock_update_queue.call_count == 0
    assert any(call.kwargs.get("status") == "done" for call in mock_update_job.call_args_list)


def test_handle_mixed_job_returns_bridge_failure_message(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="XTTS Voice")

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

    with patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=EngineBridgeError("Bridge concrete failure")), \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update:
        status, message = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)

    assert status == "failed"
    assert message == "Bridge concrete failure"
    assert mock_update.call_args.kwargs["error"] == "Bridge concrete failure"


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

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    with patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge) as mock_bridge, \
         patch("tts_engines.tts_mixed.handler.update_job"):
        result, _ = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)
        refreshed = get_chapter_segments(cid)

    assert result == "done"
    assert mock_bridge.call_count == 1
    expected_path = f"{refreshed[0]['id']}.wav"
    assert refreshed[0]["audio_file_path"] == expected_path
    assert refreshed[1]["audio_file_path"] == expected_path
    assert (tmp_path / "segments" / expected_path).exists()


def test_handle_mixed_job_emits_segment_saved_markers_and_owns_no_chapter_progress(clean_db, tmp_path):
    """The orchestrator is the single owner of chapter-level progress for mixed renders.

    The handler must:
    - emit [SEGMENT_SAVED] {absolute path} via on_output after each rendered group
      (this is the only way the orchestrator accumulates completed weight), and
    - make NO update_job call carrying 'progress' or 'grouped_progress' during the
      render loop (terminal/status updates excluded).
    """
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
        id="mixed-marker-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        on_output = kwargs.get("on_output")
        if on_output:
            on_output("[PROGRESS] 50%\n")
        Path(kwargs["out_wav"]).write_text("audio")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    output_lines: list[str] = []

    with timeout_after(5, "mixed handler marker test should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "v"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update:
        result, _ = handle_mixed_job("mixed-marker-job", job, time.time(), output_lines.append, lambda: False)

    assert result == "done"

    expected_paths = [
        str((tmp_path / "segments" / f"{segs[0]['id']}.wav").absolute()),
        str((tmp_path / "segments" / f"{segs[1]['id']}.wav").absolute()),
    ]
    saved_lines = [line for line in output_lines if "[SEGMENT_SAVED]" in line]
    assert saved_lines == [f"[SEGMENT_SAVED] {path}\n" for path in expected_paths]

    # The handler must not write chapter-level progress; the orchestrator owns it.
    for call in mock_update.call_args_list:
        if call.kwargs.get("status"):
            continue
        assert "progress" not in call.kwargs, f"handler wrote chapter progress: {call.kwargs}"
        assert "grouped_progress" not in call.kwargs, f"handler wrote grouped progress: {call.kwargs}"


def test_handle_mixed_job_emits_engine_activity_started_before_bridge_call(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    leader_id = segs[0]["id"]
    update_segment(leader_id, speaker_profile_name="XTTS Voice")

    job = Job(
        id="mixed-engine-activity-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()
    output_lines: list[str] = []

    def fake_generate_via_bridge(**kwargs):
        output_lines.append(f"bridge:{kwargs['engine']}\n")
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job"):
        result, _ = handle_mixed_job("mixed-engine-activity-job", job, time.time(), output_lines.append, lambda: False)

    assert result == "done"
    engine_activity_index = output_lines.index(f"[ENGINE_ACTIVITY_STARTED] {leader_id}\n")
    bridge_index = output_lines.index("bridge:xtts\n")
    assert engine_activity_index < bridge_index


def test_handle_mixed_job_forwards_engine_progress_lines(clean_db, tmp_path):
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

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        engine = kwargs["engine"]
        out_wav = kwargs["out_wav"]
        on_output = kwargs.get("on_output")
        if on_output:
            on_output("[PROGRESS] 25%\n")
            on_output("[PROGRESS] 75%\n")
        if engine == "xtts":
             Path(out_wav).write_text("xtts")
        else:
             Path(out_wav).write_text("voxtral")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    output_lines: list[str] = []

    with patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update:
        result, _ = handle_mixed_job("mixed-job", job, time.time(), output_lines.append, lambda: False)

    assert result == "done"

    # Engine [PROGRESS] lines must be forwarded verbatim — they are what feeds the
    # orchestrator's marker pipeline (the single owner of chapter-level progress).
    # 2 render groups (segments grouped by profile) x 2 progress lines each.
    progress_lines = [line for line in output_lines if "[PROGRESS]" in line]
    assert progress_lines == ["[PROGRESS] 25%\n", "[PROGRESS] 75%\n"] * 2
    start_lines = [line for line in output_lines if "[START_SEGMENT]" in line]
    assert len(start_lines) == 2

    for call in mock_update.call_args_list:
        status = call.kwargs.get("status")
        if status in {"done", "failed", "cancelled"}:
            continue
        assert call.kwargs.get("skip_studio_job_event") is True
        assert call.kwargs.get("skip_job_updated") is True


def test_handle_mixed_job_emits_marker_per_render_group(clean_db, tmp_path):
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

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    output_lines: list[str] = []

    with patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job"):
        result, _ = handle_mixed_job("mixed-job", job, time.time(), output_lines.append, lambda: False)

    assert result == "done"
    # Three chunk-limited render groups: each must announce START_SEGMENT with its
    # leader id and report SEGMENT_SAVED with its absolute output path, in order.
    start_lines = [line for line in output_lines if "[START_SEGMENT]" in line]
    saved_lines = [line for line in output_lines if "[SEGMENT_SAVED]" in line]
    assert len(start_lines) == 3
    assert len(saved_lines) == 3
    for start_line, saved_line in zip(start_lines, saved_lines):
        leader_id = start_line.split("[START_SEGMENT]")[1].strip()
        expected_path = (tmp_path / "segments" / f"{leader_id}.wav").absolute()
        assert saved_line == f"[SEGMENT_SAVED] {expected_path}\n"


def test_handle_mixed_segment_job_forwards_progress_lines(clean_db, tmp_path):
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

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        on_output = kwargs["on_output"]
        if on_output:
            on_output("[PROGRESS] 25%\n")
            on_output("[PROGRESS] 50%\n")
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    with patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update, \
         patch("tts_engines.tts_mixed.handler.record_engine_sample") as mock_record:
        output_lines: list[str] = []
        result, _ = handle_mixed_job("mixed-segment-job", job, time.time(), output_lines.append, lambda: False)

    assert result == "done"
    # The handler must forward engine progress lines untouched so the orchestrator
    # (the single owner of chapter-level progress) can compute weighted progress.
    progress_lines = [line for line in output_lines if "[PROGRESS]" in line]
    assert progress_lines == ["[PROGRESS] 25%\n", "[PROGRESS] 50%\n"]
    assert any(f"[START_SEGMENT] {segment_id}" in line for line in output_lines)
    # And it must not push intermediate chapter-level progress into job state itself.
    for call in mock_update.call_args_list:
        if call.kwargs.get("status"):
            continue
        assert "progress" not in call.kwargs
        assert "active_segment_progress" not in call.kwargs
    assert mock_record.call_count == 0
    assert not any("synthesis_duration_seconds" in call.kwargs for call in mock_update.call_args_list)


def test_handle_mixed_job_does_not_write_render_performance_sample(clean_db, tmp_path):
    """The mixed handler must not write a render-performance sample at all."""
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
        id="mixed-metrics-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("audio")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with timeout_after(5, "mixed metrics test should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "v"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job"), \
         patch("tts_engines.tts_mixed.handler.record_engine_sample") as mock_record:
        result, _ = handle_mixed_job("mixed-metrics-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    mock_record.assert_not_called()


def test_handle_mixed_job_bake_skips_existing_segment_audio_and_does_not_write_samples(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    # "Segment one." (12 chars), "Segment two." (12 chars)
    cid = create_chapter(pid, "C1", "Segment one. Segment two.")
    sync_chapter_segments(cid, "Segment one. Segment two.")
    segs = get_chapter_segments(cid)

    # Force separate groups by using different speaker profiles
    update_segment(segs[0]["id"], speaker_profile_name="Profile A")
    update_segment(segs[1]["id"], speaker_profile_name="Profile B")

    job = Job(
        id="bake-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="Profile A",
        is_bake=True
    )

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    # Pre-render first segment to make it skipped during bake
    (tmp_path / "segments").mkdir(parents=True, exist_ok=True)
    group1_wav = tmp_path / "segments" / f"{segs[0]['id']}.wav"
    group1_wav.write_text("already done")
    update_segment(segs[0]["id"], audio_status="done", audio_file_path=group1_wav.name)

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("rendered")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job"), \
         patch("tts_engines.tts_mixed.handler.record_engine_sample") as mock_record:

        handle_mixed_job("bake-job", job, time.time(), lambda _line: None, lambda: False)

    mock_record.assert_not_called()


def test_render_segment_passes_voice_profile_dir_to_bridge(clean_db, tmp_path):
    """
    _render_segment must resolve the voice profile dir and forward it as
    voice_profile_dir to generate_via_bridge. Without this, Voxtral voices
    that rely on reference audio (no voice_asset_id) fail:
    'No Voxtral voice_id or reference sample is available for this voice profile.'

    Pre-fix: generate_via_bridge is called WITHOUT voice_profile_dir.
    Post-fix: it receives voice_profile_dir equal to the resolved profile dir.
    """
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
    from tts_engines.tts_mixed.handler import _render_segment

    pid = create_project("P2")
    cid = create_chapter(pid, "C2", "Hello voxtral.")
    sync_chapter_segments(cid, "Hello voxtral.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="Voxtral Voice")

    expected_profile_dir = tmp_path / "voices" / "Voxtral Voice"
    expected_profile_dir.mkdir(parents=True)

    bridge_calls: list[dict] = []

    def capturing_bridge(**kwargs):
        bridge_calls.append(kwargs)
        Path(kwargs["out_wav"]).write_text("voxtral")
        return 0

    out_wav = tmp_path / "out.wav"

    with patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=expected_profile_dir), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=capturing_bridge):
        rc = _render_segment(
            "voxtral",
            "Hello voxtral.",
            "Voxtral Voice",
            out_wav,
            safe_mode=False,
            on_output=lambda _: None,
            cancel_check=lambda: False,
        )

    assert rc == 0
    assert bridge_calls, "generate_via_bridge was not called"
    call_kwargs = bridge_calls[0]
    assert "voice_profile_dir" in call_kwargs, (
        "generate_via_bridge was called WITHOUT voice_profile_dir — "
        "Voxtral voices without voice_asset_id will fail reference-audio resolution."
    )
    assert call_kwargs["voice_profile_dir"] == expected_profile_dir


def test_handle_mixed_job_does_not_persist_handler_synthesis_duration_seconds(clean_db, tmp_path):
    """The handler must leave synthesis timing ownership to the orchestrator."""
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
        id="mixed-no-duration-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    def fake_generate_via_bridge(**kwargs):
        # Simulates bridge returning rc=0 but no duration_sec (TTSResult.duration_sec=None)
        Path(kwargs["out_wav"]).write_text("audio")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with timeout_after(5, "mixed handler should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "v"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update_job, \
         patch("tts_engines.tts_mixed.handler.record_engine_sample") as mock_record:
        result, err = handle_mixed_job("mixed-no-duration-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done", f"handler returned {result!r} instead of 'done': {err}"
    mock_record.assert_not_called()

    duration_updates = [
        call.kwargs.get("synthesis_duration_seconds")
        for call in mock_update_job.call_args_list
        if call.kwargs.get("synthesis_duration_seconds") is not None
    ]
    assert not duration_updates, f"handler should not persist synthesis_duration_seconds, got {duration_updates}"


def test_handle_mixed_job_no_metrics_writer_does_not_change_done_status(clean_db, tmp_path):
    """Removing the mixed-handler metrics writer must not change the render outcome."""
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
        id="mixed-metrics-fail-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("audio")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with timeout_after(5, "mixed handler should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "v"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update_job, \
         patch("tts_engines.tts_mixed.handler.record_engine_sample") as mock_record:
        result, err = handle_mixed_job("mixed-metrics-fail-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done", f"handler returned {result!r} — the render outcome changed unexpectedly"
    assert err is None, f"unexpected error: {err}"
    mock_record.assert_not_called()

    # Confirm no failed status was set after the done status
    call_statuses = [call.kwargs.get("status") for call in mock_update_job.call_args_list if call.kwargs.get("status")]
    assert "failed" not in call_statuses, f"update_job was called with status='failed' after metrics error: {call_statuses}"


def test_handle_mixed_job_wav_only_even_when_make_mp3_true(clean_db, tmp_path):
    """WAV-first synthesis (queue-jobs.md §3.6): mixed chapter renders never
    emit a finalizing phase nor convert to MP3, even with make_mp3=True."""
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
        id="mixed-wav-only",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
        make_mp3=True,
    )

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("audio")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with timeout_after(5, "mixed handler render should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job") as mock_update:
        result, _ = handle_mixed_job("mixed-wav-only", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    statuses = [c.kwargs.get("status") for c in mock_update.call_args_list if c.kwargs.get("status")]
    assert "finalizing" not in statuses
    done_calls = [c for c in mock_update.call_args_list if c.kwargs.get("status") == "done"]
    assert done_calls and "output_mp3" not in done_calls[-1].kwargs
    assert done_calls[-1].kwargs.get("output_wav", "").endswith(".wav")


def test_handle_mixed_job_emits_segment_engine_sample_marker_per_group(clean_db, tmp_path):
    """render_one_group must emit [SEGMENT_ENGINE_SAMPLE] {segment_id} {engine}
    {chars} {duration_seconds} for each rendered group, carrying the group's REAL
    resolved engine (never "mixed") and its own text length — this is the only
    fact the orchestrator has to attribute a mixed job's calibration sample to
    the real engine that did the work, instead of "mixed" (which never
    synthesizes anything itself, ADR-0004).
    """
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
        id="mixed-engine-sample-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("audio")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    output_lines: list[str] = []

    with timeout_after(5, "mixed segment-engine-sample marker test should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "v"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("tts_engines.tts_mixed.handler.update_job"):
        result, _ = handle_mixed_job(
            "mixed-engine-sample-job", job, time.time(), output_lines.append, lambda: False
        )

    assert result == "done"

    sample_lines = [line for line in output_lines if "[SEGMENT_ENGINE_SAMPLE]" in line]
    assert len(sample_lines) == 2, f"expected one marker per group, got: {output_lines}"

    parsed = []
    for line in sample_lines:
        tokens = line.split("[SEGMENT_ENGINE_SAMPLE]")[1].strip().split()
        assert len(tokens) == 4, f"expected 4 whitespace tokens, got: {tokens}"
        seg_id, engine, chars, duration = tokens
        parsed.append((seg_id, engine, int(chars), float(duration)))

    engines_by_seg = {seg_id: engine for seg_id, engine, _, _ in parsed}
    assert engines_by_seg[segs[0]["id"]] == "xtts"
    assert engines_by_seg[segs[1]["id"]] == "voxtral"

    # Never attribute a group's sample to the "mixed" container label itself.
    assert all(engine != "mixed" for _, engine, _, _ in parsed)
    # Each group's char count is its own text, not the whole chapter's.
    assert all(chars > 0 for _, _, chars, _ in parsed)
    assert all(duration >= 0.0 for _, _, _, duration in parsed)


def test_handle_mixed_job_does_not_emit_segment_engine_sample_for_failed_group(clean_db, tmp_path):
    """A failed group must not emit [SEGMENT_ENGINE_SAMPLE] — only a genuinely
    completed, INV-3-validated render may attribute time to the real engine.
    """
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    update_segment(segs[0]["id"], speaker_profile_name="XTTS Voice")

    job = Job(
        id="mixed-engine-sample-failed-job",
        engine="mixed",
        chapter_file=f"{cid}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=pid,
        chapter_id=cid,
        speaker_profile="XTTS Voice",
    )

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        # Simulate an engine failure: no output file written, non-zero rc.
        return 1

    output_lines: list[str] = []

    with timeout_after(5, "mixed segment-engine-sample failed-group test should not hang"), \
         patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("tts_engines.tts_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("tts_engines.tts_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("tts_engines.tts_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("tts_engines.tts_mixed.handler.update_job"):
        result, _ = handle_mixed_job(
            "mixed-engine-sample-failed-job", job, time.time(), output_lines.append, lambda: False
        )

    assert result == "failed"
    assert not any("[SEGMENT_ENGINE_SAMPLE]" in line for line in output_lines)
