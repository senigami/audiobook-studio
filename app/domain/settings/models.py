"""Settings ownership models."""

from dataclasses import dataclass, field


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
    description: str


@dataclass(frozen=True)
class EffectiveSettingsModel:
    """Resolved settings after applying the Studio 2.0 ownership chain."""

    scope_chain: list[str] = field(default_factory=list)
    values: dict[str, object] = field(default_factory=dict)


def describe_settings_ownership() -> list[SettingsOwnershipModel]:
    """Describe the intended Studio 2.0 settings ownership hierarchy.

    Returns:
        list[SettingsOwnershipModel]: Ordered settings scopes from broadest to
        most specific.

    Raises:
        NotImplementedError: Phase 1 scaffold does not define concrete rules.
    """
    from .ownership import build_settings_ownership_chain

    _ = build_settings_ownership_chain
    raise NotImplementedError
