import os
import pytest
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
from tts_engines.tts_xtts.plugin.studio import handler as xtts_handler
from tts_engines.tts_xtts.plugin.studio.handler import handle_xtts_job, _group_job_progress
from tts_engines.tts_xtts.plugin.studio.bake import handle_xtts_bake
from tts_engines.tts_xtts.plugin.studio.segments import handle_xtts_segments
from xtts_test_fakes import Job

@pytest.fixture(autouse=True)
def mock_path_methods():
    with patch("pathlib.Path.write_text"), \
         patch("pathlib.Path.unlink"), \
         patch("pathlib.Path.exists", return_value=True):
        yield

@pytest.fixture
def mock_job():
    return Job(
        id="test_jid",
        engine="xtts",
        chapter_file="c1.wav",
        chapter_id="chap_123",
        status="running",
        is_bake=False,
        segment_ids=None,
        safe_mode=True,
        make_mp3=True,
        created_at=time.time()
    )

@pytest.fixture
def mock_params():
    return {
        "jid": "test_jid",
        "start": time.time(),
        "on_output": MagicMock(),
        "cancel_check": MagicMock(return_value=False),
        "default_sw": "default.wav",
        "speed": 1.0,
        "pdir": Path("/tmp/xtts"),
        "out_wav": Path("/tmp/xtts/c1.wav"),
        "out_mp3": Path("/tmp/xtts/c1.mp3"),
        "text": "Fallback text"
    }

def test_handle_xtts_standard_full(mock_job, mock_params):
    """Test standard chapter generation path."""
    with patch("tts_engines.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": "char1", "speaker_profile_name": "Narrator", "character_speaker_profile_name": "Narrator", "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"), \
         patch("tts_engines.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.wav_to_mp3", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job"), \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        assert mock_job.status == "running"


def test_xtts_handler_exports_logger():
    assert hasattr(xtts_handler, "logger")

def test_handle_xtts_bake_mode(mock_job, mock_params):
    """Test chapter baking path."""
    mock_job.is_bake = True

    segs = [
        {"id": "1", "text_content": "T1", "audio_status": "done", "audio_file_path": "s1.wav", "character_id": "c1"},
        {"id": "2", "text_content": "T2", "audio_status": "queued", "audio_file_path": None, "character_id": "c1"}
    ]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("tts_engines.tts_xtts.plugin.studio.bake.generate_via_bridge", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.wav_to_mp3", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_audio_duration", return_value=10.0), \
         patch("app.db.update_queue_item"), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update_job, \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(j=mock_job, **mock_params)
        mock_params["on_output"].assert_any_call("Baking Chapter chap_123 starting...\n")

    for call in mock_update_job.call_args_list:
        status = call.kwargs.get("status")
        if status in {"done", "failed", "cancelled"}:
            continue
        assert call.kwargs.get("skip_studio_job_event") is True
        assert call.kwargs.get("skip_job_updated") is True

def test_handle_xtts_bake_recovers_single_segment_output_when_stitch_leaves_no_file(mock_job, mock_params, tmp_path):
    """A successful stitch should still yield a chapter file even if the stitch helper does not materialize it."""
    mock_job.is_bake = True
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    segs = [
        {"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "unprocessed", "audio_file_path": None},
    ]

    (pdir / "segments").mkdir(parents=True, exist_ok=True)
    (pdir / "segments" / "s1.wav").write_bytes(b"audio")

    def update_segment_side_effect(segment_id, broadcast=True, **updates):
        for segment in segs:
            if segment["id"] == segment_id:
                segment.update(updates)
                break
        return True

    def generate_side_effect(**kwargs):
        on_output = kwargs.get("on_output")
        if on_output:
            on_output("[SEGMENT_SAVED] " + str(pdir / "segments" / "s1.wav"))
        return 0

    def path_exists(self):
        return os.path.exists(self)

    with patch("pathlib.Path.exists", new=path_exists), \
         patch("app.db.get_chapter_segments", side_effect=lambda chapter_id: segs), \
         patch("app.db.update_segment", side_effect=update_segment_side_effect), \
         patch("app.db.get_connection"), \
         patch("app.db.update_queue_item") as mock_update_queue, \
         patch("tts_engines.tts_xtts.plugin.studio.bake.generate_via_bridge", side_effect=generate_side_effect), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_audio_duration", return_value=10.0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job"), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, "default.wav", 1.0,
            pdir, out_wav, out_mp3
        )

    assert out_wav.exists()
    mock_update_queue.assert_called_with("test_job", "done", audio_length_seconds=10.0, output_file="output.wav")

