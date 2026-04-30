"""Artifact manifest helpers.

The manifest is what lets Studio 2.0 tell a valid artifact from stale output.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .models import ArtifactManifestModel, ArtifactOutputModel


def build_artifact_request_fingerprint(
    *,
    manifest_version: int = 1,
    source_revision_id: str,
    engine_id: str,
    engine_version: str | None = None,
    voice_asset_id: str | None = None,
    block_revision_hash: str,
    text_hash: str,
    settings_hash: str,
    chapter_id: str | None = None,
    project_id: str | None = None,
) -> str:
    """Build the stable request fingerprint for an artifact render request."""

    payload = {
        "manifest_version": manifest_version,
        "source_revision_id": source_revision_id,
        "engine_id": engine_id,
        "engine_version": engine_version,
        "voice_asset_id": voice_asset_id,
        "block_revision_hash": block_revision_hash,
        "text_hash": text_hash,
        "settings_hash": settings_hash,
        "chapter_id": chapter_id,
        "project_id": project_id,
    }
    return _sha256_json(payload)


def build_artifact_manifest(
    *,
    artifact_hash: str,
    source_revision_id: str,
    engine_id: str,
    block_revision_hash: str,
    text_hash: str,
    settings_hash: str,
    output: ArtifactOutputModel,
    manifest_version: int = 1,
    request_fingerprint: str | None = None,
    engine_version: str | None = None,
    voice_asset_id: str | None = None,
    chapter_id: str | None = None,
    project_id: str | None = None,
) -> ArtifactManifestModel:
    """Build the validation manifest for a rendered artifact."""

    fingerprint = request_fingerprint or build_artifact_request_fingerprint(
        manifest_version=manifest_version,
        source_revision_id=source_revision_id,
        engine_id=engine_id,
        engine_version=engine_version,
        voice_asset_id=voice_asset_id,
        block_revision_hash=block_revision_hash,
        text_hash=text_hash,
        settings_hash=settings_hash,
        chapter_id=chapter_id,
        project_id=project_id,
    )
    return ArtifactManifestModel(
        manifest_version=manifest_version,
        artifact_hash=artifact_hash,
        request_fingerprint=fingerprint,
        engine_id=engine_id,
        engine_version=engine_version,
        voice_asset_id=voice_asset_id,
        block_revision_hash=block_revision_hash,
        text_hash=text_hash,
        settings_hash=settings_hash,
        output=output,
        source_revision_id=source_revision_id,
        chapter_id=chapter_id,
        project_id=project_id,
    )


def is_artifact_stale(
    *,
    manifest: ArtifactManifestModel,
    source_revision_id: str,
    engine_id: str,
    block_revision_hash: str,
    text_hash: str,
    settings_hash: str,
    engine_version: str | None = None,
    voice_asset_id: str | None = None,
    chapter_id: str | None = None,
    project_id: str | None = None,
) -> bool:
    """Return True when the stored artifact manifest no longer matches."""

    expected_fingerprint = build_artifact_request_fingerprint(
        manifest_version=manifest.manifest_version,
        source_revision_id=source_revision_id,
        engine_id=engine_id,
        engine_version=engine_version,
        voice_asset_id=voice_asset_id,
        block_revision_hash=block_revision_hash,
        text_hash=text_hash,
        settings_hash=settings_hash,
        chapter_id=chapter_id,
        project_id=project_id,
    )
    return manifest.request_fingerprint != expected_fingerprint


def validate_artifact_manifest(
    *,
    manifest: ArtifactManifestModel,
    source_revision_id: str,
    engine_id: str,
    block_revision_hash: str,
    text_hash: str,
    settings_hash: str,
    engine_version: str | None = None,
    voice_asset_id: str | None = None,
    chapter_id: str | None = None,
    project_id: str | None = None,
) -> None:
    """Raise ValueError when the manifest does not match the requested revision."""

    if is_artifact_stale(
        manifest=manifest,
        source_revision_id=source_revision_id,
        engine_id=engine_id,
        block_revision_hash=block_revision_hash,
        text_hash=text_hash,
        settings_hash=settings_hash,
        engine_version=engine_version,
        voice_asset_id=voice_asset_id,
        chapter_id=chapter_id,
        project_id=project_id,
    ):
        raise ValueError("Artifact manifest is stale for the requested revision.")


def _sha256_json(payload: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
