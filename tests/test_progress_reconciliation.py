from app.domain.artifacts.manifest import build_artifact_manifest
from app.domain.artifacts.models import ArtifactOutputModel
from app.orchestration.progress.reconciliation import reconcile_work_item
from app.orchestration.progress.service import ProgressService
from app.orchestration.progress.eta import estimate_eta_seconds


def _make_request(**overrides):
    request = {
        "source_revision_id": "rev-1",
        "engine_id": "xtts",
        "engine_version": "2.0.0",
        "voice_asset_id": "voice-1",
        "block_revision_hash": "sha256:block",
        "text_hash": "sha256:text",
        "settings_hash": "sha256:settings",
        "chapter_id": "chapter-1",
        "project_id": "project-1",
        "manifest_version": 1,
        "output": ArtifactOutputModel(duration_ms=12000, sample_rate=24000, channels=1),
    }
    request.update(overrides)
    return request


def test_reconcile_work_item_marks_valid_artifacts_reusable():
    request = _make_request()
    manifest = build_artifact_manifest(
        artifact_hash="sha256:artifact",
        source_revision_id="rev-1",
        engine_id="xtts",
        engine_version="2.0.0",
        voice_asset_id="voice-1",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        output=request["output"],
        chapter_id="chapter-1",
        project_id="project-1",
    )

    result = reconcile_work_item(
        job_id="job-valid",
        task_revision_id="rev-1",
        artifact_hash="sha256:artifact",
        scope="chapter",
        requested_revision=request,
        artifact_manifest=manifest,
    )

    assert result["artifact_state"] == "valid"
    assert result["can_reuse"] is True
    assert result["reason_code"] == "artifact_valid"
    assert result["request_fingerprint"] == manifest.request_fingerprint
    assert result["artifact_manifest"]["artifact_hash"] == "sha256:artifact"


def test_reconcile_work_item_marks_stale_manifests():
    request = _make_request(engine_version="2.0.1")
    manifest = build_artifact_manifest(
        artifact_hash="sha256:artifact",
        source_revision_id="rev-1",
        engine_id="xtts",
        engine_version="2.0.0",
        voice_asset_id="voice-1",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        output=request["output"],
        chapter_id="chapter-1",
        project_id="project-1",
    )

    result = reconcile_work_item(
        job_id="job-stale",
        task_revision_id="rev-1",
        artifact_hash="sha256:artifact",
        requested_revision=request,
        artifact_manifest=manifest,
    )

    assert result["artifact_state"] == "stale"
    assert result["can_reuse"] is False
    assert result["reason_code"] == "artifact_stale"


def test_reconcile_work_item_rejects_artifact_hash_mismatches():
    request = _make_request()
    manifest = build_artifact_manifest(
        artifact_hash="sha256:actual-artifact",
        source_revision_id="rev-1",
        engine_id="xtts",
        engine_version="2.0.0",
        voice_asset_id="voice-1",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        output=request["output"],
        chapter_id="chapter-1",
        project_id="project-1",
    )

    result = reconcile_work_item(
        job_id="job-hash-mismatch",
        task_revision_id="rev-1",
        artifact_hash="sha256:requested-artifact",
        requested_revision=request,
        artifact_manifest=manifest,
    )

    assert result["artifact_state"] == "stale"
    assert result["can_reuse"] is False
    assert result["reason_code"] == "artifact_hash_mismatch"
    assert result["artifact_hash"] == "sha256:actual-artifact"
    assert result["requested_artifact_hash"] == "sha256:requested-artifact"


def test_reconcile_work_item_marks_missing_artifacts():
    request = _make_request()

    result = reconcile_work_item(
        job_id="job-missing",
        task_revision_id="rev-1",
        artifact_hash="sha256:missing",
        requested_revision=request,
        artifact_lookup=lambda _request: None,
    )

    assert result["artifact_state"] == "missing"
    assert result["can_reuse"] is False
    assert result["reason_code"] == "artifact_missing"
    assert result["requested_artifact_hash"] == "sha256:missing"


def test_reconcile_work_item_degrades_lookup_failures_to_unknown():
    request = _make_request()
    expected_fingerprint = build_artifact_manifest(
        artifact_hash="sha256:artifact",
        source_revision_id="rev-1",
        engine_id="xtts",
        engine_version="2.0.0",
        voice_asset_id="voice-1",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        output=request["output"],
        chapter_id="chapter-1",
        project_id="project-1",
    ).request_fingerprint

    result = reconcile_work_item(
        job_id="job-lookup-error",
        task_revision_id="rev-1",
        artifact_hash="sha256:missing",
        requested_revision=request,
        artifact_lookup=lambda _request: (_ for _ in ()).throw(RuntimeError("lookup failed")),
    )

    assert result["artifact_state"] == "unknown"
    assert result["reason_code"] == "artifact_lookup_failed"
    assert result["artifact_source"] == "lookup_error"
    assert result["can_reuse"] is False
    assert result["artifact_lookup_error"] == "lookup failed"
    assert result["request_fingerprint"] == expected_fingerprint


def test_reconcile_work_item_marks_malformed_lookup_payloads_unknown():
    request = _make_request()

    result = reconcile_work_item(
        job_id="job-bad-manifest",
        task_revision_id="rev-1",
        artifact_hash="sha256:artifact",
        requested_revision=request,
        artifact_lookup=lambda _request: {"artifact_hash": "sha256:artifact"},
    )

    assert result["artifact_state"] == "unknown"
    assert result["reason_code"] == "artifact_manifest_invalid"
    assert result["can_reuse"] is False


def test_reconcile_work_item_marks_incomplete_requests_unknown():
    manifest = build_artifact_manifest(
        artifact_hash="sha256:artifact",
        source_revision_id="rev-1",
        engine_id="xtts",
        engine_version="2.0.0",
        voice_asset_id="voice-1",
        block_revision_hash="sha256:block",
        text_hash="sha256:text",
        settings_hash="sha256:settings",
        output=ArtifactOutputModel(duration_ms=12000, sample_rate=24000, channels=1),
        chapter_id="chapter-1",
        project_id="project-1",
    )

    result = reconcile_work_item(
        job_id="job-unknown",
        task_revision_id="rev-1",
        artifact_manifest=manifest,
        requested_revision={
            "source_revision_id": "rev-1",
            "text_hash": "sha256:text",
            "settings_hash": "sha256:settings",
        },
    )

    assert result["artifact_state"] == "unknown"
    assert result["can_reuse"] is False
    assert result["reason_code"] == "reconciliation_incomplete"
    assert result["missing_fields"] == ["engine_id", "block_revision_hash"]


def test_progress_service_reconcile_passes_request_context():
    captured: dict[str, object] = {}

    service = ProgressService(
        reconcile_fn=lambda **kwargs: captured.update(kwargs) or kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=lambda *, payload, channel: None,
    )

    request = _make_request()
    result = service.reconcile(
        job_id="job-service",
        task_revision_id="rev-1",
        artifact_hash="sha256:artifact",
        scope="chapter",
        requested_revision=request,
        artifact_manifest={"artifact_hash": "sha256:artifact", "request_fingerprint": "fp"},
    )

    assert result["job_id"] == "job-service"
    assert captured["scope"] == "chapter"
    assert captured["requested_revision"] == request
