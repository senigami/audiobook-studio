"""Settings domain service.

This module will own the explicit settings ownership model used by Studio 2.0.
"""

from .models import describe_settings_ownership


class SettingsService:
    """Placeholder service for scoped settings lookups and migrations."""

    def get_effective_settings(self, *, project_id: str | None = None):
        """Resolve settings through the future ownership model."""
        _ = describe_settings_ownership
        raise NotImplementedError("Studio 2.0 settings resolution is not implemented yet.")


def create_settings_service() -> SettingsService:
    """Factory for settings ownership and migration rules."""
    raise NotImplementedError("Studio 2.0 settings service is not implemented yet.")
