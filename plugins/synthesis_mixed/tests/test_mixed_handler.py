import time
import os
import importlib
from pathlib import Path
from unittest.mock import patch

import pytest

from app.engines.errors import EngineBridgeError
from app.db.models import Job
from plugins.synthesis_mixed.handler import handle_mixed_job
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
         patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.synthesis_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("plugins.synthesis_mixed.handler.update_job"):
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
         patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.synthesis_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("app.db.update_queue_item") as mock_update_queue, \
         patch("plugins.synthesis_mixed.handler.update_job") as mock_update_job:
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

    with patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=EngineBridgeError("Bridge concrete failure")), \
         patch("plugins.synthesis_mixed.handler.update_job") as mock_update:
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

    with patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge) as mock_bridge, \
         patch("plugins.synthesis_mixed.handler.update_job"):
        result, _ = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)
        refreshed = get_chapter_segments(cid)

    assert result == "done"
    assert mock_bridge.call_count == 1
    expected_path = f"{refreshed[0]['id']}.wav"
    assert refreshed[0]["audio_file_path"] == expected_path
    assert refreshed[1]["audio_file_path"] == expected_path
    assert (tmp_path / "segments" / expected_path).exists()


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

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

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

    with patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "voice_123"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.synthesis_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("plugins.synthesis_mixed.handler.update_job") as mock_update:
        result, _ = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    progress_updates = [
        call.kwargs["progress"]
        for call in mock_update.call_args_list
        if "progress" in call.kwargs and call.kwargs.get("active_segment_id") is None and call.kwargs.get("status") is None
    ]
    assert 0.54 in progress_updates

    for call in mock_update.call_args_list:
        status = call.kwargs.get("status")
        if status in {"done", "failed", "cancelled"}:
            continue
        assert call.kwargs.get("skip_studio_job_event") is True
        assert call.kwargs.get("skip_job_updated") is True


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

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    def fake_stitch(_pdir, _segments, out_wav, _on_output, _cancel_check):
        Path(out_wav).write_text("stitched")
        return 0

    with patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.synthesis_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("plugins.synthesis_mixed.handler.update_job") as mock_update:
        result, _ = handle_mixed_job("mixed-job", job, time.time(), lambda _line: None, lambda: False)

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

    tmp_path = tmp_path / "audio"
    tmp_path.mkdir()

    def fake_generate_via_bridge(**kwargs):
        on_output = kwargs["on_output"]
        if on_output:
            on_output("[PROGRESS] 25%\n")
            on_output("[PROGRESS] 50%\n")
        Path(kwargs["out_wav"]).write_text("xtts")
        return 0

    with patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.synthesis_mixed.handler.update_job") as mock_update:
        result, _ = handle_mixed_job("mixed-segment-job", job, time.time(), lambda _line: None, lambda: False)

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


def test_handle_mixed_job_records_true_render_group_count(clean_db, tmp_path):
    """record_engine_sample must receive the actual rendered group count, not fallback 0."""
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
         patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "voxtral" if name == "Voxtral Voice" else "xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", side_effect=lambda name: {"speed": 1.0, "voxtral_voice_id": "v"} if name == "Voxtral Voice" else {"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.synthesis_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("plugins.synthesis_mixed.handler.update_job"), \
         patch("plugins.synthesis_mixed.handler.record_engine_sample") as mock_record:
        result, _ = handle_mixed_job("mixed-metrics-job", job, time.time(), lambda _line: None, lambda: False)

    assert result == "done"
    assert mock_record.called, "record_engine_sample must be called after a successful render"
    # 5th positional argument is source_segment_count; there are 2 render groups (one per profile)
    call_args = mock_record.call_args
    recorded_count = call_args.args[4] if len(call_args.args) >= 5 else call_args.kwargs.get("source_segment_count")
    assert recorded_count == 2, f"expected 2 render groups but got {recorded_count}"


def test_handle_mixed_job_bake_metrics_uses_rendered_chars_only(clean_db, tmp_path):
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

    with patch("plugins.synthesis_mixed.handler.get_chapter_dir", return_value=tmp_path), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", side_effect=lambda name, _fallback=None: "xtts"), \
         patch("plugins.synthesis_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_speaker_wavs", return_value="ref.wav"), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=tmp_path / "voice"), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=fake_generate_via_bridge), \
         patch("plugins.synthesis_mixed.handler.stitch_segments", side_effect=fake_stitch), \
         patch("plugins.synthesis_mixed.handler.update_job"), \
         patch("plugins.synthesis_mixed.handler.record_engine_sample") as mock_record:

        handle_mixed_job("bake-job", job, time.time(), lambda _line: None, lambda: False)

    assert mock_record.called
    args, _ = mock_record.call_args
    # recorded_chars = args[2]
    # Total chars is ~24. Group 1 is ~12, Group 2 is ~12.
    # If we incorrectly use tracking_groups (all_groups), it will be ~24.
    # If we correctly use target_groups (rendered only), it will be ~12.
    assert args[2] < 20, f"Recorded {args[2]} chars, expected only rendered subset (< 20)"


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
    from plugins.synthesis_mixed.handler import _render_segment

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

    with patch("plugins.synthesis_mixed.handler.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("plugins.synthesis_mixed.handler.get_voice_profile_dir", return_value=expected_profile_dir), \
         patch("plugins.synthesis_mixed.handler.generate_via_bridge", side_effect=capturing_bridge):
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
