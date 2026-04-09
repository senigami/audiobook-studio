"""Progress and artifact reconciliation helpers."""

from __future__ import annotations

from app.domain.artifacts.manifest import build_artifact_manifest


def reconcile_work_item(
    *,
    job_id: str,
    task_revision_id: str,
    artifact_hash: str | None = None,
) -> dict[str, object]:
    """Describe revision-safe reconciliation before progress resumes.

    Args:
        job_id: Stable job identifier being reconciled.
        task_revision_id: Revision identifier the job intends to satisfy.
        artifact_hash: Optional known artifact hash already linked to the job.

    Returns:
        dict[str, object]: Placeholder reconciliation result payload.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _load_existing_artifact(job_id=job_id, artifact_hash=artifact_hash)
    _ = _compare_revision_state(task_revision_id=task_revision_id)
    _ = build_artifact_manifest
    raise NotImplementedError


def _load_existing_artifact(
    *, job_id: str, artifact_hash: str | None
) -> dict[str, object] | None:
    """Describe how reconciliation would look up any existing artifact output.

    Args:
        job_id: Stable job identifier being reconciled.
        artifact_hash: Optional known artifact hash already linked to the job.

    Returns:
        dict[str, object] | None: Existing artifact context if one is present.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (job_id, artifact_hash)
    raise NotImplementedError


def _compare_revision_state(*, task_revision_id: str) -> dict[str, object]:
    """Describe revision comparison between queued work and current truth.

    Args:
        task_revision_id: Revision identifier the job intends to satisfy.

    Returns:
        dict[str, object]: Placeholder revision comparison result.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