def test_handle_xtts_standard_recovers_single_segment_output_when_stitch_leaves_no_file(mock_job, mock_params, tmp_path):
    """The standard chapter path should also keep a successful single-segment stitch."""
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    segs = [
        {"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "unprocessed", "audio_file_path": None},
    ]

    (pdir / "segments").mkdir(parents=True, exist_ok=True)
    (pdir / "segments" / "s1.wav").write_bytes(b"audio")

    def update_segment_side_effect(segment_id, broadcast=True, **updates):
        for segment in segs:
            if segment["id"] == segment_id:
                segment.update(updates)
                break
        return True

    def generate_side_effect(**kwargs):
        on_output = kwargs.get("on_output")
        if on_output:
            on_output("[SEGMENT_SAVED] " + str(pdir / "segments" / "s1.wav"))
        return 0

    def path_exists(self):
        return os.path.exists(self)

    with patch("pathlib.Path.exists", new=path_exists), \
         patch("app.db.get_chapter_segments", side_effect=lambda chapter_id: segs), \
         patch("app.db.update_segment", side_effect=update_segment_side_effect), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segments_status_bulk"), \
         patch("tts_engines.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", side_effect=generate_side_effect), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_audio_duration", return_value=10.0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job"), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, "default.wav", 1.0,
            pdir, out_wav, out_mp3, text="Fallback text"
        )

    assert out_wav.exists()

def test_handle_xtts_segments_mode(mock_job, mock_params):
    """Test specific segments generation path."""
    mock_job.segment_ids = ["seg1"]
    segs = [{"id": "seg1", "text_content": "T1", "character_id": "c1", "speaker_profile_name": "S1"}]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("tts_engines.tts_xtts.plugin.studio.segments.generate_via_bridge", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update_job, \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(j=mock_job, **mock_params)

    for call in mock_update_job.call_args_list:
        status = call.kwargs.get("status")
        if status in {"done", "failed", "cancelled"}:
            continue
        assert call.kwargs.get("skip_studio_job_event") is True
        assert call.kwargs.get("skip_job_updated") is True


def test_handle_xtts_segments_clamps_full_progress_before_save(mock_job, mock_params):
    """A raw 100% progress marker should not surface as a terminal-looking segment bar blip."""
    mock_job.segment_ids = ["seg1"]
    segs = [{"id": "seg1", "text_content": "T1", "character_id": "c1", "speaker_profile_name": "S1"}]

    def generate_with_full_progress(**kwargs):
        on_output = kwargs["on_output"]
        on_output("[START_SEGMENT] seg1")
        on_output("[PROGRESS] 100%")
        return 0

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("tts_engines.tts_xtts.plugin.studio.segments.generate_via_bridge", side_effect=generate_with_full_progress), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update_job, \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):
        handle_xtts_job(j=mock_job, **mock_params)

    progress_calls = [
        call for call in mock_update_job.call_args_list
        if call.kwargs.get("active_segment_id") == "seg1" and call.kwargs.get("active_segment_progress") is not None
    ]
    assert progress_calls
    assert all(call.kwargs.get("active_segment_progress") < 1.0 for call in progress_calls)

def test_handle_xtts_cancel(mock_job, mock_params):
    """Test cancellation check."""
    mock_params["cancel_check"].return_value = True

    with patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update:
        handle_xtts_job(j=mock_job, **mock_params)

