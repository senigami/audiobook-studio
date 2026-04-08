"""Settings ownership rules.

This module keeps ownership precedence separate from settings retrieval so the
rules can stay explicit and testable during migration.
"""

from .models import SettingsOwnershipModel


def build_settings_ownership_chain() -> list[SettingsOwnershipModel]:
    """Describe the ordered settings ownership chain for Studio 2.0.

    Returns:
        list[SettingsOwnershipModel]: Ordered scope precedence from broadest to
        most specific.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
