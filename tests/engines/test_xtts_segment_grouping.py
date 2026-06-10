"""Tests for XTTS segment grouping helpers in the studio segments handler."""
from __future__ import annotations

import pytest
from plugins.tts_xtts.plugin.studio._text_utils import join_group_text


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
