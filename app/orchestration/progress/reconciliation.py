"""Progress and artifact reconciliation helpers.

This module stays orchestration-focused. Callers are expected to adapt legacy
job snapshots into the request mapping rather than importing worker or web
modules here.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from app.domain.artifacts.manifest import (
    build_artifact_manifest,
    build_artifact_request_fingerprint,
    validate_artifact_manifest,
)
from app.domain.artifacts.models import ArtifactManifestModel, ArtifactOutputModel

ARTIFACT_STATES = ("valid", "stale", "missing", "unknown")
_REQUIRED_REQUEST_FIELDS = (
    "source_revision_id",
    "engine_id",
    "block_revision_hash",
    "text_hash",
    "settings_hash",
)


def reconcile_work_item(
    *,
    job_id: str,
    task_revision_id: str,
    artifact_hash: str | None = None,
    scope: str = "job",
    requested_revision: Mapping[str, Any] | None = None,
    artifact_manifest: ArtifactManifestModel | Mapping[str, Any] | None = None,
    artifact_lookup: Callable[[dict[str, object]], ArtifactManifestModel | Mapping[str, Any] | None] | None = None,
) -> dict[str, object]:
    """Describe revision-safe reconciliation before progress resumes.

    Args:
        job_id: Stable job identifier being reconciled.
        task_revision_id: Revision identifier the job intends to satisfy.
        artifact_hash: Optional known artifact hash already linked to the job.
        scope: Requested work scope such as job, block, chapter, or export.
        requested_revision: Revision context used to validate any artifact.
        artifact_manifest: Optional manifest already resolved by the caller.
        artifact_lookup: Optional callback that resolves a manifest for the
            requested work item.

    Returns:
        dict[str, object]: Structured reconciliation result containing the
        artifact state, reason, and normalized request context.
    """
    normalized_request = _normalize_requested_revision(
        task_revision_id=task_revision_id,
        requested_revision=requested_revision,
    )
    lookup_request = {
        "job_id": job_id,
        "scope": scope,
        "artifact_hash": artifact_hash,
        "task_revision_id": task_revision_id,
        "requested_revision": dict(normalized_request["requested_revision"]),
    }

    resolved_manifest = _coerce_artifact_manifest(artifact_manifest)
    artifact_source = "provided" if resolved_manifest is not None else "none"
    malformed_manifest_payload = artifact_manifest is not None and resolved_manifest is None
    lookup_attempted = False
    if resolved_manifest is None and artifact_lookup is not None:
        lookup_attempted = True
        try:
            resolved_candidate = artifact_lookup(lookup_request)
        except Exception as exc:  # pragma: no cover - defensive guard
            missing_fields = _missing_request_fields(normalized_request)
            request_fingerprint = None
            if not missing_fields:
                request_fingerprint = build_artifact_request_fingerprint(
                    source_revision_id=normalized_request["source_revision_id"],
                    engine_id=normalized_request["engine_id"],
                    engine_version=normalized_request["engine_version"],
                    voice_asset_id=normalized_request["voice_asset_id"],
                    block_revision_hash=normalized_request["block_revision_hash"],
                    text_hash=normalized_request["text_hash"],
                    settings_hash=normalized_request["settings_hash"],
                    chapter_id=normalized_request["chapter_id"],
                    project_id=normalized_request["project_id"],
                )
            return {
                "job_id": job_id,
                "scope": scope,
                "task_revision_id": task_revision_id,
                "source_revision_id": normalized_request["source_revision_id"],
                "artifact_hash": _clean_text(artifact_hash),
                "requested_artifact_hash": artifact_hash,
                "artifact_state": "unknown",
                "reason_code": "artifact_lookup_failed",
                "message": "Artifact lookup failed while resolving the requested work item.",
                "missing_fields": missing_fields,
                "request_fingerprint": request_fingerprint,
                "requested_revision": normalized_request["requested_revision"],
                "artifact_manifest": None,
                "requested_manifest": None,
                "artifact_lookup_attempted": True,
                "artifact_source": "lookup_error",
                "artifact_lookup_error": str(exc),
                "can_reuse": False,
            }

        resolved_manifest = _coerce_artifact_manifest(resolved_candidate)
        if resolved_manifest is not None:
            artifact_source = "lookup"
            malformed_manifest_payload = False
        elif resolved_candidate is not None:
            malformed_manifest_payload = True

    missing_fields = _missing_request_fields(normalized_request)
    requested_manifest = _build_requested_manifest(
        artifact_hash=artifact_hash,
        resolved_manifest=resolved_manifest,
        normalized_request=normalized_request,
        missing_fields=missing_fields,
    )

    request_fingerprint = None
    if requested_manifest is not None:
        request_fingerprint = requested_manifest.request_fingerprint
    elif not missing_fields:
        request_fingerprint = build_artifact_request_fingerprint(
            source_revision_id=normalized_request["source_revision_id"],
            engine_id=normalized_request["engine_id"],
            engine_version=normalized_request["engine_version"],
            voice_asset_id=normalized_request["voice_asset_id"],
            block_revision_hash=normalized_request["block_revision_hash"],
            text_hash=normalized_request["text_hash"],
            settings_hash=normalized_request["settings_hash"],
            chapter_id=normalized_request["chapter_id"],
            project_id=normalized_request["project_id"],
        )
    elif resolved_manifest is not None:
        request_fingerprint = resolved_manifest.request_fingerprint

    artifact_state = "unknown"
    reason_code = "artifact_lookup_unavailable"
    message = "No artifact lookup was provided for this work item."
    normalized_requested_hash = _clean_text(artifact_hash)

    if resolved_manifest is not None:
        if (
            normalized_requested_hash is not None
            and resolved_manifest.artifact_hash != normalized_requested_hash
        ):
            artifact_state = "stale"
            reason_code = "artifact_hash_mismatch"
            message = "Resolved artifact manifest does not match the requested artifact hash."
        elif missing_fields:
            artifact_state = "unknown"
            reason_code = "reconciliation_incomplete"
            message = "Artifact manifest was resolved, but the requested revision is incomplete."
        else:
            try:
                validate_artifact_manifest(
                    manifest=resolved_manifest,
                    source_revision_id=normalized_request["source_revision_id"],
                    engine_id=normalized_request["engine_id"],
                    engine_version=normalized_request["engine_version"],
                    voice_asset_id=normalized_request["voice_asset_id"],
                    block_revision_hash=normalized_request["block_revision_hash"],
                    text_hash=normalized_request["text_hash"],
                    settings_hash=normalized_request["settings_hash"],
                    chapter_id=normalized_request["chapter_id"],
                    project_id=normalized_request["project_id"],
                )
            except ValueError:
                artifact_state = "stale"
                reason_code = "artifact_stale"
                message = "Artifact manifest does not match the requested revision."
            else:
                artifact_state = "valid"
                reason_code = "artifact_valid"
                message = "Artifact manifest matches the requested revision."
    elif lookup_attempted:
        if missing_fields:
            artifact_state = "unknown"
            reason_code = "reconciliation_incomplete"
            message = "Artifact lookup returned no result, but the requested revision is incomplete."
        elif malformed_manifest_payload:
            artifact_state = "unknown"
            reason_code = "artifact_manifest_invalid"
            message = "Artifact lookup returned manifest metadata that could not be validated."
        else:
            artifact_state = "missing"
            reason_code = "artifact_missing"
            message = "No artifact manifest was found for the requested work item."
    elif malformed_manifest_payload:
        artifact_state = "unknown"
        reason_code = "artifact_manifest_invalid"
        message = "Provided artifact manifest metadata could not be validated."

    normalized_artifact_hash = None
    if resolved_manifest is not None:
        normalized_artifact_hash = resolved_manifest.artifact_hash
    elif artifact_hash is not None:
        normalized_artifact_hash = str(artifact_hash)

    return {
        "job_id": job_id,
        "scope": scope,
        "task_revision_id": task_revision_id,
        "source_revision_id": normalized_request["source_revision_id"],
        "artifact_hash": normalized_artifact_hash,
        "requested_artifact_hash": artifact_hash,
        "artifact_state": artifact_state,
        "reason_code": reason_code,
        "message": message,
        "missing_fields": missing_fields,
        "request_fingerprint": request_fingerprint,
        "requested_revision": normalized_request["requested_revision"],
        "artifact_manifest": _manifest_to_dict(resolved_manifest),
        "requested_manifest": _manifest_to_dict(requested_manifest),
        "artifact_lookup_attempted": lookup_attempted,
        "artifact_source": artifact_source,
        "can_reuse": artifact_state == "valid",
    }


def _normalize_requested_revision(
    *,
    task_revision_id: str,
    requested_revision: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """Normalize the revision request into a stable orchestration payload."""
    requested = dict(requested_revision or {})
    engine = requested.get("engine")
    if isinstance(engine, Mapping):
        engine_id = requested.get("engine_id") or engine.get("id")
        engine_version = requested.get("engine_version") or engine.get("version")
    else:
        engine_id = requested.get("engine_id")
        engine_version = requested.get("engine_version")

    output = _coerce_artifact_output(requested.get("output"))
    source_revision_id = (
        _clean_text(requested.get("source_revision_id"))
        or _clean_text(requested.get("revision_id"))
        or _clean_text(requested.get("task_revision_id"))
        or _clean_text(task_revision_id)
    )

    normalized = {
        "source_revision_id": source_revision_id,
        "engine_id": _clean_text(engine_id),
        "engine_version": _clean_text(engine_version),
        "voice_asset_id": _clean_text(requested.get("voice_asset_id")),
        "block_revision_hash": _clean_text(requested.get("block_revision_hash")),
        "text_hash": _clean_text(requested.get("text_hash")),
        "settings_hash": _clean_text(requested.get("settings_hash")),
        "chapter_id": _clean_text(requested.get("chapter_id")),
        "project_id": _clean_text(requested.get("project_id")),
        "manifest_version": _coerce_manifest_version(requested.get("manifest_version")),
        "output": output,
    }

    return {
        "requested_revision": {
            "source_revision_id": normalized["source_revision_id"],
            "engine_id": normalized["engine_id"],
            "engine_version": normalized["engine_version"],
            "voice_asset_id": normalized["voice_asset_id"],
            "block_revision_hash": normalized["block_revision_hash"],
            "text_hash": normalized["text_hash"],
            "settings_hash": normalized["settings_hash"],
            "chapter_id": normalized["chapter_id"],
            "project_id": normalized["project_id"],
            "manifest_version": normalized["manifest_version"],
            "output": _manifest_output_to_dict(output),
        },
        **normalized,
    }


def _build_requested_manifest(
    *,
    artifact_hash: str | None,
    resolved_manifest: ArtifactManifestModel | None,
    normalized_request: dict[str, Any],
    missing_fields: list[str],
) -> ArtifactManifestModel | None:
    """Build a requested manifest when the revision context is complete enough."""
    if missing_fields:
        return None

    output = normalized_request["output"]
    if output is None:
        return None

    normalized_artifact_hash = _clean_text(artifact_hash)
    if normalized_artifact_hash is None and resolved_manifest is not None:
        normalized_artifact_hash = resolved_manifest.artifact_hash
    if normalized_artifact_hash is None:
        return None

    return build_artifact_manifest(
        artifact_hash=normalized_artifact_hash,
        source_revision_id=normalized_request["source_revision_id"],
        engine_id=normalized_request["engine_id"],
        engine_version=normalized_request["engine_version"],
        voice_asset_id=normalized_request["voice_asset_id"],
        block_revision_hash=normalized_request["block_revision_hash"],
        text_hash=normalized_request["text_hash"],
        settings_hash=normalized_request["settings_hash"],
        output=output,
        manifest_version=normalized_request["manifest_version"],
        chapter_id=normalized_request["chapter_id"],
        project_id=normalized_request["project_id"],
    )


def _missing_request_fields(normalized_request: dict[str, Any]) -> list[str]:
    """Return the request fields required for manifest validation."""
    missing: list[str] = []
    for field_name in _REQUIRED_REQUEST_FIELDS:
        if not normalized_request.get(field_name):
            missing.append(field_name)
    return missing


def _coerce_artifact_manifest(
    candidate: ArtifactManifestModel | Mapping[str, Any] | None,
) -> ArtifactManifestModel | None:
    """Normalize a manifest-like payload into the domain model."""
    if candidate is None:
        return None
    if isinstance(candidate, ArtifactManifestModel):
        return candidate
    if hasattr(candidate, "to_dict") and callable(candidate.to_dict):
        candidate = candidate.to_dict()
    if not isinstance(candidate, Mapping):
        return None

    engine = candidate.get("engine")
    if isinstance(engine, Mapping):
        engine_id = candidate.get("engine_id") or engine.get("id")
        engine_version = candidate.get("engine_version") or engine.get("version")
    else:
        engine_id = candidate.get("engine_id")
        engine_version = candidate.get("engine_version")

    output = _coerce_artifact_output(candidate.get("output"))
    source_revision_id = candidate.get("source_revision_id")
    artifact_hash = candidate.get("artifact_hash")
    request_fingerprint = candidate.get("request_fingerprint")
    block_revision_hash = candidate.get("block_revision_hash")
    text_hash = candidate.get("text_hash")
    settings_hash = candidate.get("settings_hash")

    if not all(
        (
            artifact_hash,
            request_fingerprint,
            engine_id,
            block_revision_hash,
            text_hash,
            settings_hash,
            output,
            source_revision_id,
        )
    ):
        return None

    return ArtifactManifestModel(
        manifest_version=_coerce_manifest_version(candidate.get("manifest_version")),
        artifact_hash=str(artifact_hash),
        request_fingerprint=str(request_fingerprint),
        engine_id=str(engine_id),
        engine_version=_clean_text(engine_version),
        voice_asset_id=_clean_text(candidate.get("voice_asset_id")),
        block_revision_hash=str(block_revision_hash),
        text_hash=str(text_hash),
        settings_hash=str(settings_hash),
        output=output,
        source_revision_id=str(source_revision_id),
        chapter_id=_clean_text(candidate.get("chapter_id")),
        project_id=_clean_text(candidate.get("project_id")),
    )


def _coerce_artifact_output(candidate: Any) -> ArtifactOutputModel | None:
    """Normalize nested output metadata into the manifest output model."""
    if candidate is None:
        return None
    if isinstance(candidate, ArtifactOutputModel):
        return candidate
    if hasattr(candidate, "to_dict") and callable(candidate.to_dict):
        candidate = candidate.to_dict()
    if not isinstance(candidate, Mapping):
        return None

    duration_ms = candidate.get("duration_ms")
    sample_rate = candidate.get("sample_rate")
    channels = candidate.get("channels")
    if duration_ms is None or sample_rate is None or channels is None:
        return None
    return ArtifactOutputModel(
        duration_ms=int(duration_ms),
        sample_rate=int(sample_rate),
        channels=int(channels),
    )


def _coerce_manifest_version(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _manifest_to_dict(manifest: ArtifactManifestModel | None) -> dict[str, Any] | None:
    if manifest is None:
        return None
    return manifest.to_dict()


def _manifest_output_to_dict(output: ArtifactOutputModel | None) -> dict[str, Any] | None:
    if output is None:
        return None
    return {
        "duration_ms": output.duration_ms,
        "sample_rate": output.sample_rate,
        "channels": output.channels,
    }
