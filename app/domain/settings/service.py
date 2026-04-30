"""Settings domain service.

This module will own the explicit settings ownership model used by Studio 2.0.
"""

from __future__ import annotations

from .models import EffectiveSettingsModel, SettingsOwnershipModel
from .ownership import build_settings_ownership_chain
from .repository import SettingsRepository

INTENDED_UPSTREAM_CALLERS = (
    "app.api.routers.settings",
    "app.api.routers.voices",
    "app.api.routers.projects",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.domain.settings.repository.SettingsRepository",
    "app.domain.settings.ownership.build_settings_ownership_chain",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.state",
    "app.db",
    "app.jobs",
)


class SettingsService:
    """Placeholder service for scoped settings lookups and migrations."""

    def __init__(self, repository: SettingsRepository):
        self.repository = repository

    def describe_ownership(self) -> list[SettingsOwnershipModel]:
        """Describe the ordered settings scopes used by Studio 2.0.

        Returns:
            list[SettingsOwnershipModel]: Ordered ownership scopes from broadest
            to most specific.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return build_settings_ownership_chain()

    def get_effective_settings(
        self,
        *,
        project_id: str | None = None,
        module_id: str | None = None,
        profile_id: str | None = None,
    ) -> EffectiveSettingsModel:
        """Resolve settings through the future ownership model.

        Args:
            project_id: Optional project whose scoped defaults should apply.
            module_id: Optional installed voice module whose settings should
                apply after project settings.
            profile_id: Optional preview/test profile whose temporary settings
                should override broader scopes.

        Returns:
            EffectiveSettingsModel: Resolved settings values and scope chain.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        ownership = build_settings_ownership_chain()
        scope_chain = self._load_scope_chain(
            project_id=project_id,
            module_id=module_id,
            profile_id=profile_id,
        )
        return self._merge_scoped_values(ownership=ownership, scope_chain=scope_chain)

    def _load_scope_chain(
        self,
        *,
        project_id: str | None,
        module_id: str | None,
        profile_id: str | None,
    ) -> list[dict[str, object]]:
        """Load the settings layers required for a specific resolution call.

        Args:
            project_id: Optional project scope to include.
            module_id: Optional module scope to include.
            profile_id: Optional profile preview scope to include.

        Returns:
            list[dict[str, object]]: Ordered settings payloads from broadest to
            most specific.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        scope_chain = [{"scope": "global", **self.repository.get_global()}]
        if project_id is not None:
            scope_chain.append({"scope": "project", **self.repository.get_project(project_id)})
        if module_id is not None:
            scope_chain.append({"scope": "module", **self.repository.get_module(module_id)})
        if profile_id is not None:
            scope_chain.append(
                {"scope": "profile_preview", **self.repository.get_profile_preview(profile_id)}
            )
        return scope_chain

    def _merge_scoped_values(
        self,
        *,
        ownership: list[SettingsOwnershipModel],
        scope_chain: list[dict[str, object]],
    ) -> EffectiveSettingsModel:
        """Merge the loaded scope chain into the final settings payload.

        Args:
            ownership: Ordered ownership scopes describing precedence rules.

        Returns:
            EffectiveSettingsModel: Final resolved settings payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        values: dict[str, object] = {}
        source_scopes: list[str] = []
        ownership_by_scope = {item.scope: item for item in ownership}
        for scope_payload in scope_chain:
            scope_name = str(scope_payload.get("scope") or "")
            if scope_name:
                source_scopes.append(scope_name)
            values.update({k: v for k, v in scope_payload.items() if k != "scope"})
            if scope_name not in ownership_by_scope:
                continue
        return EffectiveSettingsModel(
            scope_chain=[item.scope for item in ownership],
            values=values,
            source_scopes=source_scopes,
        )


def create_settings_service(repository: SettingsRepository) -> SettingsService:
    """Create the settings-domain service shell.

    Args:
        repository: Persistence adapter implementing the settings repository
            contract.

    Returns:
        SettingsService: Service shell with repository dependency wiring.
    """
    return SettingsService(repository=repository)
