"""Settings repository boundary."""

from typing import Protocol


class SettingsRepository(Protocol):
    """Persistence contract for scoped settings."""

    def get_global(self): ...
    def get_project(self, project_id: str): ...
    def get_module(self, module_id: str): ...

