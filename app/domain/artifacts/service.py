"""Artifact domain service.

This module will own revision-safe artifact validation, reuse decisions, and
cache publication coordination.
"""

from __future__ import annotations

from .cache import publish_artifact
from .manifest import (
    build_artifact_manifest,
    build_artifact_request_fingerprint,
    is_artifact_stale,
)
from .models import ArtifactManifestModel, RenderArtifactModel
from .repository import ArtifactRepository

INTENDED_UPSTREAM_CALLERS = (
    "app.domain.projects.service.ProjectService",
    "app.orchestration.progress.reconciliation",
    "app.orchestration.tasks",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.domain.artifacts.repository.ArtifactRepository",
    "app.domain.artifacts.manifest.build_artifact_manifest",
    "app.domain.artifacts.cache.publish_artifact",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.db.reconcile",
    "app.jobs.reconcile",
    "app.engines",
)


class ArtifactService:
    """Placeholder service for artifact validation and publication flow."""

    def __init__(self, repository: ArtifactRepository):
        self.repository = repository

    def get_artifact(self, artifact_hash: str) -> RenderArtifactModel:
        """Load an artifact through the artifact domain boundary.

        Args:
            artifact_hash: Stable artifact hash being requested.

        Returns:
            RenderArtifactModel: Stored artifact metadata.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        artifact = self.repository.get(artifact_hash)
        if artifact is None:
            raise KeyError(f"Artifact not found: {artifact_hash}")
        return artifact

    def validate_reuse(
        self,
        *,
        artifact_hash: str,
        source_revision_id: str,
        content_hash: str,
    ) -> ArtifactManifestModel:
        """Describe revision-safe validation for artifact reuse decisions.

        Args:
            artifact_hash: Stored artifact hash being evaluated for reuse.
            source_revision_id: Revision identifier requested by current work.
            content_hash: Current content hash derived from the requested work.

        Returns:
            ArtifactManifestModel: Manifest metadata used for the reuse
            decision.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        manifest = self.repository.get_manifest(artifact_hash)
        if manifest is None:
            raise KeyError(f"Artifact manifest not found: {artifact_hash}")
        requested_manifest = build_artifact_manifest(
            artifact_hash=artifact_hash,
            source_revision_id=source_revision_id,
            engine_id=manifest.engine_id,
            engine_version=manifest.engine_version,
            voice_asset_id=manifest.voice_asset_id,
            block_revision_hash=manifest.block_revision_hash,
            text_hash=content_hash,
            settings_hash=manifest.settings_hash,
            output=manifest.output,
            request_fingerprint=build_artifact_request_fingerprint(
                source_revision_id=source_revision_id,
                engine_id=manifest.engine_id,
                engine_version=manifest.engine_version,
                voice_asset_id=manifest.voice_asset_id,
                block_revision_hash=manifest.block_revision_hash,
                text_hash=content_hash,
                settings_hash=manifest.settings_hash,
                chapter_id=manifest.chapter_id,
                project_id=manifest.project_id,
            ),
            chapter_id=manifest.chapter_id,
            project_id=manifest.project_id,
        )
        if is_artifact_stale(
            manifest=manifest,
            source_revision_id=source_revision_id,
            engine_id=manifest.engine_id,
            block_revision_hash=manifest.block_revision_hash,
            text_hash=content_hash,
            settings_hash=manifest.settings_hash,
            engine_version=manifest.engine_version,
            voice_asset_id=manifest.voice_asset_id,
            chapter_id=manifest.chapter_id,
            project_id=manifest.project_id,
        ):
            raise ValueError("Artifact is stale for the requested revision.")
        return requested_manifest

    def publish(
        self,
        *,
        artifact: RenderArtifactModel,
        destination_path: str,
    ) -> RenderArtifactModel:
        """Describe artifact publication through the artifact domain boundary.

        Args:
            artifact: Immutable artifact metadata being published.
            destination_path: Final artifact cache path.

        Returns:
            RenderArtifactModel: Published artifact metadata.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        published = publish_artifact(artifact=artifact, destination_path=destination_path)
        return self.repository.save(published)


def create_artifact_service(repository: ArtifactRepository) -> ArtifactService:
    """Create the artifact-domain service shell.

    Args:
        repository: Persistence adapter implementing the artifact repository
            contract.

    Returns:
        ArtifactService: Service shell with repository dependency wiring.
    """
    return ArtifactService(repository=repository)
