"""Integration tests: xtts render paths apply the project lexicon.

R2 contract: mocks only the engine/network boundary (generate_via_bridge)
and the DB read/write layer (update_segment, get_chapter_segments, update_job).
The lexicon load (get_project_lexicon) and application (apply_project_lexicon)
are real — they go through the actual module-level aliases, which in turn call
the real apply_lexicon pure function.

Revert-check (R1): the substitution assertions FAIL on the pre-fix code because
xtts never called get_project_lexicon or apply_project_lexicon.

Import note: we always import the module under test through handle_xtts_job
(i.e. via the handler module) because helpers.py imports handler at body level
creating a cycle that only resolves cleanly when handler is the root import.
"""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.db.models import Job

# Force the xtts studio module chain to be imported in the correct order
# by importing via the handler (which is the root of the cycle).
from tts_engines.tts_xtts.plugin.studio import handler as _xtts_handler  # noqa: F401
from tts_engines.tts_xtts.plugin.studio import bake as _bake_mod
from tts_engines.tts_xtts.plugin.studio import segments as _seg_mod
from tts_engines.tts_xtts.plugin.studio import standard_handler as _std_mod


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_job(chapter_id, project_id, *, segment_ids=None, is_bake=False):
    return Job(
        id="xtts-lex-job",
        engine="xtts",
        chapter_file=f"{chapter_id}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=project_id,
        chapter_id=chapter_id,
        speaker_profile="TestVoice",
        segment_ids=segment_ids,
        is_bake=is_bake,
        safe_mode=False,  # disable sanitize so the only text transform is the lexicon
    )


LEXICON_ENTRIES = [{"word": "SQL", "replacement": "sequel"}]


# ===========================================================================
# Standard handler (handle_xtts_standard)
# ===========================================================================

class TestXttsStandardLexicon:
    """Tests for plugins.tts_xtts.plugin.studio.standard_handler lexicon path."""

    def _run(self, project_id, lexicon_entries, text="SQL is fast."):
        sh = _std_mod
        job = _make_job("chap1", project_id)

        captured_scripts = []

        def fake_bridge(**kwargs):
            if kwargs.get("script"):
                captured_scripts.extend(kwargs["script"])
            # Do NOT write to disk — Path.exists is patched to return True,
            # and Path.unlink is patched out too.
            return 0

        mock_ctx = MagicMock()
        mock_ctx.get_text_chunk_limit.return_value = 500
        mock_ctx.get_sanitize_categories.return_value = []
        mock_ctx.sanitize_text.side_effect = lambda t, *_: t
        mock_ctx.build_chunk_groups.return_value = [
            {
                "segments": [{"id": "s1", "text_content": text, "audio_status": "unprocessed", "audio_file_path": None}],
                "profile_name": "TestVoice",
                "text_parts": [text],
                "engine": "xtts",
            }
        ]

        mock_handler = MagicMock()
        mock_handler.get_speaker_wavs.return_value = "ref.wav"
        mock_handler.get_voice_profile_dir.return_value = None
        mock_handler.load_chunk_segments.return_value = [
            {"id": "s1", "text_content": text, "audio_status": "unprocessed", "audio_file_path": None}
        ]

        pdir = Path("/tmp/xtts_lex_std")
        out_wav = pdir / "chapter.wav"

        with patch.object(sh, "_get_ctx", return_value=mock_ctx), \
             patch.object(sh, "_handler", return_value=mock_handler), \
             patch.object(sh, "get_project_lexicon", return_value=lexicon_entries), \
             patch.object(sh, "generate_via_bridge", side_effect=fake_bridge), \
             patch.object(sh, "update_segment"), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.mkdir"), \
             patch("pathlib.Path.unlink"):
            sh.handle_xtts_standard(
                "xtts-lex-job", job, time.time(),
                lambda _: None, lambda: False,
                "ref.wav", 1.0, pdir, out_wav, text=text,
            )

        return captured_scripts

    def test_lexicon_substitution_applied_in_standard_handler(self):
        """When lexicon has entries the rendered script text is substituted."""
        scripts = self._run("proj1", LEXICON_ENTRIES, text="SQL is fast.")
        assert scripts, "generate_via_bridge was never called with a script"
        rendered_texts = [entry["text"] for entry in scripts]
        assert all("sequel" in t for t in rendered_texts), (
            f"Expected 'sequel' in rendered text but got: {rendered_texts}"
        )
        assert not any("SQL" in t for t in rendered_texts), (
            f"'SQL' should have been replaced in all chunks, got: {rendered_texts}"
        )

    def test_empty_lexicon_leaves_text_unchanged_in_standard_handler(self):
        """Zero-impact invariant: empty lexicon → text is byte-identical."""
        scripts = self._run("proj1", [], text="SQL is fast.")
        rendered_texts = [entry["text"] for entry in scripts]
        assert all("SQL" in t for t in rendered_texts), (
            f"Empty lexicon changed the text unexpectedly: {rendered_texts}"
        )


# ===========================================================================
# Bake handler (handle_xtts_bake)
# ===========================================================================

