"""Proactive chapter-timing sidecar emission at chapter render finalization
(synced-reader Task 4).

The orchestrator writes a `<chapter_wav_stem>.timing.json` reader-sync sidecar
next to a chapter's canonical WAV the moment a chapter synthesis job
finalizes as completed -- the sibling hook to `_emit_chapter_peaks_sidecar`,
fired at the same single engine-agnostic completion point in
`TaskOrchestrator.submit()` (`task_type == "synthesis"`, `scope == "chapter"`),
per `design-docs/plans/active/synced_reader/01-findings.md` §1-4.

Per R2 (mock boundaries only), these tests never mock the orchestrator hook
itself (the unit under test) or `build_chunk_groups`/`get_chapter_segments`/
`get_chapter` (real DB + real fixture WAV files instead) -- the only thing
mocked is resource admission (`reserve_task_resources`/`release_task_resources`),
identical to `test_peaks_emission_on_finalize.py`.
"""

from __future__ import annotations

import json
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import get_chapter_dir
from app.db.chapters import create_chapter, update_chapter
from app.db.core import get_connection
from app.db.projects import create_project
from app.domain.chapters.timing import validate_timing_sidecar
from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult

FRAMERATE = 24000


def _write_wav(path: Path, num_frames: int, framerate: int = FRAMERATE) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(b"\x00\x00" * num_frames)


def _frames_for_seconds(seconds: float, framerate: int = FRAMERATE) -> int:
    return round(seconds * framerate)


def _insert_segments(chapter_id: str, texts: list[str]) -> list[str]:
    """Insert one chapter_segments row per text, each with a distinct
    ``character_id`` so ``build_chunk_groups`` never merges them -- one group
    per segment, matching the fixture's 1:1 group<->wav expectation.
    """
    segment_ids = []
    with get_connection() as conn:
        cursor = conn.cursor()
        for order, text in enumerate(texts):
            segment_id = f"seg-{chapter_id[:8]}-{order}"
            cursor.execute(
                """
                INSERT INTO chapter_segments
                    (id, chapter_id, segment_order, text_content, character_id, audio_status)
                VALUES (?, ?, ?, ?, ?, 'done')
                """,
                (segment_id, chapter_id, order, text, f"char-{order}"),
            )
            segment_ids.append(segment_id)
        conn.commit()
    return segment_ids


def _write_group_wavs(chapter_dir: Path, segment_ids: list[str], durations_s: list[float]) -> list[int]:
    segments_dir = chapter_dir / "segments"
    segments_dir.mkdir(parents=True, exist_ok=True)
    frame_counts = []
    for segment_id, seconds in zip(segment_ids, durations_s):
        frames = _frames_for_seconds(seconds)
        _write_wav(segments_dir / f"{segment_id}.wav", frames)
        frame_counts.append(frames)
    return frame_counts


@pytest.fixture
def chapter_with_groups(clean_db, tmp_path):
    """A real project/chapter/segments row set (3 groups, one segment each)
    with matching group WAV files under the chapter's real ``segments/`` dir,
    plus a chapter WAV whose duration matches the group sum exactly (zero
    drift). Returns a dict of everything a test needs.
    """
    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        project_id = create_project("Timing Sidecar Project")
        chapter_id = create_chapter(project_id, "Chapter 1")

        durations_s = [2.0, 1.5, 1.0]
        segment_ids = _insert_segments(
            chapter_id, ["Hello there.", "Second line here.", "Third and final line."]
        )
        chapter_dir = get_chapter_dir(project_id, chapter_id)
        frame_counts = _write_group_wavs(chapter_dir, segment_ids, durations_s)

        chapter_wav = tmp_path / "chapter.wav"
        _write_wav(chapter_wav, num_frames=sum(frame_counts))

        update_chapter(chapter_id, audio_generated_at=1700000000.0)

        yield {
            "project_id": project_id,
            "chapter_id": chapter_id,
            "chapter_dir": chapter_dir,
            "segment_ids": segment_ids,
            "chapter_wav": chapter_wav,
            "durations_s": durations_s,
        }


