"""Tests for voxtral segment-targeted and bake rendering.

R2: mock only the bridge boundary (generate_via_bridge), never handler internals.
R4: no sleep-based timing.
"""
from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest

from app.db.models import Job
from plugins.tts_voxtral.plugin.studio.bake import handle_voxtral_bake
from plugins.tts_voxtral.plugin.studio.segments import handle_voxtral_segments


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_job(**kwargs):
    defaults = dict(
        id="vx-job-1",
        engine="voxtral",
        chapter_file="chapter.txt",
        status="running",
        created_at=time.time(),
        project_id="proj-1",
        chapter_id="chap-1",
        speaker_profile="VoiceA",
        safe_mode=False,
        segment_ids=None,
        is_bake=False,
    )
    defaults.update(kwargs)
    return Job(**defaults)


def _fake_segments():
    return [
        {"id": "s1", "text_content": "Hello.", "audio_status": "unprocessed", "audio_file_path": None, "character_id": "c1", "speaker_profile_name": "VoiceA", "segment_order": 1},
        {"id": "s2", "text_content": "World.", "audio_status": "unprocessed", "audio_file_path": None, "character_id": "c1", "speaker_profile_name": "VoiceA", "segment_order": 2},
        {"id": "s3", "text_content": "Bye.", "audio_status": "unprocessed", "audio_file_path": None, "character_id": "c1", "speaker_profile_name": "VoiceA", "segment_order": 3},
    ]


def _fake_groups(segs):
    """Simulate single-speaker groups (one group per segment for simplicity)."""
    return [
        {"segments": [s], "profile_name": s["speaker_profile_name"], "engine": "voxtral", "text_parts": [s["text_content"]], "text_length": len(s["text_content"])}
        for s in segs
    ]


# ---------------------------------------------------------------------------
# Segment-targeted tests
# ---------------------------------------------------------------------------