class TestXttsBakeLexicon:
    """Tests for plugins.tts_xtts.plugin.studio.bake lexicon path."""

    def _run(self, project_id, lexicon_entries, text="SQL is fast."):
        bk = _bake_mod
        job = _make_job("chap1", project_id, is_bake=True)

        captured_scripts = []

        def fake_bridge(**kwargs):
            if kwargs.get("script"):
                captured_scripts.extend(kwargs["script"])
            return 0

        segs = [{"id": "s1", "text_content": text, "audio_status": "unprocessed",
                 "audio_file_path": None, "character_id": "c1"}]
        groups = [{"segments": segs, "profile_name": "TestVoice"}]

        mock_ctx = MagicMock()
        mock_ctx.get_text_chunk_limit.return_value = 500
        mock_ctx.sanitize_text.side_effect = lambda t, *_: t
        mock_ctx.build_chunk_groups.return_value = groups

        mock_handler = MagicMock()

        pdir = Path("/tmp/xtts_lex_bake")
        out_wav = pdir / "chapter.wav"

        with patch.object(bk, "_get_ctx", return_value=mock_ctx), \
             patch.object(bk, "_handler", return_value=mock_handler), \
             patch.object(bk, "get_chapter_segments", return_value=segs), \
             patch.object(bk, "get_project_lexicon", return_value=lexicon_entries), \
             patch.object(bk, "generate_via_bridge", side_effect=fake_bridge), \
             patch.object(bk, "update_segment"), \
             patch("tts_engines.tts_xtts.plugin.studio.helpers._profile_inputs_for_segment",
                   return_value=("ref.wav", None)), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.mkdir"), \
             patch("pathlib.Path.unlink"):
            bk.handle_xtts_bake(
                "xtts-lex-job", job, time.time(),
                lambda _: None, lambda: False,
                "ref.wav", 1.0, pdir, out_wav,
            )

        return captured_scripts

    def test_lexicon_substitution_applied_in_bake_handler(self):
        """When lexicon has entries the rendered script text is substituted."""
        scripts = self._run("proj1", LEXICON_ENTRIES, text="SQL is fast.")
        assert scripts, "generate_via_bridge was never called with a script"
        rendered_texts = [entry["text"] for entry in scripts]
        assert all("sequel" in t for t in rendered_texts), (
            f"Expected 'sequel' in rendered text but got: {rendered_texts}"
        )

    def test_empty_lexicon_leaves_text_unchanged_in_bake_handler(self):
        """Zero-impact invariant: empty lexicon → text is byte-identical."""
        scripts = self._run("proj1", [], text="SQL is fast.")
        rendered_texts = [entry["text"] for entry in scripts]
        assert all("SQL" in t for t in rendered_texts), (
            f"Empty lexicon changed the text unexpectedly: {rendered_texts}"
        )


# ===========================================================================
# Segments handler (handle_xtts_segments)
# ===========================================================================

class TestXttsSegmentsLexicon:
    """Tests for plugins.tts_xtts.plugin.studio.segments lexicon path."""

    def _run(self, project_id, lexicon_entries, text="SQL is fast."):
        seg = _seg_mod
        job = _make_job("chap1", project_id, segment_ids=["s1"])

        captured_scripts = []

        def fake_bridge(**kwargs):
            if kwargs.get("script"):
                captured_scripts.extend(kwargs["script"])
            return 0

        segs = [{"id": "s1", "text_content": text, "audio_status": "unprocessed",
                 "audio_file_path": None, "character_id": "c1",
                 "speaker_profile_name": "TestVoice"}]

        mock_ctx = MagicMock()
        mock_ctx.get_text_chunk_limit.return_value = 500
        mock_ctx.sanitize_text.side_effect = lambda t, *_: t
        mock_ctx.broadcast_segments_updated.return_value = None
        mock_ctx.get_chapter_segments_counts.return_value = (1, 1)

        mock_handler = MagicMock()

        pdir = Path("/tmp/xtts_lex_seg")

        with patch.object(seg, "_get_ctx", return_value=mock_ctx), \
             patch.object(seg, "_handler", return_value=mock_handler), \
             patch.object(seg, "get_chapter_segments", return_value=segs), \
             patch.object(seg, "get_project_lexicon", return_value=lexicon_entries), \
             patch.object(seg, "generate_via_bridge", side_effect=fake_bridge), \
             patch.object(seg, "update_segment"), \
             patch("tts_engines.tts_xtts.plugin.studio.helpers._profile_inputs_for_segment",
                   return_value=("ref.wav", None)), \
             patch("tts_engines.tts_xtts.plugin.studio._text_utils.join_group_text",
                   side_effect=lambda grp: " ".join(s["text_content"] for s in grp)), \
             patch("tts_engines.tts_xtts.plugin.studio._text_utils.build_segment_groups",
                   side_effect=lambda segs_to_gen, _all, _limit: [segs_to_gen]), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.mkdir"), \
             patch("pathlib.Path.unlink"):
            seg.handle_xtts_segments(
                "xtts-lex-job", job, time.time(),
                lambda _: None, lambda: False,
                "ref.wav", 1.0, pdir,
            )

        return captured_scripts

    def test_lexicon_substitution_applied_in_segments_handler(self):
        """When lexicon has entries the rendered script text is substituted."""
        scripts = self._run("proj1", LEXICON_ENTRIES, text="SQL is fast.")
        assert scripts, "generate_via_bridge was never called with a script"
        rendered_texts = [entry["text"] for entry in scripts]
        assert all("sequel" in t for t in rendered_texts), (
            f"Expected 'sequel' in rendered text but got: {rendered_texts}"
        )

    def test_empty_lexicon_leaves_text_unchanged_in_segments_handler(self):
        """Zero-impact invariant: empty lexicon → text is byte-identical."""
        scripts = self._run("proj1", [], text="SQL is fast.")
        rendered_texts = [entry["text"] for entry in scripts]
        assert all("SQL" in t for t in rendered_texts), (
            f"Empty lexicon changed the text unexpectedly: {rendered_texts}"
        )