def test_handle_xtts_failed_stitch(mock_job, mock_params):
    """Test baking failure during stitch."""
    mock_job.is_bake = True
    segs = [{"id": "1", "text_content": "T1", "audio_status": "done", "audio_file_path": "s1.wav", "character_id": "c1"}]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("tts_engines.tts_xtts.plugin.studio.bake.generate_via_bridge", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", return_value=1), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update:

        handle_xtts_job(j=mock_job, **mock_params)
        mock_update.assert_any_call(mock_params["jid"], status="failed", error="Stitching failed (rc=1)")

def test_handle_xtts_no_mp3(mock_job, mock_params):
    """Test standard path without MP3 conversion."""
    mock_job.make_mp3 = False
    with patch("tts_engines.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("tts_engines.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update, \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        # Check if done was called at least once
        done_calls = [c for c in mock_update.call_args_list if c[1].get('status') == 'done']
        assert len(done_calls) > 0
        assert done_calls[0][1]['progress'] == 1.0

def test_handle_xtts_empty_segments(mock_job, mock_params):
    """Test segment mode with empty list after filtering."""
    mock_job.segment_ids = [999] # Non-empty to enter elif
    with patch("app.db.get_chapter_segments", return_value=[]), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update:
        handle_xtts_job(j=mock_job, **mock_params)
        # Empty segs_to_gen calls update_job with status="done"
        mock_update.assert_any_call("test_jid", status="done", progress=1.0)

def test_handle_xtts_wav_only_even_when_make_mp3_true(mock_job, mock_params):
    """Chapter synthesis must complete WAV-only regardless of make_mp3 flag.
    No MP3 conversion must occur and output_mp3 must not appear in the terminal call."""
    mock_job.make_mp3 = True
    with patch("tts_engines.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("tts_engines.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.wav_to_mp3") as mock_wav_to_mp3, \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job") as mock_update, \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)

    # wav_to_mp3 must not be called during ordinary chapter synthesis
    assert not mock_wav_to_mp3.called, "wav_to_mp3 must not be called in ordinary chapter synthesis"

    done_calls = [c for c in mock_update.call_args_list if c[1].get('status') == 'done']
    assert done_calls, "expected at least one done update_job call"
    terminal = done_calls[-1]
    assert terminal[1].get('output_wav') == mock_params["out_wav"].name
    assert 'output_mp3' not in terminal[1], "output_mp3 must not appear in WAV-only terminal completion"

def test_handle_xtts_no_custom_segments(mock_job, mock_params):
    """Test standard chapter generation when no segments have custom characters."""
    with patch("tts_engines.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("tts_engines.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0) as mock_gen, \
         patch("tts_engines.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.wav_to_mp3", return_value=0), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job"), \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        assert mock_gen.called


def test_group_job_progress_blends_active_segment_into_total_progress():
    assert _group_job_progress(0, 4, 0.5, limit=0.9) == 0.11
    assert _group_job_progress(2, 4, 0.75, limit=0.9) == 0.62
    assert _group_job_progress(1, 2, 1.0, limit=1.0) == 1.0


def test_group_job_progress_tracks_render_group_units():
    assert _group_job_progress(0, 2, 0.5, limit=0.9) == 0.23
    assert _group_job_progress(1, 2, 0.5, limit=0.9) == 0.68


def test_group_job_progress_weights_short_groups_less():
    assert _group_job_progress(1, 3, 0.0, limit=0.9, group_weights=[500, 450, 50]) == 0.45
    assert _group_job_progress(2, 3, 0.0, limit=0.9, group_weights=[500, 450, 50]) == 0.85
    assert _group_job_progress(2, 3, 0.5, limit=0.9, group_weights=[500, 450, 50]) == 0.88


def _run_standard_with_straggler_save(mock_job, tmp_path, cancelled):
    """Drive handle_xtts_job through the standard chapter path with a single
    unprocessed segment, firing a straggler [SEGMENT_SAVED] from the engine while
    the render's cancel flag is `cancelled`. Returns the list of update_segment
    calls that set audio_status='done' (the resurrection write at
    standard_handler.py chapter_on_output)."""
    pdir = tmp_path / "project"
    pdir.mkdir()
    (pdir / "segments").mkdir(parents=True, exist_ok=True)
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    segs = [{"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "unprocessed", "audio_file_path": None}]
    done_writes = []
    # Mid-stream cancel: the render is already past handle_xtts_job's entry guard
    # and inside the engine stream when the user cancels. cancel_check is False at
    # entry (so the handler runs) and flips True just before the straggler save is
    # processed by chapter_on_output — exactly the production race.
    cancel_flag = {"v": False}

    def capture_update_segment(segment_id, **updates):
        if updates.get("audio_status") == "done":
            done_writes.append((segment_id, updates))
        return True

    def generate_side_effect(**kwargs):
        on_output = kwargs.get("on_output")
        if cancelled:
            cancel_flag["v"] = True  # cancel lands mid-render, before the save below
        if on_output:
            # Straggler save arriving from the not-yet-stopped engine subprocess.
            # rc=1 stops the handler before the success/stitch path so the ONLY
            # done-write opportunity is chapter_on_output.
            on_output("[SEGMENT_SAVED] " + str(pdir / "segments" / "s1.wav"))
        return 1

    with patch("tts_engines.tts_xtts.plugin.studio.handler.load_chunk_segments", side_effect=lambda chapter_id: [dict(s) for s in segs]), \
         patch("tts_engines.tts_xtts.plugin.studio.standard_handler.update_segment", side_effect=capture_update_segment), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segments_status_bulk"), \
         patch("tts_engines.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", side_effect=generate_side_effect), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.update_job"), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):
        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: cancel_flag["v"],
            "default.wav", 1.0, pdir, out_wav, out_mp3, text="Fallback text",
        )
    return done_writes