class TestVoxtralSegments:

    def test_segment_job_renders_only_targeted_groups(self, tmp_path):
        """A segment_ids job must render only the groups containing targeted segment ids."""
        job = _make_job(segment_ids=["s2"])
        segs = _fake_segments()
        groups = _fake_groups(segs)

        captured_scripts = []

        def fake_bridge(**kwargs):
            captured_scripts.append(kwargs.get("script", []))
            # Simulate engine emitting markers for each script entry
            script = kwargs.get("script") or []
            on_out = kwargs.get("on_output")
            for entry in script:
                sid = entry["id"]
                save_path = entry["save_path"]
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                Path(save_path).write_bytes(b"wav")
                if on_out:
                    on_out(f"[START_SEGMENT] {sid}\n")
                    on_out(f"[SEGMENT_SAVED] {save_path}\n")
            return 0

        with patch("plugins.tts_voxtral.plugin.studio.segments.generate_via_bridge", side_effect=fake_bridge), \
             patch("app.db.get_chapter_segments", return_value=segs), \
             patch("app.db.update_segment") as mock_update_seg, \
             patch("plugins.tts_voxtral.plugin.studio.segments._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.segments._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_text_chunk_limit.return_value = 500
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            ctx.get_chapter_segments_counts.return_value = (1, 3)
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            from plugins.tts_voxtral.plugin.studio.segments import handle_voxtral_segments
            rc = handle_voxtral_segments(
                "vx-job-1", job, 0.0,
                lambda line: None, lambda: False,
                tmp_path, None, {}
            )

        assert rc == 0
        # Only s2 group rendered
        assert len(captured_scripts) == 1
        assert len(captured_scripts[0]) == 1
        assert captured_scripts[0][0]["id"] == "s2"

        # update_segment called for s2 only
        updated_ids = [c.args[0] for c in mock_update_seg.call_args_list]
        assert "s2" in updated_ids
        assert "s1" not in updated_ids
        assert "s3" not in updated_ids

    def test_segment_job_updates_segment_rows_on_save(self, tmp_path):
        """[SEGMENT_SAVED] must update the DB row with audio_status='done'."""
        job = _make_job(segment_ids=["s1"])
        segs = _fake_segments()
        groups = _fake_groups(segs)

        def fake_bridge(**kwargs):
            script = kwargs.get("script") or []
            on_out = kwargs.get("on_output")
            for entry in script:
                save_path = entry["save_path"]
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                Path(save_path).write_bytes(b"wav")
                if on_out:
                    on_out(f"[START_SEGMENT] {entry['id']}\n")
                    on_out(f"[SEGMENT_SAVED] {save_path}\n")
            return 0

        with patch("plugins.tts_voxtral.plugin.studio.segments.generate_via_bridge", side_effect=fake_bridge), \
             patch("app.db.get_chapter_segments", return_value=segs), \
             patch("app.db.update_segment") as mock_update_seg, \
             patch("plugins.tts_voxtral.plugin.studio.segments._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.segments._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_text_chunk_limit.return_value = 500
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            ctx.get_chapter_segments_counts.return_value = (1, 3)
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            from plugins.tts_voxtral.plugin.studio.segments import handle_voxtral_segments
            handle_voxtral_segments(
                "vx-job-1", job, 0.0,
                lambda line: None, lambda: False,
                tmp_path, None, {}
            )

        # Should have called update_segment for s1 with done status
        done_calls = [c for c in mock_update_seg.call_args_list if c.kwargs.get("audio_status") == "done"]
        assert any(c.args[0] == "s1" for c in done_calls)

    def test_segment_job_emits_start_segment_marker(self, tmp_path):
        """[START_SEGMENT] must appear in on_output before synthesis completes."""
        job = _make_job(segment_ids=["s1"])
        segs = _fake_segments()
        groups = _fake_groups(segs)

        emitted = []

        def fake_bridge(**kwargs):
            on_out = kwargs.get("on_output")
            script = kwargs.get("script") or []
            for entry in script:
                save_path = entry["save_path"]
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                Path(save_path).write_bytes(b"wav")
                if on_out:
                    on_out(f"[START_SEGMENT] {entry['id']}\n")
                    on_out(f"[SEGMENT_SAVED] {save_path}\n")
            return 0

        with patch("plugins.tts_voxtral.plugin.studio.segments.generate_via_bridge", side_effect=fake_bridge), \
             patch("app.db.get_chapter_segments", return_value=segs), \
             patch("app.db.update_segment"), \
             patch("plugins.tts_voxtral.plugin.studio.segments._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.segments._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_text_chunk_limit.return_value = 500
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            ctx.get_chapter_segments_counts.return_value = (1, 3)
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            from plugins.tts_voxtral.plugin.studio.segments import handle_voxtral_segments
            handle_voxtral_segments(
                "vx-job-1", job, 0.0,
                emitted.append, lambda: False,
                tmp_path, None, {}
            )

        start_markers = [line for line in emitted if "[START_SEGMENT]" in line]
        saved_markers = [line for line in emitted if "[SEGMENT_SAVED]" in line]
        assert start_markers, "Expected at least one [START_SEGMENT] marker"
        assert saved_markers, "Expected at least one [SEGMENT_SAVED] marker"
        # START must come before SAVED
        assert emitted.index(start_markers[0]) < emitted.index(saved_markers[0])

    def test_segment_job_empty_targets_returns_zero_and_marks_done(self, tmp_path):
        """If no groups match the requested segment ids, job is marked done immediately."""
        job = _make_job(segment_ids=["nonexistent"])
        segs = _fake_segments()
        groups = _fake_groups(segs)

        with patch("app.db.get_chapter_segments", return_value=segs), \
             patch("plugins.tts_voxtral.plugin.studio.segments._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.segments._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_text_chunk_limit.return_value = 500
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            from plugins.tts_voxtral.plugin.studio.segments import handle_voxtral_segments
            rc = handle_voxtral_segments(
                "vx-job-1", job, 0.0,
                lambda line: None, lambda: False,
                tmp_path, None, {}
            )

        assert rc == 0
        h.update_job.assert_called_once_with("vx-job-1", status="done", progress=1.0)


# ---------------------------------------------------------------------------
# Bake tests
# ---------------------------------------------------------------------------

class TestVoxtralBake:

    def test_bake_renders_only_missing_groups(self, tmp_path):
        """Bake must skip groups whose segment audio is already valid."""
        job = _make_job(is_bake=True)
        segs = _fake_segments()
        # Pre-bake s1.wav to simulate it's already done
        seg_dir = tmp_path / "segments"
        seg_dir.mkdir()
        (seg_dir / "s1.wav").write_bytes(b"existing")
        segs[0]["audio_status"] = "done"
        segs[0]["audio_file_path"] = "s1.wav"

        groups = _fake_groups(segs)

        rendered_ids = []

        def fake_bridge(**kwargs):
            script = kwargs.get("script") or []
            on_out = kwargs.get("on_output")
            for entry in script:
                rendered_ids.append(entry["id"])
                save_path = entry["save_path"]
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                Path(save_path).write_bytes(b"wav")
                if on_out:
                    on_out(f"[START_SEGMENT] {entry['id']}\n")
                    on_out(f"[SEGMENT_SAVED] {save_path}\n")
            return 0

        # Prepare fresh segs for stitch (all done)
        fresh_segs = [
            {**segs[0]},
            {"id": "s2", "text_content": "World.", "audio_status": "done", "audio_file_path": "s2.wav", "character_id": "c1", "speaker_profile_name": "VoiceA", "segment_order": 2},
            {"id": "s3", "text_content": "Bye.", "audio_status": "done", "audio_file_path": "s3.wav", "character_id": "c1", "speaker_profile_name": "VoiceA", "segment_order": 3},
        ]
        for sid in ["s2", "s3"]:
            (seg_dir / f"{sid}.wav").write_bytes(b"wav")

        out_wav = tmp_path / "chapter.wav"
        out_wav.write_bytes(b"stitched")  # pre-create so stitch succeeds

        with patch("plugins.tts_voxtral.plugin.studio.bake.generate_via_bridge", side_effect=fake_bridge), \
             patch("app.db.get_chapter_segments", side_effect=[segs, fresh_segs]), \
             patch("app.db.update_segment"), \
             patch("app.db.update_queue_item"), \
             patch("app.engines.audio_ops.stitch_segments", return_value=0), \
             patch("app.engines.audio_ops.get_audio_duration", return_value=10.0), \
             patch("plugins.tts_voxtral.plugin.studio.bake._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.bake._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            from plugins.tts_voxtral.plugin.studio.bake import handle_voxtral_bake
            rc = handle_voxtral_bake(
                "vx-job-1", job, 0.0,
                lambda line: None, lambda: False,
                tmp_path, out_wav, None, {}
            )

        assert rc == 0
        # s1 was already done — must not be re-rendered
        assert "s1" not in rendered_ids
        # s2, s3 missing — must be rendered
        assert "s2" in rendered_ids
        assert "s3" in rendered_ids

    def test_bake_stitches_all_done_segments(self, tmp_path):
        """After rendering, bake must stitch all done segments into the chapter WAV."""
        job = _make_job(is_bake=True)
        segs = _fake_segments()
        groups = _fake_groups(segs)

        seg_dir = tmp_path / "segments"
        seg_dir.mkdir()
        for sid in ["s1", "s2", "s3"]:
            (seg_dir / f"{sid}.wav").write_bytes(b"wav")

        # All done — no groups to render
        for s in segs:
            s["audio_status"] = "done"
            s["audio_file_path"] = f"{s['id']}.wav"

        out_wav = tmp_path / "chapter.wav"
        out_wav.write_bytes(b"stitched")

        stitch_calls = []

        with patch("app.db.get_chapter_segments", return_value=segs), \
             patch("app.db.update_queue_item"), \
             patch("app.engines.audio_ops.stitch_segments", side_effect=lambda *a, **kw: stitch_calls.append(a) or 0), \
             patch("app.engines.audio_ops.get_audio_duration", return_value=10.0), \
             patch("plugins.tts_voxtral.plugin.studio.bake._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.bake._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            from plugins.tts_voxtral.plugin.studio.bake import handle_voxtral_bake
            rc = handle_voxtral_bake(
                "vx-job-1", job, 0.0,
                lambda line: None, lambda: False,
                tmp_path, out_wav, None, {}
            )

        assert rc == 0
        assert stitch_calls, "stitch_segments must have been called"

    def test_bake_cancel_mid_bake_returns_nonzero(self, tmp_path):
        """Cancellation after render returns a non-zero code (no done update)."""
        job = _make_job(is_bake=True)
        segs = _fake_segments()
        groups = _fake_groups(segs)

        cancelled = [False]

        def fake_bridge(**kwargs):
            cancelled[0] = True  # cancel after first render
            script = kwargs.get("script") or []
            on_out = kwargs.get("on_output")
            for entry in script:
                save_path = entry["save_path"]
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                Path(save_path).write_bytes(b"wav")
                if on_out:
                    on_out(f"[START_SEGMENT] {entry['id']}\n")
                    on_out(f"[SEGMENT_SAVED] {save_path}\n")
            return 0

        def cancel_check():
            return cancelled[0]

        with patch("plugins.tts_voxtral.plugin.studio.bake.generate_via_bridge", side_effect=fake_bridge), \
             patch("app.db.get_chapter_segments", return_value=segs), \
             patch("app.db.update_segment"), \
             patch("plugins.tts_voxtral.plugin.studio.bake._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.bake._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            out_wav = tmp_path / "chapter.wav"

            from plugins.tts_voxtral.plugin.studio.bake import handle_voxtral_bake
            rc = handle_voxtral_bake(
                "vx-job-1", job, 0.0,
                lambda line: None, cancel_check,
                tmp_path, out_wav, None, {}
            )

        # Cancelled after render → non-zero return (stitch skipped)
        assert rc != 0

    def test_bake_bridge_failure_returns_nonzero_and_sets_failed(self, tmp_path):
        """A bridge error during bake synthesis must result in failed status."""
        from app.studio_plugin_sdk.errors import BridgeError

        job = _make_job(is_bake=True)
        segs = _fake_segments()
        groups = _fake_groups(segs)

        def fake_bridge(**kwargs):
            raise BridgeError("network error")

        with patch("plugins.tts_voxtral.plugin.studio.bake.generate_via_bridge", side_effect=fake_bridge), \
             patch("app.db.get_chapter_segments", return_value=segs), \
             patch("plugins.tts_voxtral.plugin.studio.bake._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.bake._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            out_wav = tmp_path / "chapter.wav"

            from plugins.tts_voxtral.plugin.studio.bake import handle_voxtral_bake
            rc = handle_voxtral_bake(
                "vx-job-1", job, 0.0,
                lambda line: None, lambda: False,
                tmp_path, out_wav, None, {}
            )

        assert rc == 1

    def test_bake_emits_start_and_saved_markers_in_order(self, tmp_path):
        """[START_SEGMENT] must precede [SEGMENT_SAVED] for each group."""
        job = _make_job(is_bake=True)
        segs = _fake_segments()
        groups = _fake_groups(segs)

        emitted = []

        def fake_bridge(**kwargs):
            on_out = kwargs.get("on_output")
            script = kwargs.get("script") or []
            for entry in script:
                save_path = entry["save_path"]
                Path(save_path).parent.mkdir(parents=True, exist_ok=True)
                Path(save_path).write_bytes(b"wav")
                if on_out:
                    on_out(f"[START_SEGMENT] {entry['id']}\n")
                    on_out(f"[SEGMENT_SAVED] {save_path}\n")
            return 0

        fresh_segs = [dict(s, audio_status="done", audio_file_path=f"{s['id']}.wav") for s in segs]
        seg_dir = tmp_path / "segments"
        seg_dir.mkdir()
        for sid in ["s1", "s2", "s3"]:
            (seg_dir / f"{sid}.wav").write_bytes(b"wav")

        out_wav = tmp_path / "chapter.wav"
        out_wav.write_bytes(b"stitched")

        with patch("plugins.tts_voxtral.plugin.studio.bake.generate_via_bridge", side_effect=fake_bridge), \
             patch("app.db.get_chapter_segments", side_effect=[segs, fresh_segs]), \
             patch("app.db.update_segment"), \
             patch("app.db.update_queue_item"), \
             patch("app.engines.audio_ops.stitch_segments", return_value=0), \
             patch("app.engines.audio_ops.get_audio_duration", return_value=10.0), \
             patch("plugins.tts_voxtral.plugin.studio.bake._get_ctx") as mock_ctx_factory, \
             patch("plugins.tts_voxtral.plugin.studio.bake._handler") as mock_handler_factory:

            ctx = MagicMock()
            ctx.get_sanitize_categories.return_value = []
            ctx.build_chunk_groups.return_value = groups
            mock_ctx_factory.return_value = ctx

            h = MagicMock()
            mock_handler_factory.return_value = h

            from plugins.tts_voxtral.plugin.studio.bake import handle_voxtral_bake
            handle_voxtral_bake(
                "vx-job-1", job, 0.0,
                emitted.append, lambda: False,
                tmp_path, out_wav, None, {}
            )

        start_markers = [i for i, line in enumerate(emitted) if "[START_SEGMENT]" in line]
        saved_markers = [i for i, line in enumerate(emitted) if "[SEGMENT_SAVED]" in line]
        assert start_markers and saved_markers
        for start_i, saved_i in zip(start_markers, saved_markers):
            assert start_i < saved_i, "Each [START_SEGMENT] must precede its [SEGMENT_SAVED]"


# ---------------------------------------------------------------------------
# Handler routing tests
# ---------------------------------------------------------------------------

class TestHandlerRouting:

    def test_handler_routes_segment_ids_job_to_segment_handler(self, tmp_path):
        """handle_voxtral_job with segment_ids must delegate to handle_voxtral_segments."""
        job = _make_job(segment_ids=["s1"])

        with patch("plugins.tts_voxtral.plugin.studio.handler.get_chapter_dir", return_value=tmp_path), \
             patch("plugins.tts_voxtral.plugin.studio.handler.get_speaker_settings", return_value={}), \
             patch("plugins.tts_voxtral.plugin.studio.handler._chapter_uses_multiple_profiles", return_value=False), \
             patch("plugins.tts_voxtral.plugin.studio.handler.handle_voxtral_segments", return_value=0) as mock_seg, \
             patch("plugins.tts_voxtral.plugin.studio.handler.handle_voxtral_bake") as mock_bake, \
             patch("plugins.tts_voxtral.plugin.studio.handler.update_job"), \
             patch("plugins.tts_voxtral.plugin.studio.handler._get_ctx") as mock_ctx_f:

            ctx = MagicMock()
            ctx.get_voice_profile_dir.return_value = str(tmp_path)
            mock_ctx_f.return_value = ctx

            from plugins.tts_voxtral.plugin.studio.handler import handle_voxtral_job
            result = handle_voxtral_job("vx-job-1", job, 0.0, lambda _: None, lambda: False)

        assert result == "done"
        mock_seg.assert_called_once()
        mock_bake.assert_not_called()

    def test_handler_routes_bake_job_to_bake_handler(self, tmp_path):
        """handle_voxtral_job with is_bake=True must delegate to handle_voxtral_bake."""
        job = _make_job(is_bake=True, chapter_file="chapter.txt")

        with patch("plugins.tts_voxtral.plugin.studio.handler.get_chapter_dir", return_value=tmp_path), \
             patch("plugins.tts_voxtral.plugin.studio.handler.get_speaker_settings", return_value={}), \
             patch("plugins.tts_voxtral.plugin.studio.handler._chapter_uses_multiple_profiles", return_value=False), \
             patch("plugins.tts_voxtral.plugin.studio.handler.handle_voxtral_segments") as mock_seg, \
             patch("plugins.tts_voxtral.plugin.studio.handler.handle_voxtral_bake", return_value=0) as mock_bake, \
             patch("plugins.tts_voxtral.plugin.studio.handler.update_job"), \
             patch("plugins.tts_voxtral.plugin.studio.handler._get_ctx") as mock_ctx_f:

            ctx = MagicMock()
            ctx.get_voice_profile_dir.return_value = str(tmp_path)
            mock_ctx_f.return_value = ctx

            from plugins.tts_voxtral.plugin.studio.handler import handle_voxtral_job
            result = handle_voxtral_job("vx-job-1", job, 0.0, lambda _: None, lambda: False)

        assert result == "done"
        mock_bake.assert_called_once()
        mock_seg.assert_not_called()


# ---------------------------------------------------------------------------
# Mid-stream cancel guard tests: bake and segments handlers (R1-verified)
# ---------------------------------------------------------------------------

def _run_voxtral_bake_with_straggler_save(tmp_path, cancelled):
    """Drive handle_voxtral_bake with a single unprocessed segment, firing a
    straggler [SEGMENT_SAVED] from generate_via_bridge while the render's cancel
    flag is `cancelled`. Returns done-writes (segment_id, kwargs) pairs where
    audio_status='done'."""
    pdir = tmp_path / "project"
    pdir.mkdir()
    (pdir / "segments").mkdir(parents=True, exist_ok=True)
    out_wav = pdir / "output.wav"

    segs = [{"id": "b1", "text_content": "Bake text.", "audio_status": "unprocessed",
             "audio_file_path": None, "character_id": "c1",
             "speaker_profile_name": "VoiceA", "segment_order": 1}]
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

    job = _make_job(is_bake=True)

    mock_ctx = MagicMock()
    mock_ctx.get_sanitize_categories.return_value = []
    mock_ctx.build_chunk_groups.return_value = groups

    with patch("plugins.tts_voxtral.plugin.studio.bake._get_ctx", return_value=mock_ctx), \
         patch("plugins.tts_voxtral.plugin.studio.bake.get_chapter_segments", return_value=segs), \
         patch("plugins.tts_voxtral.plugin.studio.bake.update_segment", side_effect=capture_update_segment), \
         patch("plugins.tts_voxtral.plugin.studio.bake.generate_via_bridge", side_effect=generate_side_effect), \
         patch("plugins.tts_voxtral.plugin.studio.bake._handler") as mock_handler_factory:

        h = MagicMock()
        mock_handler_factory.return_value = h

        handle_voxtral_bake(
            "bake-jid", job, time.time(),
            lambda line: None, lambda: cancel_flag["v"],
            pdir, out_wav, None, {},
        )
    return done_writes


def test_cancelled_voxtral_bake_does_not_remark_segment_done(tmp_path):
    """A cancelled voxtral bake render must not write segment audio_status='done' on a
    straggler [SEGMENT_SAVED]. R1: before the `and not cancel_check()` guard this FAILS."""
    done_writes = _run_voxtral_bake_with_straggler_save(tmp_path, cancelled=True)
    assert not done_writes, (
        f"cancelled voxtral bake re-marked segments done on a straggler save: {done_writes}"
    )


def test_active_voxtral_bake_marks_segment_done(tmp_path):
    """Control: a non-cancelled voxtral bake render still marks its saved segment done,
    proving the straggler save reaches the write and the guard is meaningful."""
    done_writes = _run_voxtral_bake_with_straggler_save(tmp_path, cancelled=False)
    assert done_writes, "expected a non-cancelled voxtral bake render to mark its saved segment done"


def _run_voxtral_segments_with_straggler_save(tmp_path, cancelled):
    """Drive handle_voxtral_segments with a single targeted segment, firing a
    straggler [SEGMENT_SAVED] from generate_via_bridge while the render's cancel
    flag is `cancelled`. Returns done-writes (segment_id, kwargs) pairs where
    audio_status='done'."""
    pdir = tmp_path / "project"
    pdir.mkdir()
    (pdir / "segments").mkdir(parents=True, exist_ok=True)

    segs = [{"id": "s1", "text_content": "Seg text.", "audio_status": "unprocessed",
             "audio_file_path": None, "character_id": "c1",
             "speaker_profile_name": "VoiceA", "segment_order": 1}]
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
            seg_path = str((pdir / "segments" / "s1.wav").absolute())
            on_output(f"[SEGMENT_SAVED] {seg_path}")
        return 1  # rc=1 stops the handler before the success path

    job = _make_job(segment_ids=["s1"])

    mock_ctx = MagicMock()
    mock_ctx.get_text_chunk_limit.return_value = 500
    mock_ctx.get_sanitize_categories.return_value = []
    mock_ctx.build_chunk_groups.return_value = groups
    mock_ctx.broadcast_segments_updated.return_value = None
    mock_ctx.get_chapter_segments_counts.return_value = (0, 1)

    with patch("plugins.tts_voxtral.plugin.studio.segments._get_ctx", return_value=mock_ctx), \
         patch("plugins.tts_voxtral.plugin.studio.segments.get_chapter_segments", return_value=segs), \
         patch("plugins.tts_voxtral.plugin.studio.segments.update_segment", side_effect=capture_update_segment), \
         patch("plugins.tts_voxtral.plugin.studio.segments.generate_via_bridge", side_effect=generate_side_effect), \
         patch("plugins.tts_voxtral.plugin.studio.segments._handler") as mock_handler_factory:

        h = MagicMock()
        mock_handler_factory.return_value = h

        handle_voxtral_segments(
            "seg-jid", job, time.time(),
            lambda line: None, lambda: cancel_flag["v"],
            pdir, None, {},
        )
    return done_writes


def test_cancelled_voxtral_segments_does_not_remark_segment_done(tmp_path):
    """A cancelled voxtral segments render must not write segment audio_status='done' on a
    straggler [SEGMENT_SAVED]. R1: before the `and not cancel_check()` guard this FAILS."""
    done_writes = _run_voxtral_segments_with_straggler_save(tmp_path, cancelled=True)
    assert not done_writes, (
        f"cancelled voxtral segments render re-marked segments done on a straggler save: {done_writes}"
    )


def test_active_voxtral_segments_marks_segment_done(tmp_path):
    """Control: a non-cancelled voxtral segments render still marks its saved segment done,
    proving the straggler save reaches the write and the guard is meaningful."""
    done_writes = _run_voxtral_segments_with_straggler_save(tmp_path, cancelled=False)
    assert done_writes, "expected a non-cancelled voxtral segments render to mark its saved segment done"
