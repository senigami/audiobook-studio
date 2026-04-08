"""Artifact domain for Studio 2.0."""

from .models import RenderArtifactModel
from .manifest import build_artifact_manifest

__all__ = ["RenderArtifactModel", "build_artifact_manifest"]