def test_cancelled_chapter_render_does_not_remark_segment_done(mock_job, tmp_path):
    """A cancelled chapter render must not write segment audio_status='done' on a
    straggler [SEGMENT_SAVED] — that would resurrect state a chapter reset just
    cleared and make the next render reuse stale audio. R1: before the
    `and not cancel_check()` guard this FAILS (the write fires regardless)."""
    done_writes = _run_standard_with_straggler_save(mock_job, tmp_path, cancelled=True)
    assert not done_writes, (
        f"cancelled render re-marked segments done on a straggler save: {done_writes}"
    )


def test_active_chapter_render_marks_segment_done(mock_job, tmp_path):
    """Control: a non-cancelled render still marks its saved segment done,
    proving the straggler save reaches the write and the guard is meaningful."""
    done_writes = _run_standard_with_straggler_save(mock_job, tmp_path, cancelled=False)
    assert done_writes, "expected a non-cancelled render to mark its saved segment done"


# ---------------------------------------------------------------------------
# Mid-stream cancel guard tests: bake and segments handlers (R1-verified)
# ---------------------------------------------------------------------------

def _run_bake_with_straggler_save(mock_job, tmp_path, cancelled):
    """Drive handle_xtts_bake with a single unprocessed segment, firing a
    straggler [SEGMENT_SAVED] from generate_via_bridge while the render's cancel
    flag is `cancelled`. Returns done-writes (segment_id, kwargs) pairs where
    audio_status='done'."""
    pdir = tmp_path / "project"
    pdir.mkdir()
    (pdir / "segments").mkdir(parents=True, exist_ok=True)
    out_wav = pdir / "output.wav"

    segs = [{"id": "b1", "text_content": "Bake text.", "audio_status": "unprocessed",
             "audio_file_path": None, "character_id": "c1"}]
    # Group struct mirroring ctx.build_chunk_groups output
    groups = [{"segments": segs, "profile_name": "VoiceA"}]

    done_writes = []
    cancel_flag = {"v": False}

    def capture_update_segment(segment_id, **updates):
        if updates.get("audio_status") == "done":
            done_writes.append((segment_id, updates))
        return True

    def generate_side_effect(**kwargs):
        on_output = kwargs.get("on_output")
        if cancelled:
            cancel_flag["v"] = True  # cancel lands mid-render, before the save
        if on_output:
            seg_path = str((pdir / "segments" / "b1.wav").absolute())
            on_output(f"[SEGMENT_SAVED] {seg_path}")
        return 1  # rc=1 stops the handler before the success/stitch path

    mock_ctx = MagicMock()
    mock_ctx.get_text_chunk_limit.return_value = 500
    mock_ctx.build_chunk_groups.return_value = groups

    mock_job.is_bake = True
    mock_job.safe_mode = False  # disable sanitize path to avoid MagicMock chaining

    with patch("tts_engines.tts_xtts.plugin.studio.bake._get_ctx", return_value=mock_ctx), \
         patch("tts_engines.tts_xtts.plugin.studio.bake.get_chapter_segments", return_value=segs), \
         patch("tts_engines.tts_xtts.plugin.studio.bake.update_segment", side_effect=capture_update_segment), \
         patch("tts_engines.tts_xtts.plugin.studio.bake.generate_via_bridge", side_effect=generate_side_effect), \
         patch("tts_engines.tts_xtts.plugin.studio.bake._handler") as mock_handler_factory, \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_voice_profile_dir", return_value=None):

        h = MagicMock()
        mock_handler_factory.return_value = h

        handle_xtts_bake(
            "bake-jid", mock_job, time.time(),
            lambda line: None, lambda: cancel_flag["v"],
            "default.wav", 1.0, pdir, out_wav,
        )
    return done_writes


