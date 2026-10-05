"""Proactive peaks-sidecar emission at chapter render finalization.

The orchestrator emits a waveform peaks sidecar next to a chapter's canonical
WAV the moment a chapter synthesis job finalizes as completed — so long
chapters (> the browser-decode duration cap) show the waveform tape
immediately instead of waiting for lazy first-request generation by the
GET .../assets/peaks route (audio-player spec §5.4).

This hook lives at the single engine-agnostic completion point in
``TaskOrchestrator.submit()`` (task_type == "synthesis", scope == "chapter"),
so it covers BOTH the XTTS remote-synthesis path and the local ``mixed`` path
without branching on engine id.

Per R2 (mock boundaries only) these tests mock ``compute_peaks_sidecar`` in
``app.engines.audio_ops`` — the ffmpeg/decode boundary — never the
orchestrator hook itself, which is the unit under test.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.scheduler.resources import ResourceClaim


def _sidecar_for(wav_path):
    stat = wav_path.stat()
    return {
        "version": 2,
        "peaks": [0.1, 0.2, 0.3],
        "duration_sec": 700.0,
        "sample_rate": 22050,
        "channels": 1,
        "peaks_per_sec": 60,
        "source": {
            "filename": wav_path.name,
            "size_bytes": stat.st_size,
            "mtime_ns": stat.st_mtime_ns,
        },
    }


def _make_chapter_synthesis_task(*, wav_path, scope="chapter", segment_ids=None):
    """Build a MagicMock chapter SynthesisTask whose describe() carries the
    orchestrator-completion payload the hook inspects (task_type/scope/output_path)."""
    task = MagicMock(spec=StudioTask)
    task.task_id = "t-chap"
    ctx = TaskContext(
        task_id="t-chap",
        task_type="synthesis",
        project_id="p1",
        chapter_id="c1",
        source="ui",
        payload={
            "engine_id": "xtts",
            "output_path": str(wav_path),
            "scope": scope,
            "segment_ids": segment_ids,
        },
    )
    task.describe.return_value = ctx
    task.validate.return_value = None
    task.run.return_value = TaskResult(status="completed")
    task.on_cancel.return_value = None
    task.resource_claim = ResourceClaim.none()
    task.is_marker_driven = False
    return task


@pytest.fixture
def chapter_wav(tmp_path):
    wav_path = tmp_path / "chapter.wav"
    wav_path.write_bytes(b"RIFF....fake chapter wav data")
    return wav_path


def _submit_with_admitted_resources(orchestrator, task):
    with patch(
        "app.orchestration.scheduler.orchestrator.reserve_task_resources",
        return_value={"admitted": True},
    ), patch("app.orchestration.scheduler.orchestrator.release_task_resources"):
        return orchestrator.submit(task)


def test_completed_chapter_render_emits_peaks_sidecar(orchestrator, progress_service, chapter_wav):
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    task = _make_chapter_synthesis_task(wav_path=chapter_wav)
    sidecar_path = chapter_wav.with_suffix(".peaks.json")
    assert not sidecar_path.exists()

    with patch(
        "app.engines.audio_ops.compute_peaks_sidecar",
        side_effect=lambda p: _sidecar_for(p),
    ) as mock_compute:
        _submit_with_admitted_resources(orchestrator, task)

    assert mock_compute.call_count == 1
    assert sidecar_path.exists()


def test_compute_returning_none_does_not_fail_render(orchestrator, progress_service, chapter_wav):
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    task = _make_chapter_synthesis_task(wav_path=chapter_wav)
    sidecar_path = chapter_wav.with_suffix(".peaks.json")

    with patch("app.engines.audio_ops.compute_peaks_sidecar", return_value=None):
        task_id = _submit_with_admitted_resources(orchestrator, task)

    # Render still completes; no sidecar written.
    assert task_id == "t-chap"
    statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
    assert statuses[-1] == "done"
    assert not sidecar_path.exists()


def test_compute_raising_does_not_fail_render(orchestrator, progress_service, chapter_wav):
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    task = _make_chapter_synthesis_task(wav_path=chapter_wav)
    sidecar_path = chapter_wav.with_suffix(".peaks.json")

    with patch(
        "app.engines.audio_ops.compute_peaks_sidecar",
        side_effect=RuntimeError("ffmpeg blew up"),
    ):
        task_id = _submit_with_admitted_resources(orchestrator, task)

    assert task_id == "t-chap"
    statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
    assert statuses[-1] == "done"
    assert not sidecar_path.exists()


def test_segment_job_does_not_emit_peaks(orchestrator, progress_service, chapter_wav):
    """A segment re-render (scope == 'job', segment_ids set) is NOT a chapter
    finalization — the hook must skip it (peaks are for the canonical chapter WAV)."""
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    task = _make_chapter_synthesis_task(wav_path=chapter_wav, scope="job", segment_ids=["s1"])
    sidecar_path = chapter_wav.with_suffix(".peaks.json")

    with patch("app.engines.audio_ops.compute_peaks_sidecar", side_effect=lambda p: _sidecar_for(p)) as mock_compute:
        _submit_with_admitted_resources(orchestrator, task)

    assert mock_compute.call_count == 0
    assert not sidecar_path.exists()


def test_failed_chapter_render_does_not_emit_peaks(orchestrator, progress_service, chapter_wav):
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    task = _make_chapter_synthesis_task(wav_path=chapter_wav)
    task.run.return_value = TaskResult(status="failed", message="engine crashed")
    sidecar_path = chapter_wav.with_suffix(".peaks.json")

    with patch("app.engines.audio_ops.compute_peaks_sidecar", side_effect=lambda p: _sidecar_for(p)) as mock_compute:
        _submit_with_admitted_resources(orchestrator, task)

    assert mock_compute.call_count == 0
    assert not sidecar_path.exists()
