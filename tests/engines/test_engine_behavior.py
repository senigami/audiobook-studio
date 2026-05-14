from app.engines.behavior import (
    extract_engine_settings,
    has_behavior,
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
