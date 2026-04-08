"""Settings repository boundary."""

from typing import Protocol


class SettingsRepository(Protocol):
    """Persistence contract for scoped settings."""

    def get_global(self) -> dict[str, object]:
        """Load app-global settings values."""

    def get_project(self, project_id: str) -> dict[str, object]:
        """Load project-scoped settings values for one project."""

    def get_module(self, module_id: str) -> dict[str, object]:
        """Load installed voice-module settings values."""

    def get_profile_preview(self, profile_id: str) -> dict[str, object]:
        """Load preview/test-only settings values for a voice profile."""
