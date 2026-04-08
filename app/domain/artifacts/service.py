"""Artifact domain service.

This module will own revision-safe artifact validation, reuse decisions, and
cache publication coordination.
"""

from .cache import publish_artifact
from .manifest import build_artifact_manifest
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
        _ = self.repository
        raise NotImplementedError("Studio 2.0 artifact reads are not implemented yet.")

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
        _ = build_artifact_manifest
        _ = (artifact_hash, source_revision_id, content_hash)
        raise NotImplementedError("Studio 2.0 artifact reuse validation is not implemented yet.")

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
        _ = publish_artifact
        _ = (artifact, destination_path)
        raise NotImplementedError("Studio 2.0 artifact publication is not implemented yet.")


def create_artifact_service(repository: ArtifactRepository) -> ArtifactService:
    """Create the artifact-domain service shell.

    Args:
        repository: Persistence adapter implementing the artifact repository
            contract.

    Returns:
        ArtifactService: Service shell with repository dependency wiring.
    """
    return ArtifactService(repository=repository)
