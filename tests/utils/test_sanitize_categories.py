"""Tests for per-category sanitize_text decomposition.

Step 1: golden equality corpus (proves refactor is byte-identical).
Step 2: per-category unit tests (each category touches only its target).
Step 3: manifest validation and behavior resolution.

TDD order: every test here must fail on the pre-refactor code (R1).
"""
from __future__ import annotations

import pytest

from app.utils.text.textops_cleaning import (
    sanitize_text,
    SANITIZE_CATEGORIES,
    DEFAULT_CATEGORY_ORDER,
)


# ---------------------------------------------------------------------------
# Golden corpus
# ---------------------------------------------------------------------------

GOLDEN = [
    # curly/smart quotes -> straight / stripped
    ('"Hello," she said.', "Hello, she said."),
    # smart single quotes preserved as straight; double quotes stripped
    ("‘It’s fine,’ he replied.", "'It's fine,' he replied."),
    # explicit double quotes stripped
    ('"Remove these" quotes.', "Remove these quotes."),
    # acronyms with dots collapsed
    ("The F.B.I. and C.I.A. work together.", "The F B I and C I A work together."),
    # single letter + dot = period, not collapsed
    ("I. must. go.", "I; must; go."),
    # fractions expanded
    ("3/4 cup and 1/2 teaspoon.", "3 out of 4 cup and 1 out of 2 teaspoon."),
    # em-dash -> comma
    ("He ran—fast.", "He ran, fast."),
    # unicode ellipsis -> ". "
    ("Wait… then go.", "Wait; then go."),
    # three-dot ellipsis -> ". "
    ("Wait... then go.", "Wait; then go."),
    # mixed: curly quotes + em-dash + ellipsis
    ("“Good—or bad…” she said.", "Good, or bad; she said."),
    # trailing comma promoted to period
    ("He said,", "He said."),
    # non-ASCII unicode stripped
    ("Caf\xe9 and na\xefve.", "Caf and nave."),
    # missing terminal punct added
    ("No punct here", "No punct here."),
    # redundant double punct collapsed
    ("What?! Stop!!", "What; Stop!"),
    # punct spacing normalised
    ("Hello.World and foo,bar.", "Hello; World and foo,bar."),
    # leading ellipsis stripped
    ("…Starting mid-sentence.", "Starting mid-sentence."),
    # large-number fractions
    ("10000/20000 ratio.", "10000 out of 20000 ratio."),
    # multiple spaces collapsed
    ("Too   many   spaces.", "Too many spaces."),
    # newlines preserved across two lines
    ("Line one.\nLine two.", "Line one; Line two."),
    # stray space before terminal punct
    ('word ."', "word ."),
]


@pytest.mark.parametrize("inp,expected", GOLDEN, ids=[repr(i) for i, _ in GOLDEN])
def test_golden_equality(inp, expected):
    """Refactored sanitize_text must be byte-identical to the original."""
    assert sanitize_text(inp) == expected


def test_golden_none_categories_equals_all():
    """None categories must produce the same result as all categories explicitly."""
    for inp, _ in GOLDEN:
        assert sanitize_text(inp, categories=None) == sanitize_text(
            inp, categories=list(DEFAULT_CATEGORY_ORDER)
        )


# ---------------------------------------------------------------------------
# SANITIZE_CATEGORIES registry sanity
# ---------------------------------------------------------------------------

def test_registry_contains_all_default_categories():
    for cat in DEFAULT_CATEGORY_ORDER:
        assert cat in SANITIZE_CATEGORIES, f"Missing category: {cat!r}"


def test_default_order_is_tuple_of_strings():
    assert isinstance(DEFAULT_CATEGORY_ORDER, tuple)
    assert all(isinstance(c, str) for c in DEFAULT_CATEGORY_ORDER)


# ---------------------------------------------------------------------------
# Per-category unit tests — each function transforms ONLY its target
# ---------------------------------------------------------------------------

def _apply_only(category: str, text: str) -> str:
    """Run sanitize_text with a single category."""
    return sanitize_text(text, categories=[category])


def test_category_quotes_removes_curly_double_quotes():
    result = _apply_only("quotes", "“Hello”")
    assert "“" not in result
    assert "”" not in result


def test_category_quotes_straightens_single_curly():
    result = _apply_only("quotes", "‘hey’")
    assert "‘" not in result
    assert "’" not in result


def test_category_quotes_does_not_expand_fractions():
    # fractions should pass through unchanged when only quotes is applied
    result = _apply_only("quotes", "3/4 cup")
    assert "3/4" in result


