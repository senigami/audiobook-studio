"""Settings ownership models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SettingsOwnershipModel:
    """Explicit settings ownership contract."""

    scope: str
    owner: str
    description: str
    precedence: int


@dataclass
class EffectiveSettingsModel:
    """Resolved settings after applying the Studio 2.0 ownership chain."""

    scope_chain: list[str] = field(default_factory=list)
    values: dict[str, Any] = field(default_factory=dict)
    source_scopes: list[str] = field(default_factory=list)


def describe_settings_ownership() -> list[SettingsOwnershipModel]:
    """Describe the intended Studio 2.0 settings ownership hierarchy."""

    return [
        SettingsOwnershipModel(
            scope="global",
            owner="app",
            description="Application-wide defaults and safety settings.",
            precedence=0,
        ),
        SettingsOwnershipModel(
            scope="project",
            owner="project",
            description="Project-local defaults and library-level overrides.",
            precedence=1,
        ),
        SettingsOwnershipModel(
            scope="module",
            owner="installed_voice_module",
            description="Settings owned by an installed voice module or engine wrapper.",
            precedence=2,
        ),
        SettingsOwnershipModel(
            scope="profile_preview",
            owner="voice_profile_preview",
            description="Preview and test-only overrides for a specific voice profile.",
            precedence=3,
        ),
    ]