def _make_chapter_synthesis_task(
    *, wav_path, project_id, chapter_id, scope="chapter", task_id="t-chap-timing"
):
    """Build a MagicMock chapter SynthesisTask whose describe() carries the
    orchestrator-completion payload the hook inspects (task_type/scope/
    output_path/voice_profile_id/chapter_id/project_id) -- mirrors
    `test_peaks_emission_on_finalize.py::_make_chapter_synthesis_task`.
    """
    task = MagicMock(spec=StudioTask)
    task.task_id = task_id
    ctx = TaskContext(
        task_id=task_id,
        task_type="synthesis",
        project_id=project_id,
        chapter_id=chapter_id,
        source="ui",
        payload={
            "engine_id": "xtts",
            "output_path": str(wav_path),
            "scope": scope,
            "voice_profile_id": None,
        },
    )
    task.describe.return_value = ctx
    task.validate.return_value = None
    task.run.return_value = TaskResult(status="completed")
    task.on_cancel.return_value = None
    task.resource_claim = ResourceClaim.none()
    task.is_marker_driven = False
    return task


def _submit_with_admitted_resources(orchestrator, task):
    with patch(
        "app.orchestration.scheduler.orchestrator.reserve_task_resources",
        return_value={"admitted": True},
    ), patch("app.orchestration.scheduler.orchestrator.release_task_resources"):
        return orchestrator.submit(task)


def _sidecar_path_for(chapter_wav: Path) -> Path:
    return chapter_wav.with_suffix(".timing.json")


def test_completed_chapter_render_emits_timing_sidecar(orchestrator, progress_service, chapter_with_groups):
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    fixture = chapter_with_groups
    task = _make_chapter_synthesis_task(
        wav_path=fixture["chapter_wav"],
        project_id=fixture["project_id"],
        chapter_id=fixture["chapter_id"],
    )
    sidecar_path = _sidecar_path_for(fixture["chapter_wav"])
    assert not sidecar_path.exists()

    with patch("app.core.config.PROJECTS_DIR", fixture["chapter_dir"].parents[2]):
        _submit_with_admitted_resources(orchestrator, task)

    assert sidecar_path.exists()
    raw = json.loads(sidecar_path.read_text(encoding="utf-8"))
    timing = validate_timing_sidecar(raw)
    assert timing.chapter_id == fixture["chapter_id"]
    assert timing.group_count == 3
    assert timing.audio_file == fixture["chapter_wav"].name
    assert timing.audio_generated_at == 1700000000.0
    assert [(g.start_ms, g.end_ms) for g in timing.groups] == [
        (0, 2000),
        (2000, 3500),
        (3500, 4500),
    ]
    assert timing.groups[0].segment_ids == [fixture["segment_ids"][0]]


def test_reinvoking_hook_overwrites_sidecar_not_duplicates(
    orchestrator, progress_service, chapter_with_groups
):
    """Re-render (a second finalize of the same chapter WAV with different
    group durations) overwrites the sidecar with fresh content instead of
    appending/duplicating groups."""
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    fixture = chapter_with_groups
    projects_root = fixture["chapter_dir"].parents[2]
    sidecar_path = _sidecar_path_for(fixture["chapter_wav"])

    task_1 = _make_chapter_synthesis_task(
        wav_path=fixture["chapter_wav"],
        project_id=fixture["project_id"],
        chapter_id=fixture["chapter_id"],
        task_id="t-chap-timing-1",
    )
    with patch("app.core.config.PROJECTS_DIR", projects_root):
        _submit_with_admitted_resources(orchestrator, task_1)

    first_raw = json.loads(sidecar_path.read_text(encoding="utf-8"))
    assert len(first_raw["groups"]) == 3

    # Simulate a re-render: same 3 segments/groups, new (longer) audio for
    # every group, plus a matching new chapter WAV.
    new_durations_s = [3.0, 2.0, 2.5]
    new_frame_counts = _write_group_wavs(
        fixture["chapter_dir"], fixture["segment_ids"], new_durations_s
    )
    _write_wav(fixture["chapter_wav"], num_frames=sum(new_frame_counts))

    task_2 = _make_chapter_synthesis_task(
        wav_path=fixture["chapter_wav"],
        project_id=fixture["project_id"],
        chapter_id=fixture["chapter_id"],
        task_id="t-chap-timing-2",
    )
    with patch("app.core.config.PROJECTS_DIR", projects_root):
        _submit_with_admitted_resources(orchestrator, task_2)

    second_raw = json.loads(sidecar_path.read_text(encoding="utf-8"))
    timing = validate_timing_sidecar(second_raw)
    assert len(second_raw["groups"]) == 3, "sidecar must be overwritten, not appended to"
    assert timing.audio_duration_ms == 7500
    assert [(g.start_ms, g.end_ms) for g in timing.groups] == [
        (0, 3000),
        (3000, 5000),
        (5000, 7500),
    ]


