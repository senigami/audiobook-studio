"""Tests for force_rerender flag in handle_xtts_standard.

R1 revert-checked: each test was confirmed to FAIL on pre-fix code (before
the `if getattr(j, "force_rerender", False): return False` guard was added)
and PASSES with the fix in place.
"""
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.db.models import Job
from plugins.tts_xtts.plugin.studio.handler import handle_xtts_job


def _make_job(force_rerender: bool = False) -> Job:
    return Job(
        id="test-rebuild-job",
        engine="xtts",
        chapter_file="chapter.txt",
        chapter_id="chap-rebuild-1",
        status="running",
        is_bake=False,
        segment_ids=None,
        safe_mode=False,
        make_mp3=False,
        speaker_profile="Narrator",
        created_at=time.time(),
        force_rerender=force_rerender,
    )


# One segment already "done" with its wav file present on disk.
_DONE_SEG = {
    "id": "seg-001",
    "text_content": "Hello world.",
    "character_id": "char-1",
    "speaker_profile_name": "Narrator",
    "character_speaker_profile_name": "Narrator",
    "audio_status": "done",
    "audio_file_path": "seg-001.wav",
}


class TestForceRerenderFlag:
    """_group_is_done must respect force_rerender on the Job."""

    def test_force_rerender_true_synthesizes_despite_done_segment(self, tmp_path: Path) -> None:
        """When force_rerender=True, the handler must call generate_via_bridge with a
        non-empty script — it must NOT skip the group even though the segment wav exists."""
        pdir = tmp_path / "chapter"
        pdir.mkdir()
        seg_dir = pdir / "segments"
        seg_dir.mkdir()
        # Place the pre-existing wav so _group_is_done would normally return True
        (seg_dir / "seg-001.wav").write_bytes(b"fake-audio")

        out_wav = pdir / "chapter.wav"
        out_mp3 = pdir / "chapter.mp3"
        j = _make_job(force_rerender=True)
        captured_scripts: list = []

        def capture_generate(**kwargs):
            captured_scripts.append(kwargs.get("script", []))
            return 0

        with patch(
            "plugins.tts_xtts.plugin.studio.handler.load_chunk_segments",
            return_value=[_DONE_SEG],
        ), patch(
            "plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge",
            side_effect=capture_generate,
        ), patch(
            "plugins.tts_xtts.plugin.studio.handler.update_job"
        ), patch(
            "plugins.tts_xtts.plugin.studio.handler.stitch_segments",
            return_value=0,
        ), patch(
            "plugins.tts_xtts.plugin.studio.handler.get_speaker_wavs",
            return_value="spk.wav",
        ), patch(
            "app.db.update_segment"
        ):
            handle_xtts_job(
                jid=j.id,
                j=j,
                start=time.time(),
                on_output=MagicMock(),
                cancel_check=lambda: False,
                default_sw="default.wav",
                speed=1.0,
                pdir=pdir,
                out_wav=out_wav,
                out_mp3=out_mp3,
                text="Hello world.",
            )

        assert captured_scripts, "generate_via_bridge must be called (synthesis must occur)"
        assert len(captured_scripts[0]) > 0, (
            "script passed to generate_via_bridge must be non-empty; "
            "the done segment must NOT have been skipped when force_rerender=True"
        )

    def test_force_rerender_false_reuses_done_segment(self, tmp_path: Path) -> None:
        """When force_rerender=False (default), a done segment with its wav present
        must be reused — generate_via_bridge receives an empty script."""
        pdir = tmp_path / "chapter"
        pdir.mkdir()
        seg_dir = pdir / "segments"
        seg_dir.mkdir()
        (seg_dir / "seg-001.wav").write_bytes(b"fake-audio")

        out_wav = pdir / "chapter.wav"
        out_mp3 = pdir / "chapter.mp3"
        j = _make_job(force_rerender=False)
        captured_scripts: list = []

        def capture_generate(**kwargs):
            captured_scripts.append(kwargs.get("script", []))
            return 0

        with patch(
            "plugins.tts_xtts.plugin.studio.handler.load_chunk_segments",
            return_value=[_DONE_SEG],
        ), patch(
            "plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge",
            side_effect=capture_generate,
        ), patch(
            "plugins.tts_xtts.plugin.studio.handler.update_job"
        ), patch(
            "plugins.tts_xtts.plugin.studio.handler.stitch_segments",
            return_value=0,
        ), patch(
            "plugins.tts_xtts.plugin.studio.handler.get_speaker_wavs",
            return_value="spk.wav",
        ), patch(
            "app.db.update_segment"
        ):
            handle_xtts_job(
                jid=j.id,
                j=j,
                start=time.time(),
                on_output=MagicMock(),
                cancel_check=lambda: False,
                default_sw="default.wav",
                speed=1.0,
                pdir=pdir,
                out_wav=out_wav,
                out_mp3=out_mp3,
                text="Hello world.",
            )

        # generate_via_bridge is still called (handler always calls it) but
        # the script list must be empty — the done group was reused.
        assert captured_scripts, "generate_via_bridge should still be invoked"
        assert captured_scripts[0] == [], (
            "script must be empty when force_rerender=False and segment is already done"
        )


