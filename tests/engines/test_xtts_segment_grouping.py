"""Tests for XTTS segment grouping helpers in the studio segments handler."""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from unittest.mock import MagicMock, patch
from plugins.tts_xtts.plugin.studio._text_utils import join_group_text, build_segment_groups
# Import `handler` before `segments` — matches plugins/tts_xtts/tests/test_handler.py's
# import order, which avoids a circular-import trap (segments -> helpers -> handler ->
# bake -> helpers) when segments.py is the first module of the package to be imported.
from plugins.tts_xtts.plugin.studio import handler as _xtts_handler_module  # noqa: F401
from plugins.tts_xtts.plugin.studio.segments import handle_xtts_segments
from app.db.models import Job


def _make_seg(text: str, char_id: int = 1) -> dict:
    return {"id": char_id, "text_content": text, "character_id": char_id}


class TestJoinGroupText:
    def test_single_segment_no_extra_spaces(self):
        group = [_make_seg("Hello world.")]
        assert join_group_text(group) == "Hello world."

    def test_two_segments_joined_with_single_space(self):
        group = [_make_seg("Hello world."), _make_seg("How are you?")]
        result = join_group_text(group)
        assert result == "Hello world. How are you?"

    def test_three_segments_each_separated_by_one_space(self):
        group = [_make_seg("First."), _make_seg("Second."), _make_seg("Third.")]
        result = join_group_text(group)
        assert result == "First. Second. Third."

    def test_no_double_space_between_stripped_segments(self):
        group = [_make_seg("End of sentence."), _make_seg("Start of next.")]
        result = join_group_text(group)
        assert "  " not in result

    def test_size_budget_matches_join_length(self):
        """The grouper budgets combined_len = len(' '.join(existing)) + 1 + len(new).
        join_group_text must produce a string whose length equals that budget."""
        seg_a = _make_seg("Hello.")
        seg_b = _make_seg("World.")
        # Simulate the grouper's combined_len calculation
        existing_text = " ".join(s['text_content'] for s in [seg_a])
        budget_len = len(existing_text) + 1 + len(seg_b['text_content'])

        group = [seg_a, seg_b]
        assert len(join_group_text(group)) == budget_len


def _make_ordered_segs(texts: list[str], char_id: int = 1) -> list[dict]:
    """Return segments with sequential int ids, same character."""
    return [{"id": i, "text_content": t, "character_id": char_id} for i, t in enumerate(texts)]


class TestSegmentGroupingLimit:
    """Grouping uses get_text_chunk_limit(engine_id) — not a hardcoded constant."""

    def test_segments_merge_under_default_limit(self):
        # Two ~50-char segments combine to ~101 chars — fits under 500 (default xtts limit).
        text_a = "A" * 50 + "."
        text_b = "B" * 50 + "."
        segs = _make_ordered_segs([text_a, text_b])
        groups = build_segment_groups(segs, segs, limit=500)
        assert len(groups) == 1, "Both segments should merge into one group at limit=500"

    def test_segments_split_when_limit_is_100(self):
        # Same two ~51-char segments (combined ~103 chars) must NOT merge at limit=100.
        text_a = "A" * 50 + "."
        text_b = "B" * 50 + "."
        segs = _make_ordered_segs([text_a, text_b])
        groups = build_segment_groups(segs, segs, limit=100)
        assert len(groups) == 2, "Segments must split into separate groups when combined length exceeds limit"

    def test_handle_xtts_segments_uses_get_text_chunk_limit(self, monkeypatch):
        """handle_xtts_segments resolves its grouping budget from get_text_chunk_limit,
        not from the old DEFAULT_SENT_CHAR_LIMIT constant.  Patch the resolver to 100
        and confirm that two ~51-char same-character consecutive segments are not merged
        into a single synthesis script entry.

        Revert-check: if segments.py still used DEFAULT_SENT_CHAR_LIMIT (= 500), this
        test would fail even when the monkeypatch returns 100, because the constant bypass
        would produce one merged script entry instead of two.
        """
        import app.engines.behavior as behavior_mod
        monkeypatch.setattr(behavior_mod, "get_text_chunk_limit", lambda engine_id: 100)

        text_a = "A" * 50 + "."
        text_b = "B" * 50 + "."
        segs = _make_ordered_segs([text_a, text_b])

        job = Job(
            id="test_jid",
            engine="xtts",
            chapter_id="chap_123",
            status="running",
            created_at=time.time(),
            safe_mode=False,
            segment_ids=[s["id"] for s in segs],
        )

        captured = {}

        def fake_generate_via_bridge(**kwargs):
            captured["script"] = kwargs["script"]
            return 0

        with patch("plugins.tts_xtts.plugin.studio.segments.get_chapter_segments", return_value=segs), \
             patch("plugins.tts_xtts.plugin.studio.segments.generate_via_bridge", side_effect=fake_generate_via_bridge), \
             patch("plugins.tts_xtts.plugin.studio.handler.update_job"), \
             patch("pathlib.Path.mkdir"):
            handle_xtts_segments(
                jid="test_jid",
                j=job,
                start=time.time(),
                on_output=MagicMock(),
                cancel_check=MagicMock(return_value=False),
                default_sw="default.wav",
                speed=1.0,
                pdir=Path("/tmp/xtts"),
            )

        assert len(captured["script"]) == 2, (
            "Segments must remain split into separate script entries when "
            "get_text_chunk_limit is patched to 100 — a revert to the old "
            "DEFAULT_SENT_CHAR_LIMIT constant would merge them into one."
        )
