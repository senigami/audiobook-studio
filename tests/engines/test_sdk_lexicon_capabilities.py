"""Issue #200 A2: the two lexicon capabilities plugins need from the SDK.

``apply_lexicon`` is a pure text function and lives in the SDK itself
(``studio_plugin_sdk.text``), so a plugin never reaches into ``app.*`` for it.
``get_lexicon`` is a Studio-owned read and is exposed on the plugin context,
shaped like the already-shipped ``get_chapter_segments``.
"""
from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import patch

from studio_plugin_sdk import StudioPluginContext
from studio_plugin_sdk.text import apply_lexicon

_SDK_TEXT = Path(__file__).parents[2] / "studio_plugin_sdk" / "text.py"


def _ctx() -> StudioPluginContext:
    return StudioPluginContext(engine_id="xtts")


# ---------------------------------------------------------------------------
# apply_lexicon: real implementation, in the SDK, stdlib-only
# ---------------------------------------------------------------------------

def test_sdk_text_module_has_no_app_imports():
    """studio_plugin_sdk/text.py must be stdlib-only, like audio.py and proc.py."""
    tree = ast.parse(_SDK_TEXT.read_text(encoding="utf-8"))
    hits = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").split(".")[0] == "app":
            hits.append(f"L{node.lineno}: from {node.module}")
        elif isinstance(node, ast.Import):
            hits.extend(f"L{node.lineno}: import {a.name}" for a in node.names if a.name.split(".")[0] == "app")
    assert hits == [], "studio_plugin_sdk/text.py must not import app.*:\n" + "\n".join(hits)


def test_apply_lexicon_substitutes_whole_words_case_insensitively():
    entries = [{"word": "cat", "replacement": "kitten"}]
    assert apply_lexicon("The Cat sat on the concatenation.", entries) == (
        "The kitten sat on the concatenation."
    )


def test_apply_lexicon_empty_entries_returns_same_object():
    text = "Nothing to substitute."
    assert apply_lexicon(text, []) is text


def test_app_path_is_the_same_function_not_a_copy():
    """app.utils.text.lexicon is a re-export shim: one implementation, not two."""
    from app.utils.text import lexicon as app_lexicon
    assert app_lexicon.apply_lexicon is apply_lexicon


# ---------------------------------------------------------------------------
# ctx.get_lexicon: project pronunciation entries
# ---------------------------------------------------------------------------

def test_ctx_get_lexicon_returns_entries_for_project():
    rows = [{"word": "Aeryn", "replacement": "AIR-in"}]
    with patch("app.db.lexicon.get_lexicon", return_value=rows) as m:
        result = _ctx().get_lexicon("proj-1")
    m.assert_called_once_with("proj-1")
    assert result == rows


def test_ctx_get_lexicon_output_feeds_apply_lexicon():
    """The two capabilities compose: entries out of ctx go straight into the utility."""
    rows = [{"word": "Aeryn", "replacement": "AIR-in"}]
    with patch("app.db.lexicon.get_lexicon", return_value=rows):
        entries = _ctx().get_lexicon("proj-1")
    assert apply_lexicon("Aeryn waited.", entries) == "AIR-in waited."