def test_cancelled_bake_render_does_not_remark_segment_done(mock_job, tmp_path):
    """A cancelled bake render must not write segment audio_status='done' on a
    straggler [SEGMENT_SAVED] — that would resurrect state a chapter reset just
    cleared. R1: before the `and not cancel_check()` guard this FAILS."""
    done_writes = _run_bake_with_straggler_save(mock_job, tmp_path, cancelled=True)
    assert not done_writes, (
        f"cancelled bake render re-marked segments done on a straggler save: {done_writes}"
    )


def test_active_bake_render_marks_segment_done(mock_job, tmp_path):
    """Control: a non-cancelled bake render still marks its saved segment done,
    proving the straggler save reaches the write and the guard is meaningful."""
    done_writes = _run_bake_with_straggler_save(mock_job, tmp_path, cancelled=False)
    assert done_writes, "expected a non-cancelled bake render to mark its saved segment done"


def _run_segments_with_straggler_save(mock_job, tmp_path, cancelled):
    """Drive handle_xtts_segments with a single targeted segment, firing a
    straggler [SEGMENT_SAVED] from generate_via_bridge while the render's cancel
    flag is `cancelled`. Returns done-writes (segment_id, kwargs) pairs where
    audio_status='done'."""
    pdir = tmp_path / "project"
    pdir.mkdir()
    (pdir / "segments").mkdir(parents=True, exist_ok=True)

    segs = [{"id": "seg1", "text_content": "Seg text.", "audio_status": "unprocessed",
             "audio_file_path": None, "character_id": "c1",
             "speaker_profile_name": "VoiceA"}]

    done_writes = []
    cancel_flag = {"v": False}

    def capture_update_segment(segment_id, **updates):
        if updates.get("audio_status") == "done":
            done_writes.append((segment_id, updates))
        return True

    def generate_side_effect(**kwargs):
        on_output = kwargs.get("on_output")
        if cancelled:
            cancel_flag["v"] = True  # cancel lands mid-render, before the save
        if on_output:
            seg_path = str((pdir / "segments" / "seg1.wav").absolute())
            on_output(f"[SEGMENT_SAVED] {seg_path}")
        return 1  # rc=1 stops the handler before the success path

    mock_ctx = MagicMock()
    mock_ctx.get_text_chunk_limit.return_value = 500
    mock_ctx.broadcast_segments_updated.return_value = None
    mock_ctx.get_chapter_segments_counts.return_value = (0, 1)

    mock_job.segment_ids = ["seg1"]
    mock_job.is_bake = False
    mock_job.safe_mode = False

    with patch("tts_engines.tts_xtts.plugin.studio.segments._get_ctx", return_value=mock_ctx), \
         patch("tts_engines.tts_xtts.plugin.studio.segments.get_chapter_segments", return_value=segs), \
         patch("tts_engines.tts_xtts.plugin.studio.segments.update_segment", side_effect=capture_update_segment), \
         patch("tts_engines.tts_xtts.plugin.studio.segments.generate_via_bridge", side_effect=generate_side_effect), \
         patch("tts_engines.tts_xtts.plugin.studio.segments._handler") as mock_handler_factory, \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"), \
         patch("tts_engines.tts_xtts.plugin.studio.handler.get_voice_profile_dir", return_value=None):

        h = MagicMock()
        mock_handler_factory.return_value = h

        handle_xtts_segments(
            "seg-jid", mock_job, time.time(),
            lambda line: None, lambda: cancel_flag["v"],
            "default.wav", 1.0, pdir,
        )
    return done_writes


def test_cancelled_segments_render_does_not_remark_segment_done(mock_job, tmp_path):
    """A cancelled segments render must not write segment audio_status='done' on a
    straggler [SEGMENT_SAVED]. R1: before the `and not cancel_check()` guard this FAILS."""
    done_writes = _run_segments_with_straggler_save(mock_job, tmp_path, cancelled=True)
    assert not done_writes, (
        f"cancelled segments render re-marked segments done on a straggler save: {done_writes}"
    )


def test_active_segments_render_marks_segment_done(mock_job, tmp_path):
    """Control: a non-cancelled segments render still marks its saved segment done,
    proving the straggler save reaches the write and the guard is meaningful."""
    done_writes = _run_segments_with_straggler_save(mock_job, tmp_path, cancelled=False)
    assert done_writes, "expected a non-cancelled segments render to mark its saved segment done"