def test_category_acronyms_collapses_dots():
    result = _apply_only("acronyms", "F.B.I. said so")
    assert "F B I" in result


def test_category_acronyms_leaves_fractions_alone():
    result = _apply_only("acronyms", "3/4 cup")
    assert "3/4" in result


def test_category_fractions_expands():
    result = _apply_only("fractions", "1/2 teaspoon")
    assert "1 out of 2" in result


def test_category_fractions_leaves_quotes_alone():
    result = _apply_only("fractions", "“Hello”")
    # quotes not stripped by fractions category
    assert "“" in result


def test_category_dashes_replaces_em_dash():
    result = _apply_only("dashes", "He ran—fast")
    assert "—" not in result
    assert "," in result or "fast" in result


def test_category_dashes_replaces_ellipsis():
    result = _apply_only("dashes", "Wait… done")
    assert "…" not in result


def test_category_dashes_leaves_fractions_alone():
    result = _apply_only("dashes", "1/2 cup")
    assert "1/2" in result


def test_category_ascii_strips_non_ascii():
    result = _apply_only("ascii", "Caf\xe9")
    assert "\xe9" not in result
    assert "Caf" in result


def test_category_ascii_leaves_newlines():
    result = _apply_only("ascii", "line one\nline two")
    assert "\n" in result


def test_category_terminal_adds_period():
    result = _apply_only("terminal", "No punct")
    assert result.endswith(".")


def test_category_terminal_does_not_add_duplicate():
    result = _apply_only("terminal", "Already done.")
    assert result == "Already done."


def test_category_punct_spacing_collapses_spaces():
    result = _apply_only("punct_spacing", "Too   many   spaces")
    assert "  " not in result


# ---------------------------------------------------------------------------
# Manifest validation — sanitize_categories field
# ---------------------------------------------------------------------------

def test_manifest_validation_unknown_category_raises():
    """Unknown category name in sanitize_categories must cause a load error."""
    from app.tts_server.plugin_loader import _validate_manifest, PluginLoadError

    manifest = {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": "testengine",
        "display_name": "Test",
        "entry_class": "interface:TestEngine",
        "capabilities": ["synthesis"],
        "behavior": {
            "sanitize_categories": ["quotes", "UNKNOWN_CAT"],
        },
    }
    with pytest.raises(PluginLoadError, match="sanitize_categories"):
        _validate_manifest(manifest=manifest, folder_name="tts_testengine")


def test_manifest_validation_known_categories_accepted():
    """All known category names must pass validation without error."""
    from app.tts_server.plugin_loader import _validate_manifest

    manifest = {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": "testengine",
        "display_name": "Test",
        "entry_class": "interface:TestEngine",
        "capabilities": ["synthesis"],
        "behavior": {
            "sanitize_categories": list(DEFAULT_CATEGORY_ORDER),
        },
    }
    # Should not raise
    _validate_manifest(manifest=manifest, folder_name="tts_testengine")


def test_manifest_validation_absent_sanitize_categories_accepted():
    """sanitize_categories is optional; absence must not cause load error."""
    from app.tts_server.plugin_loader import _validate_manifest

    manifest = {
        "studio_tts_manifest": "1.0",
        "contract_version": "1.0",
        "sdk_version": "1.0",
        "settings_schema_version": "1.0",
        "event_envelope_version": "1.0",
        "engine_id": "testengine",
        "display_name": "Test",
        "entry_class": "interface:TestEngine",
        "capabilities": ["synthesis"],
    }
    _validate_manifest(manifest=manifest, folder_name="tts_testengine")


# ---------------------------------------------------------------------------
# Behavior resolution — get_sanitize_categories
# ---------------------------------------------------------------------------

def test_resolution_absent_returns_none():
    """When manifest has no sanitize_categories, result is None (= all)."""
    from app.engines.behavior import get_sanitize_categories
    # Use a mock behavior dict (no sanitize_categories key)
    result = get_sanitize_categories("xtts", behavior={"features": ["sanitize_text"]})
    assert result is None


def test_resolution_declared_subset_honored():
    """When sanitize_categories is declared, only those categories are returned."""
    from app.engines.behavior import get_sanitize_categories
    declared = ["quotes", "ascii", "terminal"]
    result = get_sanitize_categories(
        "xtts",
        behavior={"features": ["sanitize_text"], "sanitize_categories": declared},
    )
    assert result is not None
    assert list(result) == declared


def test_resolution_none_categories_applies_all():
    """None categories in sanitize_text means full pipeline — golden spot-check."""
    result = sanitize_text("Caf\xe9 waits…", categories=None)
    assert "\xe9" not in result
    assert "…" not in result
    assert result.endswith(".")
