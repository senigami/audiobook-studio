"""Artifact repository boundary.

Intended responsibility:
- persist immutable artifact records and manifest metadata
- support artifact lookup by hash and revision linkage
- avoid leaking cache-path assumptions into orchestration or domain callers
"""

from typing import Iterable, Protocol

from .models import ArtifactManifestModel, RenderArtifactModel


class ArtifactRepository(Protocol):
    """Persistence contract for immutable render artifacts."""

    def get(self, artifact_hash: str) -> RenderArtifactModel | None:
        """Load one artifact by stable artifact hash."""

    def get_manifest(self, artifact_hash: str) -> ArtifactManifestModel | None:
        """Load the manifest linked to a stored artifact hash."""

    def list_for_chapter(
        self, chapter_id: str, revision_id: str | None = None
    ) -> Iterable[RenderArtifactModel]:
        """List artifacts associated with a chapter and optional revision."""

    def save(self, artifact: RenderArtifactModel) -> RenderArtifactModel:
        """Persist artifact metadata and return the stored artifact."""

    def save_manifest(
        self, manifest: ArtifactManifestModel
    ) -> ArtifactManifestModel:
        """Persist artifact manifest metadata and return the stored manifest."""