class TestForceRerenderBakePath:
    """handle_xtts_bake's _group_needs_render must respect force_rerender.

    R1: before the `if getattr(j, "force_rerender", False): return True` guard in
    bake._group_needs_render, a done group is skipped even on a rebuild.
    """

    def _run_bake(self, tmp_path: Path, force_rerender: bool):
        from plugins.tts_xtts.plugin.studio.bake import handle_xtts_bake

        pdir = tmp_path / "chapter"
        pdir.mkdir()
        seg_dir = pdir / "segments"
        seg_dir.mkdir()
        # s1 already rendered + done — normally reused.
        (seg_dir / "seg-001.wav").write_bytes(b"existing")
        out_wav = pdir / "chapter.wav"

        segs = [dict(_DONE_SEG)]
        groups = [{"segments": segs, "profile_name": "Narrator"}]
        rendered_ids: list = []

        def capture_generate(**kwargs):
            for entry in kwargs.get("script") or []:
                rendered_ids.append(entry["id"])
                sp = entry["save_path"]
                Path(sp).parent.mkdir(parents=True, exist_ok=True)
                Path(sp).write_bytes(b"wav")
            return 0

        j = _make_job(force_rerender=force_rerender)
        j.is_bake = True

        ctx = MagicMock()
        ctx.get_text_chunk_limit.return_value = 500
        ctx.build_chunk_groups.return_value = groups

        with patch("plugins.tts_xtts.plugin.studio.bake._get_ctx", return_value=ctx), \
             patch("plugins.tts_xtts.plugin.studio.bake.get_chapter_segments", side_effect=[segs, segs]), \
             patch("plugins.tts_xtts.plugin.studio.bake.update_segment"), \
             patch("plugins.tts_xtts.plugin.studio.bake.update_queue_item"), \
             patch("plugins.tts_xtts.plugin.studio.bake.generate_via_bridge", side_effect=capture_generate), \
             patch("plugins.tts_xtts.plugin.studio.bake._profile_inputs_for_segment", return_value=("spk.wav", None)), \
             patch("plugins.tts_xtts.plugin.studio.bake._handler") as mock_handler_factory:
            h = MagicMock()
            h.stitch_segments.return_value = 0
            h.get_audio_duration.return_value = 10.0
            mock_handler_factory.return_value = h
            handle_xtts_bake(
                j.id, j, time.time(),
                MagicMock(), lambda: False,
                "default.wav", 1.0, pdir, out_wav,
            )
        return rendered_ids

    def test_force_rerender_true_rerenders_done_group(self, tmp_path: Path) -> None:
        rendered_ids = self._run_bake(tmp_path, force_rerender=True)
        assert "seg-001" in rendered_ids, (
            "force_rerender=True must re-synthesize the done group in the bake path"
        )

    def test_force_rerender_false_reuses_done_group(self, tmp_path: Path) -> None:
        rendered_ids = self._run_bake(tmp_path, force_rerender=False)
        assert "seg-001" not in rendered_ids, (
            "force_rerender=False must reuse the already-done group in the bake path"
        )
