"""Issue #200 A3: ctx.split_long_sentences returns str, not list[str].

The SDK wrapper used to return ``[result]``. The wrapped
``safe_split_long_sentences`` returns a string, and every real call site feeds
the result straight into a synthesis script, so the list shape was a live trap.

These run the real function, not a mock, and the expectations are literals
traced by hand from the documented splitting rules: an expectation computed
from the implementation would pass whatever the implementation did.
"""
from __future__ import annotations

from studio_plugin_sdk.context import StudioPluginContext


def _ctx() -> StudioPluginContext:
    return StudioPluginContext(engine_id="xtts")


def test_returns_str_not_list():
    result = _ctx().split_long_sentences("Aaa; Bbb; Ccc.", 5)
    assert isinstance(result, str), f"expected str, got {type(result).__name__}"


def test_splits_on_semicolon_to_expected_literal():
    """Hand-traced: "; " is the first separator tried, each part exceeds the
    5-char budget on its own, so each becomes its own sentence."""
    assert _ctx().split_long_sentences("Aaa; Bbb; Ccc.", 5) == "Aaa. Bbb. Ccc."


def test_text_under_the_limit_is_returned_unchanged():
    assert _ctx().split_long_sentences("Alpha and beta.", 100) == "Alpha and beta."
