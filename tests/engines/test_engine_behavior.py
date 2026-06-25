from app.engines.behavior import (
    extract_engine_settings,
    get_timing_markers,
    get_sanitize_categories,
    has_behavior,
    match_timing_marker,
    required_settings_for,
)
from app.engines.enablement import can_enable_engine


def test_behavior_helpers_read_plugin_metadata_without_engine_name_checks() -> None:
    assert has_behavior("voxtral", "cloud_synthesis")
    assert required_settings_for("voxtral")[0]["name"] == "mistral_api_key"


def test_enablement_uses_declared_required_settings_for_any_engine() -> None:
    behavior = {
        "required_settings": [
            {
                "name": "api_token",
                "message": "Add an API token before enabling this engine.",
            }
        ]
    }

    can_enable, reason = can_enable_engine(
        "futurecloud",
        current_settings={},
        verified=True,
        status="ready",
        behavior=behavior,
    )

    assert can_enable is False
    assert reason == "Add an API token before enabling this engine."

    can_enable, reason = can_enable_engine(
        "futurecloud",
        current_settings={"api_token": "secret"},
        verified=True,
        status="ready",
        behavior=behavior,
    )

    assert can_enable is True
    assert reason == ""


def test_extract_engine_settings_uses_declared_aliases_for_any_engine() -> None:
    behavior = {
        "setting_aliases": {"legacy_model": "model"},
        "synthesis_settings": ["style"],
    }

    settings = extract_engine_settings(
        "futurecloud",
        {
            "engine_id": "futurecloud",
            "legacy_model": "future-v1",
            "style": "bright",
            "unrelated": "drop-me",
        },
        behavior=behavior,
    )

    assert settings == {"model": "future-v1", "style": "bright"}


def test_mixed_manifest_declares_engine_activity_started_marker() -> None:
    markers = get_timing_markers("mixed")

    assert markers["ENGINE_ACTIVITY_STARTED"] == ["[ENGINE_ACTIVITY_STARTED]"]
    assert match_timing_marker("mixed", "[ENGINE_ACTIVITY_STARTED] seg-1") == "ENGINE_ACTIVITY_STARTED"


class TestGetSanitizeCategoriesResolution:
    """get_sanitize_categories intersects manifest-declared categories with
    user persisted_settings overrides in DEFAULT_CATEGORY_ORDER order."""

    _DECLARED = ["quotes", "dashes", "ascii", "terminal"]

    def _cats(self, overrides=None):
        return get_sanitize_categories(
            "fakeeng",
            behavior={"sanitize_categories": self._DECLARED},
            persisted_settings={"sanitize_overrides": overrides} if overrides is not None else {},
        )

    def test_no_overrides_returns_declared_set(self):
        result = get_sanitize_categories(
            "fakeeng",
            behavior={"sanitize_categories": self._DECLARED},
            persisted_settings={},
        )
        assert set(result) == set(self._DECLARED)

    def test_override_disables_a_category(self):
        result = self._cats({"quotes": False, "dashes": True, "ascii": True, "terminal": True})
        assert "quotes" not in result
        assert "dashes" in result

    def test_unknown_override_keys_are_ignored(self):
        result = self._cats({"nonexistent": False, "quotes": True})
        # nonexistent key silently ignored; declared categories with no override keep default (enabled)
        assert "quotes" in result
        assert "nonexistent" not in result

    def test_all_disabled_returns_empty_tuple(self):
        overrides = {cat: False for cat in self._DECLARED}
        result = self._cats(overrides)
        assert result == ()

    def test_result_preserves_default_category_order(self):
        from app.utils.text.textops_cleaning import DEFAULT_CATEGORY_ORDER
        # Declare all default categories
        all_cats = list(DEFAULT_CATEGORY_ORDER)
        result = get_sanitize_categories(
            "fakeeng",
            behavior={"sanitize_categories": all_cats},
            persisted_settings={},
        )
        assert list(result) == list(DEFAULT_CATEGORY_ORDER)

    def test_non_declaring_manifest_returns_none(self):
        result = get_sanitize_categories(
            "fakeeng",
            behavior={},
            persisted_settings={},
        )
        assert result is None

    def test_sanitize_becomes_passthrough_when_all_disabled(self):
        from app.utils.text.textops_cleaning import sanitize_text
        text = "Hello, world"
        result = sanitize_text(text, categories=())
        assert result == text
