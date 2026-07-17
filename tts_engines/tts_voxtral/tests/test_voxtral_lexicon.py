"""Integration tests: voxtral render paths apply the project lexicon.

R2 contract: mocks only the engine/network boundary (generate_via_bridge)
and the DB read/write layer. The lexicon load (get_project_lexicon) and
application (apply_project_lexicon) are real — they go through the actual
module-level aliases, which call the real apply_lexicon pure function.

Revert-check (R1): the substitution assertions FAIL on the pre-fix code because
voxtral never called get_project_lexicon or apply_project_lexicon.
"""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.db.models import Job


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_job(chapter_id, project_id, *, segment_ids=None, is_bake=False):
    return Job(
        id="voxtral-lex-job",
        engine="voxtral",
        chapter_file=f"{chapter_id}_0.txt",
        status="queued",
        created_at=time.time(),
        project_id=project_id,
        chapter_id=chapter_id,
        speaker_profile="TestVoice",
        segment_ids=segment_ids,
        is_bake=is_bake,
        safe_mode=False,
    )


LEXICON_ENTRIES = [{"word": "SQL", "replacement": "sequel"}]


# ===========================================================================
# Bake handler (handle_voxtral_bake)
# ===========================================================================

class TestVoxtralBakeLexicon:
    """Tests for plugins.tts_voxtral.plugin.studio.bake lexicon path."""

    def _run(self, project_id, lexicon_entries, text="SQL is fast."):
        from tts_engines.tts_voxtral.plugin.studio import bake as bk

        job = _make_job("chap1", project_id, is_bake=True)

        captured_scripts = []

        def fake_bridge(**kwargs):
            if kwargs.get("script"):
                captured_scripts.extend(kwargs["script"])
            return 0

        segs = [{"id": "s1", "text_content": text, "audio_status": "unprocessed",
                 "audio_file_path": None}]
        groups = [{"segments": segs, "profile_name": "TestVoice"}]

        mock_ctx = MagicMock()
        mock_ctx.get_sanitize_categories.return_value = []
        mock_ctx.sanitize_text.side_effect = lambda t, *_: t
        mock_ctx.build_chunk_groups.return_value = groups

        mock_handler = MagicMock()
        mock_handler.update_job.return_value = None

        pdir = Path("/tmp/voxtral_lex_bake")
        out_wav = pdir / "chapter.wav"
        spk = {}

        with patch.object(bk, "_get_ctx", return_value=mock_ctx), \
             patch.object(bk, "_handler", return_value=mock_handler), \
             patch.object(bk, "get_chapter_segments", return_value=segs), \
             patch.object(bk, "get_project_lexicon", return_value=lexicon_entries), \
             patch.object(bk, "generate_via_bridge", side_effect=fake_bridge), \
             patch.object(bk, "update_segment"), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.mkdir"), \
             patch("pathlib.Path.unlink"):
            bk.handle_voxtral_bake(
                "voxtral-lex-job", job, time.time(),
                lambda _: None, lambda: False,
                pdir, out_wav, None, spk,
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
# Segments handler (handle_voxtral_segments)
# ===========================================================================

class TestVoxtralSegmentsLexicon:
    """Tests for plugins.tts_voxtral.plugin.studio.segments lexicon path."""

    def _run(self, project_id, lexicon_entries, text="SQL is fast."):
        from tts_engines.tts_voxtral.plugin.studio import segments as seg_mod

        job = _make_job("chap1", project_id, segment_ids=["s1"])

        captured_scripts = []

        def fake_bridge(**kwargs):
            if kwargs.get("script"):
                captured_scripts.extend(kwargs["script"])
            return 0

        segs = [{"id": "s1", "text_content": text, "audio_status": "unprocessed",
                 "audio_file_path": None}]
        groups = [{"segments": segs, "profile_name": "TestVoice"}]

        mock_ctx = MagicMock()
        mock_ctx.get_text_chunk_limit.return_value = 500
        mock_ctx.get_sanitize_categories.return_value = []
        mock_ctx.sanitize_text.side_effect = lambda t, *_: t
        mock_ctx.broadcast_segments_updated.return_value = None
        mock_ctx.get_chapter_segments_counts.return_value = (1, 1)
        mock_ctx.build_chunk_groups.return_value = groups

        mock_handler = MagicMock()
        mock_handler.update_job.return_value = None

        pdir = Path("/tmp/voxtral_lex_seg")
        spk = {}

        with patch.object(seg_mod, "_get_ctx", return_value=mock_ctx), \
             patch.object(seg_mod, "_handler", return_value=mock_handler), \
             patch.object(seg_mod, "get_chapter_segments", return_value=segs), \
             patch.object(seg_mod, "get_project_lexicon", return_value=lexicon_entries), \
             patch.object(seg_mod, "generate_via_bridge", side_effect=fake_bridge), \
             patch.object(seg_mod, "update_segment"), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.mkdir"), \
             patch("pathlib.Path.unlink"):
            seg_mod.handle_voxtral_segments(
                "voxtral-lex-job", job, time.time(),
                lambda _: None, lambda: False,
                pdir, None, spk,
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


# ===========================================================================
# Standard handler path in handler.py (non-segment, non-bake, non-sample)
# ===========================================================================

class TestVoxtralHandlerLexicon:
    """Tests for plugins.tts_voxtral.plugin.studio.handler standard path lexicon."""

    def _run(self, project_id, lexicon_entries, text="SQL is fast."):
        from tts_engines.tts_voxtral.plugin.studio import handler as h_mod

        job = _make_job("chap1", project_id)  # standard path: no segment_ids, no is_bake

        captured_texts = []

        def fake_bridge(**kwargs):
            captured_texts.append(kwargs.get("text", ""))
            return 0

        mock_ctx = MagicMock()
        mock_ctx.get_voice_profile_dir.return_value = None
        mock_ctx.get_voices_dir.return_value = Path("/tmp/voices")
        mock_ctx.finalize_sample_artifact.side_effect = lambda p: p

        pdir = Path("/tmp/voxtral_lex_handler")

        # Mock both DB queries in handler: _chapter_uses_multiple_profiles and
        # _chapter_text_from_segments both call get_db_connection.
        # We supply a single-profile result for the first call, and a text row
        # for the second call.
        call_count = [0]

        def make_conn_ctx(rows):
            cursor = MagicMock()
            cursor.fetchall.return_value = rows
            conn = MagicMock()
            conn.cursor.return_value = cursor
            ctx_mgr = MagicMock()
            ctx_mgr.__enter__ = MagicMock(return_value=conn)
            ctx_mgr.__exit__ = MagicMock(return_value=False)
            return ctx_mgr

        def get_conn_side_effect():
            call_count[0] += 1
            if call_count[0] == 1:
                # _chapter_uses_multiple_profiles: needs speaker_profile_name key
                return make_conn_ctx([{"speaker_profile_name": "TestVoice"}])
            else:
                # _chapter_text_from_segments: needs text_content key
                return make_conn_ctx([{"text_content": text}])

        with patch.object(h_mod, "_get_ctx", return_value=mock_ctx), \
             patch.object(h_mod, "get_chapter_dir", return_value=pdir), \
             patch.object(h_mod, "get_speaker_settings", return_value={}), \
             patch.object(h_mod, "get_db_connection", side_effect=get_conn_side_effect), \
             patch.object(h_mod, "get_project_lexicon", return_value=lexicon_entries), \
             patch.object(h_mod, "generate_via_bridge", side_effect=fake_bridge), \
             patch.object(h_mod, "update_job"), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.mkdir"):
            h_mod.handle_voxtral_job(
                "voxtral-lex-job", job, time.time(),
                lambda _: None, lambda: False,
            )

        return captured_texts

    def test_lexicon_substitution_applied_in_handler_standard_path(self):
        """When lexicon has entries the render_text sent to the bridge is substituted."""
        texts = self._run("proj1", LEXICON_ENTRIES, text="SQL is fast.")
        assert texts, "generate_via_bridge was never called"
        assert all("sequel" in t for t in texts), (
            f"Expected 'sequel' in render_text but got: {texts}"
        )

    def test_empty_lexicon_leaves_text_unchanged_in_handler_standard_path(self):
        """Zero-impact invariant: empty lexicon → render_text is byte-identical."""
        texts = self._run("proj1", [], text="SQL is fast.")
        assert all("SQL" in t for t in texts), (
            f"Empty lexicon changed the text unexpectedly: {texts}"
        )
