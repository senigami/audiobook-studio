"""Settings ownership models."""

from dataclasses import dataclass


@dataclass(frozen=True)
class SettingsOwnershipModel:
    """Placeholder settings ownership contract.

    This will eventually describe which settings belong to:
    - the whole app
    - a project
    - an installed voice module
    - a voice profile preview/test surface
    """

    scope: str
    owner: str


def describe_settings_ownership(*args, **kwargs):
    """Placeholder for the global/project/module/profile ownership model."""
    raise NotImplementedError