def test_missing_group_wav_does_not_raise_and_writes_no_sidecar(
    orchestrator, progress_service, chapter_with_groups
):
    """A group WAV missing at finalize time (should not happen post-finalize,
    but defensive) must not crash the hook or the render's own completion."""
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    fixture = chapter_with_groups
    (fixture["chapter_dir"] / "segments" / f"{fixture['segment_ids'][1]}.wav").unlink()

    task = _make_chapter_synthesis_task(
        wav_path=fixture["chapter_wav"],
        project_id=fixture["project_id"],
        chapter_id=fixture["chapter_id"],
    )
    sidecar_path = _sidecar_path_for(fixture["chapter_wav"])

    with patch("app.core.config.PROJECTS_DIR", fixture["chapter_dir"].parents[2]):
        task_id = _submit_with_admitted_resources(orchestrator, task)

    assert task_id == "t-chap-timing"
    statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
    assert statuses[-1] == "done"
    assert not sidecar_path.exists()


def test_drift_beyond_hard_ceiling_does_not_raise_and_writes_no_sidecar(
    orchestrator, progress_service, chapter_with_groups
):
    """A chapter WAV whose duration wildly disagrees with the group sum
    (TimingReconciliationError, Fable H2) must be swallowed by the hook, not
    propagate and not fail the render."""
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    fixture = chapter_with_groups
    # 1s of frames vs a group sum of 4.5s: far beyond the 250ms hard ceiling.
    _write_wav(fixture["chapter_wav"], num_frames=_frames_for_seconds(1.0))

    task = _make_chapter_synthesis_task(
        wav_path=fixture["chapter_wav"],
        project_id=fixture["project_id"],
        chapter_id=fixture["chapter_id"],
    )
    sidecar_path = _sidecar_path_for(fixture["chapter_wav"])

    with patch("app.core.config.PROJECTS_DIR", fixture["chapter_dir"].parents[2]):
        task_id = _submit_with_admitted_resources(orchestrator, task)

    assert task_id == "t-chap-timing"
    statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
    assert statuses[-1] == "done"
    assert not sidecar_path.exists()


def test_segment_job_does_not_attempt_timing_generation(orchestrator, progress_service, chapter_with_groups):
    """A segment re-render (scope == 'job') is NOT a chapter finalization --
    the hook must skip it entirely (no DB/group reconstruction, no sidecar)."""
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    fixture = chapter_with_groups
    task = _make_chapter_synthesis_task(
        wav_path=fixture["chapter_wav"],
        project_id=fixture["project_id"],
        chapter_id=fixture["chapter_id"],
        scope="job",
    )
    sidecar_path = _sidecar_path_for(fixture["chapter_wav"])

    with patch("app.core.config.PROJECTS_DIR", fixture["chapter_dir"].parents[2]), patch(
        "app.domain.chunk_groups.build_chunk_groups"
    ) as mock_build_groups:
        _submit_with_admitted_resources(orchestrator, task)

    assert mock_build_groups.call_count == 0
    assert not sidecar_path.exists()
