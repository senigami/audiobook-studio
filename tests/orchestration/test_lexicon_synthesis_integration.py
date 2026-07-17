"""Integration tests: lexicon applied in synthesis text prep.

TDD: written before implementation.

R1 contract:
- test_lexicon_applied_to_mixed_segment_text: must fail before integration.
- test_empty_lexicon_leaves_text_unchanged: must pass before AND after (zero-impact).
- test_lexicon_applied_to_remote_synthesis_task: must fail before integration.

Mocked boundaries: TTS engine / bridge (outside the unit under test).
Real: DB, apply_lexicon, synthesis task text prep path.
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path

from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db import lexicon as lexicon_mod
from app.orchestration.tasks.synthesis import SynthesisTask


# ---------------------------------------------------------------------------
# Helper: build a minimal SynthesisTask for the remote path
# ---------------------------------------------------------------------------

def _make_synthesis_task(project_id, script_text="Hello world."):
    return SynthesisTask(
        task_id="test-task-1",
        engine_id="xtts",
        script_text=script_text,
        output_path="/tmp/test_out.wav",
        project_id=project_id,
        chapter_id=None,
    )


# ---------------------------------------------------------------------------
# Remote path: SynthesisTask.to_bridge_request() applies lexicon
# ---------------------------------------------------------------------------

class TestRemoteSynthesisLexiconIntegration:
    def test_lexicon_applied_to_remote_synthesis_task(self, clean_storage):
        """When project has lexicon entries, to_bridge_request() applies them to script_text."""
        pid = create_project("MyBook")
        lexicon_mod.add_lexicon_entry(pid, "hello", "greetings")

        task = _make_synthesis_task(pid, "hello world.")
        request = task.to_bridge_request()

        # The text in the bridge request must have the substitution applied
        assert request["script_text"] == "greetings world."

    def test_empty_lexicon_leaves_text_unchanged(self, clean_storage):
        """CRITICAL INVARIANT: zero entries → text is byte-identical."""
        pid = create_project("MyBook")
        original = "Hello world."

        task = _make_synthesis_task(pid, original)
        request = task.to_bridge_request()

        assert request["script_text"] == original

    def test_no_project_id_leaves_text_unchanged(self, clean_storage):
        """Tasks without project_id must not crash and must not alter text."""
        original = "Hello world."
        task = SynthesisTask(
            task_id="t2",
            engine_id="xtts",
            script_text=original,
            output_path="/tmp/t2.wav",
            project_id=None,
            chapter_id=None,
        )
        request = task.to_bridge_request()
        assert request["script_text"] == original

    def test_mixed_engine_returns_none_from_to_bridge_request(self, clean_storage):
        """Mixed engine must still return None from to_bridge_request() after integration."""
        pid = create_project("MyBook")
        lexicon_mod.add_lexicon_entry(pid, "hello", "greetings")
        task = SynthesisTask(
            task_id="t3",
            engine_id="mixed",
            script_text="hello world.",
            output_path="/tmp/t3.wav",
            project_id=pid,
            chapter_id=None,
        )
        # Mixed engine to_bridge_request must still return None (no change to contract)
        assert task.to_bridge_request() is None


# ---------------------------------------------------------------------------
# Mixed engine path: _render_segment text is lexicon-substituted
# ---------------------------------------------------------------------------

class TestMixedSynthesisLexiconIntegration:
    """Tests the mixed-engine handler path via a mock of the bridge call."""

    def _make_job(self, project_id, chapter_id):
        from app.db.models import Job
        return Job(
            id="test-job-1",
            engine="mixed",
            status="running",
            created_at=0.0,
            project_id=project_id,
            chapter_id=chapter_id,
            chapter_file="chapter.wav",
            speaker_profile="default_voice",
            safe_mode=False,
            make_mp3=False,
            is_bake=False,
            segment_ids=None,
            custom_title=None,
        )

    def test_lexicon_applied_to_mixed_segment_text(self, clean_storage, tmp_path):
        """Lexicon entries are substituted into chunk_text before _render_segment."""
        pid = create_project("MixedBook")
        cid = create_chapter(pid, "Chapter One", text_content="The cat sat on the mat.")
        lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")

        rendered_texts = []

        # Patch _render_segment to capture the text it receives
        import tts_engines.tts_mixed.handler as handler_mod

        original_render = handler_mod._render_segment

        def mock_render(engine_id, text, profile_name, out_wav, safe_mode, on_output, cancel_check, task_id=None):
            rendered_texts.append(text)
            # Write a stub wav so the handler doesn't fail on file-not-found
            out_wav.parent.mkdir(parents=True, exist_ok=True)
            out_wav.write_bytes(b"RIFF" + b"\x00" * 36)
            return 0

        j = self._make_job(pid, cid)

        from app.db.segments import sync_chapter_segments

        # Sync segments from chapter text (sync_chapter_segments expects a string)
        sync_chapter_segments(cid, "The cat sat on the mat.")

        pdir = tmp_path / "chapters" / pid / cid
        pdir.mkdir(parents=True, exist_ok=True)

        with patch.object(handler_mod, "_render_segment", side_effect=mock_render), \
             patch.object(handler_mod, "get_chapter_dir", return_value=pdir), \
             patch.object(handler_mod, "update_job"), \
             patch.object(handler_mod, "broadcast_segments_updated"), \
             patch.object(handler_mod, "update_segment"), \
             patch.object(handler_mod, "update_segments_bulk"), \
             patch.object(handler_mod, "clear_duplicate_segment_audio_paths"), \
             patch.object(handler_mod, "get_audio_duration", return_value=5.0), \
             patch.object(handler_mod, "update_chapter"), \
             patch.object(handler_mod, "stitch_segments"):
            handler_mod.handle_mixed_job(
                jid="test-job-1",
                j=j,
                start=0.0,
                on_output=lambda line: None,
                cancel_check=lambda: False,
            )

        assert len(rendered_texts) > 0, "mock_render was never called"
        # At least one rendered segment must have the substituted text
        combined = " ".join(rendered_texts)
        assert "kitten" in combined, f"Expected 'kitten' in rendered texts, got: {rendered_texts}"
        assert "cat" not in combined.replace("kitten", ""), "Non-substituted 'cat' remains"

    def test_empty_lexicon_does_not_alter_mixed_segment_text(self, clean_storage, tmp_path):
        """CRITICAL INVARIANT: zero lexicon entries → text passed to _render_segment is unchanged."""
        pid = create_project("MixedBook")
        cid = create_chapter(pid, "Chapter One", text_content="The cat sat on the mat.")
        # No lexicon entries added

        rendered_texts = []

        import tts_engines.tts_mixed.handler as handler_mod

        def mock_render(engine_id, text, profile_name, out_wav, safe_mode, on_output, cancel_check, task_id=None):
            rendered_texts.append(text)
            out_wav.parent.mkdir(parents=True, exist_ok=True)
            out_wav.write_bytes(b"RIFF" + b"\x00" * 36)
            return 0

        j = self._make_job(pid, cid)

        from app.db.segments import sync_chapter_segments
        sync_chapter_segments(cid, "The cat sat on the mat.")

        pdir = tmp_path / "chapters" / pid / cid
        pdir.mkdir(parents=True, exist_ok=True)

        with patch.object(handler_mod, "_render_segment", side_effect=mock_render), \
             patch.object(handler_mod, "get_chapter_dir", return_value=pdir), \
             patch.object(handler_mod, "update_job"), \
             patch.object(handler_mod, "broadcast_segments_updated"), \
             patch.object(handler_mod, "update_segment"), \
             patch.object(handler_mod, "update_segments_bulk"), \
             patch.object(handler_mod, "clear_duplicate_segment_audio_paths"), \
             patch.object(handler_mod, "get_audio_duration", return_value=5.0), \
             patch.object(handler_mod, "update_chapter"), \
             patch.object(handler_mod, "stitch_segments"):
            handler_mod.handle_mixed_job(
                jid="test-job-1",
                j=j,
                start=0.0,
                on_output=lambda line: None,
                cancel_check=lambda: False,
            )

        assert len(rendered_texts) > 0, "mock_render was never called"
        combined = " ".join(rendered_texts)
        # "cat" must still be present (not altered when no lexicon entries exist)
        assert "cat" in combined
