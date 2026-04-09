"""Project domain service.

This is where project creation, validation, defaults, and snapshot behavior
will eventually live.
"""

from __future__ import annotations

import uuid

from .models import ProjectExportManifestModel, ProjectModel, ProjectSnapshotModel
from .exports import build_project_export_manifest
from .repository import ProjectRepository
from .snapshots import build_project_snapshot

INTENDED_UPSTREAM_CALLERS = (
    "app.api.routers.projects",
    "app.domain.projects.service_factory",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.domain.projects.repository.ProjectRepository",
    "app.domain.projects.snapshots.build_project_snapshot",
    "app.domain.projects.exports.build_project_export_manifest",
    "app.orchestration.project_views",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.db.projects",
    "app.jobs",
    "app.engines",
    "app.domain.chapters.service",
    "app.domain.artifacts.service",
)


class ProjectService:
    """Placeholder service showing the intended project-domain entry points."""

    def __init__(self, repository: ProjectRepository):
        self.repository = repository

    def list_projects(self) -> list[ProjectModel]:
        """List library-visible projects through the project domain.

        Returns:
            list[ProjectModel]: Project summaries suitable for library and
            picker screens.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return list(self.repository.list_all())

    def get_project(
        self, project_id: str, *, include_snapshot: bool = False
    ) -> ProjectModel:
        """Read one project through the project domain boundary.

        Args:
            project_id: Stable project identifier.
            include_snapshot: Whether the caller also needs revision-safe
                snapshot context for resume, export, or restore surfaces.

        Returns:
            ProjectModel: The requested project entity.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = include_snapshot
        return self._load_project(project_id=project_id)

    def prepare_project_defaults(
        self,
        *,
        name: str,
        author: str | None = None,
        series: str | None = None,
    ) -> ProjectModel:
        """Build the default project entity before first persistence.

        Args:
            name: Project display name chosen by the user.
            author: Optional project-level author metadata.
            series: Optional project-level series metadata.

        Returns:
            ProjectModel: Draft project metadata ready for creation flow review.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return self._build_default_project(
            name=name,
            author=author,
            series=series,
        )

    def create_snapshot(
        self, project_id: str, *, include_chapter_audio: bool = True
    ) -> ProjectSnapshotModel:
        """Create a revision-safe snapshot used for resume and export.

        Args:
            project_id: Stable project identifier.
            include_chapter_audio: Whether the snapshot should reference chapter
                artifact hashes in addition to structural metadata.

        Returns:
            ProjectSnapshotModel: Snapshot contract for the requested project.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        project = self._load_project(project_id=project_id)
        _ = self._collect_snapshot_inputs(
            project=project,
            include_chapter_audio=include_chapter_audio,
        )
        raise NotImplementedError("Studio 2.0 snapshot creation is not implemented yet.")

    def build_export_manifest(
        self,
        project_id: str,
        *,
        format_id: str,
        include_cover_art: bool = True,
    ) -> ProjectExportManifestModel:
        """Assemble the export intent payload for a project.

        Args:
            project_id: Stable project identifier.
            format_id: Export target identifier, such as audiobook package or
                chapter ZIP export.
            include_cover_art: Whether cover art should be included when the
                requested export format supports it.

        Returns:
            ProjectExportManifestModel: Export payload describing the requested
            output package.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        project = self._load_project(project_id=project_id)
        _ = self._resolve_export_inputs(
            project=project,
            format_id=format_id,
            include_cover_art=include_cover_art,
        )
        raise NotImplementedError("Studio 2.0 export manifests are not implemented yet.")

    def _load_project(self, *, project_id: str) -> ProjectModel:
        """Load project context before project-domain operations run.

        Args:
            project_id: Stable project identifier.

        Returns:
            ProjectModel: Loaded project entity from the repository layer.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        project = self.repository.get(project_id)
        if project is None:
            raise KeyError(f"Project not found: {project_id}")
        return project

    def _build_default_project(
        self,
        *,
        name: str,
        author: str | None,
        series: str | None,
    ) -> ProjectModel:
        """Prepare project metadata before persistence.

        Args:
            name: Project display name.
            author: Optional author metadata.
            series: Optional series metadata.

        Returns:
            ProjectModel: Unsaved project entity populated with defaults.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return ProjectModel(
            id=f"project_{uuid.uuid4().hex[:12]}",
            title=name.strip() or "Untitled Project",
            author=author.strip() if author else None,
            series=series.strip() if series else None,
        )

    def _collect_snapshot_inputs(
        self,
        *,
        project: ProjectModel,
        include_chapter_audio: bool,
    ) -> dict[str, object]:
        """Gather snapshot prerequisites before calling snapshot helpers.

        Args:
            project: Loaded project entity.
            include_chapter_audio: Whether artifact hashes should be included.

        Returns:
            dict[str, object]: Snapshot input bundle for helper-level assembly.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self.repository
        raise NotImplementedError("Studio 2.0 snapshot input collection is not implemented yet.")

    def _resolve_export_inputs(
        self,
        *,
        project: ProjectModel,
        format_id: str,
        include_cover_art: bool,
    ) -> dict[str, object]:
        """Gather export prerequisites before manifest assembly.

        Args:
            project: Loaded project entity.
            format_id: Export target identifier.
            include_cover_art: Whether cover art should be included.

        Returns:
            dict[str, object]: Export helper input bundle.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self.repository
        raise NotImplementedError("Studio 2.0 export input resolution is not implemented yet.")


def create_project_service(repository: ProjectRepository) -> ProjectService:
    """Create the project-domain service shell used by future routes.

    Args:
        repository: Persistence adapter implementing the project repository
            contract.

    Returns:
        ProjectService: Service shell with repository dependency wiring.
    """
    return ProjectService(repository=repository)
