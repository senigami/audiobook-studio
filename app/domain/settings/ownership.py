"""Settings ownership rules.

This module keeps ownership precedence separate from settings retrieval so the
rules can stay explicit and testable during migration.
"""

from __future__ import annotations

from .models import SettingsOwnershipModel, describe_settings_ownership


def build_settings_ownership_chain() -> list[SettingsOwnershipModel]:
    """Describe the ordered settings ownership chain for Studio 2.0."""

    return sorted(describe_settings_ownership(), key=lambda item: item.precedence)
