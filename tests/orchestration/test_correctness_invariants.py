"""W-PAR task 005 — correctness invariants under parallelism.

Covers INV-2 (stitch barrier order), INV-3 (validated artifact completion),
INV-7 (cancel join-all, no post-cancel writes), INV-8 (K-of-N recovery),
R-C (write-contention / state.json routing), the owner-directive retry-once
policy, and the stuck-segment heartbeat (including the 004 dead-worker
residual).

Mock boundaries (R2): only the bridge call hook (``SegmentSynthesisTask``'s
injected ``bridge_call``), ``update_job``/DB writers where noted, and
timing/threading primitives used purely for synchronization. The
``ChapterSynthesisTask``/``SegmentSynthesisTask`` fan-out machinery itself
(the units under test) is never mocked.

No sleep-based timing (R4): all concurrency claims use ``threading.Event``/
``threading.Barrier`` latches.

R1 (revert-check): each test's docstring records the failure mode observed
on pre-fix code; verified by stashing the fix and re-running (see per-test
notes below and the task report).
"""
from __future__ import annotations

import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from app.orchestration.tasks.base import TaskResult


def _make_segment(seg_id: str, order: int, character_id: str | None = None) -> dict:
    return {
        "id": seg_id,
        "character_id": character_id or f"char-{seg_id}",
        "speaker_profile_name": "narrator",
        "character_speaker_profile_name": None,
        "text_content": f"Segment {seg_id} text content here.",
        "segment_order": order,
        "audio_status": "pending",
        "audio_file_path": None,
    }


def _make_chapter_task(task_id: str, chapter_id: str, groups_count: int, **kwargs):
    from app.orchestration.tasks.segment_synthesis import ChapterSynthesisTask  # noqa: PLC0415

    script = [_make_segment(f"{task_id}-seg-{i}", order=i) for i in range(groups_count)]
    defaults = dict(
        task_id=task_id,
        engine_id="xtts",
        chapter_id=chapter_id,
        project_id="proj-1",
        output_path=f"/tmp/{task_id}.wav",
        script=script,
        max_concurrent_workers=groups_count,
    )
    defaults.update(kwargs)
    return ChapterSynthesisTask(**defaults)


@pytest.fixture(autouse=True)
def _reset_semaphores(monkeypatch):
    from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
    # These tests exercise real concurrent admission through
    # `reserve_task_resources` (via the child's real `run()`, not a patched
    # stub) — enable per-engine-class admission so multiple children of the
    # SAME engine can be admitted concurrently, matching the eventual W-PAR
    # enable-gate rather than the ships-dark single exclusive gate.
    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()
    yield
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()


# ---------------------------------------------------------------------------
# Test A — INV-2 shuffled-completion stitch order
# ---------------------------------------------------------------------------


class TestStitchBarrierOrder:
    def test_reverse_completion_order_stitches_in_manuscript_order(self):
        """2 segments complete in reverse order (2 finishes before 1); the
        stitch callback must still receive paths in manuscript order
        [seg_0, seg_1]. (Kept at 2 concurrent children — xtts's manifest
        engine-class cap is 2 — to exercise real concurrent admission rather
        than a stubbed/patched `run()`.)

        R1: on pre-fix code (no `_run_child_with_retry`/`stitch_entries`
        sort, or a `run()` that stitched from raw completion-order
        accumulation) this assertion fails because the list is completion-
        ordered ([seg_1, seg_0]) rather than manuscript-ordered.
        """
        release = {0: threading.Event(), 1: threading.Event()}
        entered = {0: threading.Event(), 1: threading.Event()}

        def _bridge_call(child):
            idx = child.segment_order
            entered[idx].set()
            release[idx].wait(timeout=5)
            return TaskResult(status="completed", output_path=f"/out/seg_{idx}.wav")

        stitched: list[list[str]] = []

        task = _make_chapter_task(
            "chap-stitch-1",
            "chapter-stitch-1",
            groups_count=2,
            bridge_call=_bridge_call,
            stitch_fn=lambda paths: stitched.append(paths),
            max_concurrent_workers=2,
        )

        result_holder: dict = {}

        def _run():
            result_holder["result"] = task.run()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        for idx in (0, 1):
            entered[idx].wait(timeout=5)
        # Release in reverse manuscript order: 1 finishes before 0.
        release[1].set()
        release[0].set()
        t.join(timeout=10)

        assert not t.is_alive()
        assert result_holder["result"].status == "completed"
        assert stitched == [["/out/seg_0.wav", "/out/seg_1.wav"]]


# ---------------------------------------------------------------------------
# Test B — INV-3 one-of-N artifact-validation failure isolation
# ---------------------------------------------------------------------------


class TestArtifactValidatedCompletion:
    def test_zero_byte_wav_is_not_valid_artifact(self, tmp_path):
        """`_is_valid_segment_artifact`/`_group_needs_render` (mixed handler)
        must reject a zero-byte WAV even though the file exists — exit code
        alone is never sufficient (INV-3).

        R1: pre-fix `_group_needs_render` only checked `.exists()`, so a
        zero-byte file was treated as valid and this assertion failed.
        """
        from plugins.tts_mixed.handler import _group_needs_render, _is_valid_segment_artifact

        pdir = tmp_path
        seg_dir = pdir / "segments"
        seg_dir.mkdir()
        zero_byte_wav = seg_dir / "seg-2.wav"
        zero_byte_wav.write_bytes(b"")

        assert _is_valid_segment_artifact(zero_byte_wav) is False

        group = {
            "segments": [
                {"id": "seg-2", "audio_status": "done", "audio_file_path": "seg-2.wav"}
            ]
        }
        assert _group_needs_render(group, pdir) is True, "zero-byte artifact must still need render"

    def test_valid_sibling_groups_are_not_flagged_for_rerender(self, tmp_path):
        """Segments 1 and 3 have valid (real, non-empty) WAVs on disk and
        matching DB state — `_group_needs_render` must return False for them
        (they are reused, not re-rendered), isolating segment 2's failure."""
        import wave

        from plugins.tts_mixed.handler import _group_needs_render

        pdir = tmp_path
        seg_dir = pdir / "segments"
        seg_dir.mkdir()

        def _write_valid_wav(path: Path, seconds: float = 1.0) -> None:
            with wave.open(str(path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(22050)
                wf.writeframes(b"\x00\x00" * int(22050 * seconds))

        _write_valid_wav(seg_dir / "seg-1.wav")
        _write_valid_wav(seg_dir / "seg-3.wav")

        valid_group_1 = {
            "segments": [{"id": "seg-1", "audio_status": "done", "audio_file_path": "seg-1.wav"}]
        }
        valid_group_3 = {
            "segments": [{"id": "seg-3", "audio_status": "done", "audio_file_path": "seg-3.wav"}]
        }

        assert _group_needs_render(valid_group_1, pdir) is False
        assert _group_needs_render(valid_group_3, pdir) is False


# ---------------------------------------------------------------------------
# Test C — INV-7 cancel joins all in-flight children
# ---------------------------------------------------------------------------


class TestCancelJoinsAllInFlight:
    def test_cancel_blocks_until_join_no_post_cancel_writes(self):
        """Cancel mid-fan-out must block the caller's `cancel()` (via
        `task.cancel()` + `task.run()` returning) until every in-flight
        child has observed the stop signal and returned — no child may
        write (emit a completed/output result) after cancel is signalled.

        R1: pre-fix (no `futures_wait(ALL_COMPLETED)` barrier in `run()`
        before consuming futures) a `future.result()` call before the wait
        could still be racing a not-yet-cancelled child, and completed
        writes could land after `stop_event.set()` — this test's
        `writes_after_cancel` assertion is what catches that.
        """
        started = threading.Event()
        writes_after_cancel: list[str] = []
        cancel_seen = threading.Event()

        def _bridge_call(child):
            started.set()
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if child.stop_event.is_set():
                    cancel_seen.set()
                    return TaskResult(status="cancelled")
                time.sleep(0.005)
            writes_after_cancel.append(child.task_id)
            return TaskResult(status="completed", output_path="/out/late.wav")

        task = _make_chapter_task(
            "chap-cancel-inv7", "chapter-cancel-inv7", groups_count=4, bridge_call=_bridge_call
        )

        result_holder: dict = {}

        def _run():
            result_holder["result"] = task.run()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        started.wait(timeout=5)
        task.cancel()
        t.join(timeout=10)

        assert not t.is_alive(), "chapter task did not join all children before returning"
        assert cancel_seen.is_set()
        assert writes_after_cancel == [], "no child may complete/write after cancel is observed (INV-7)"
        assert result_holder["result"].status == "cancelled"

    def test_synthetic_child_task_observes_shared_stop_event_without_own_on_cancel(self):
        """W-PAR 008 self-adversarial finding: a real chapter cancel() only
        ever calls the PARENT ChapterSynthesisTask's on_cancel() — nothing
        calls the per-child synthetic task's own on_cancel(), so its private
        `_cancelled` flag alone would NEVER flip during a real cancel. The
        synthetic task's cancel_check must therefore also consult the shared
        `stop_event` (set once, by the parent, and shared transitively down
        to every child and its synthetic task) so a not-yet-started render
        observes cancellation promptly.

        R1: pre-fix, `_SyntheticSegmentTask`'s cancel_check was a bare
        `lambda: self._cancelled` with no `stop_event` wiring at all — this
        test's `cancel_observed` assertion fails on that code (the lambda
        never becomes True no matter what the shared stop_event does).
        """
        from app.orchestration.tasks.segment_synthesis import _SyntheticSegmentTask

        stop_event = threading.Event()
        synthetic = _SyntheticSegmentTask(
            task_id="synthetic-1",
            engine_id="mixed",
            chapter_id="chapter-1",
            project_id="proj-1",
            script_entry={"id": "seg-1", "ids": ["seg-1"], "text": "Hi", "save_path": "/tmp/seg-1.wav", "weight": 2},
            chapter_dir=Path("/tmp"),
            stop_event=stop_event,
        )

        assert synthetic._is_cancelled() is False, "must not report cancelled before stop_event is set"
        assert synthetic._cancelled is False, "synthetic task's own on_cancel() was never called"

        stop_event.set()

        assert synthetic._is_cancelled() is True, (
            "synthetic child task must observe the shared stop_event as a cancel "
            "signal even though nothing ever calls its own on_cancel()"
        )


# ---------------------------------------------------------------------------
# Test D — INV-8 K-of-N recovery resumes only unfinished segments
# ---------------------------------------------------------------------------


class TestRecoveryKofN:
    def test_recovered_fan_out_submits_only_unfinished_segments(self):
        """4 segments; 1 and 3 (0-indexed: seg-0 and seg-2) already have
        validated artifacts. The recovered fan-out (`needs_render_fn`
        injected) must construct children for exactly the other two.

        R1: pre-fix (`_fan_out_chapter` with no `needs_render_fn` filtering
        hook) constructed all 4 children regardless of validated state —
        this test's length/id assertions fail on that code.
        """
        # Segments seg-0 and seg-2 (manuscript positions 0 and 2) are already validated.
        already_valid_ids = {"chap-recover-1-seg-0", "chap-recover-1-seg-2"}

        def _needs_render(group: dict) -> bool:
            leader_id = group["segments"][0]["id"]
            return leader_id not in already_valid_ids

        task = _make_chapter_task(
            "chap-recover-1",
            "chapter-recover-1",
            groups_count=4,
            needs_render_fn=_needs_render,
        )

        children, _skip_stitch_entries = task._fan_out_chapter()

        submitted_leader_ids = {child.group["segments"][0]["id"] for child in children}
        assert submitted_leader_ids == {"chap-recover-1-seg-1", "chap-recover-1-seg-3"}
        assert len(children) == 2

    def test_recovery_stitch_includes_already_done_segments_not_just_rerendered(self):
        """W-PAR 008 data-loss fix: 4 groups, seg-0 and seg-2 already validated
        (excluded from the fan-out via `needs_render_fn`), seg-1 and seg-3
        actually re-rendered. The final ``ordered_paths`` passed to
        ``stitch_fn`` MUST contain all 4 paths in manuscript (segment_order)
        order — not just the 2 newly-rendered ones.

        R1 (revert-check): on pre-fix code, `_fan_out_chapter` returned only
        the child list (no skip-stitch-entries), and `run()`'s
        `stitch_entries` was seeded fresh (`= []`) rather than from the
        fan-out's skip entries — so a skipped group's already-valid audio
        path never reached the stitch barrier. This test fails on that code:
        `stitched[0]` would be `["/existing/seg_1.wav", "/existing/seg_3.wav"]`
        (2 entries, wrong order relative to seg_0/seg_2) instead of all 4 in
        order. Verified red on the pre-fix `_fan_out_chapter`/`run()` by
        stashing the fix and re-running.
        """
        already_valid = {
            "chap-recover-2-seg-0": "/existing/seg_0.wav",
            "chap-recover-2-seg-2": "/existing/seg_2.wav",
        }

        def _needs_render(group: dict) -> bool:
            leader_id = group["segments"][0]["id"]
            return leader_id not in already_valid

        def _resolve_existing_output(group: dict) -> str | None:
            leader_id = group["segments"][0]["id"]
            return already_valid.get(leader_id)

        def _bridge_call(child):
            idx = child.segment_order
            return TaskResult(status="completed", output_path=f"/rendered/seg_{idx}.wav")

        stitched: list[list[str]] = []

        task = _make_chapter_task(
            "chap-recover-2",
            "chapter-recover-2",
            groups_count=4,
            needs_render_fn=_needs_render,
            resolve_existing_output_fn=_resolve_existing_output,
            bridge_call=_bridge_call,
            stitch_fn=lambda paths: stitched.append(paths),
            max_concurrent_workers=2,
        )

        result = task.run()

        assert result.status == "completed"
        assert len(stitched) == 1, "stitch must fire exactly once (INV-2 barrier)"
        assert stitched[0] == [
            "/existing/seg_0.wav",
            "/rendered/seg_1.wav",
            "/existing/seg_2.wav",
            "/rendered/seg_3.wav",
        ], (
            "stitched paths must include the already-done (skipped) segments "
            f"in manuscript order alongside the newly-rendered ones; got {stitched[0]!r}"
        )

    def test_recovery_full_reuse_still_stitches_from_skip_entries_alone(self):
        """All groups already validated (needs_render_fn excludes every
        group) -> zero children constructed, but the stitch callback must
        still fire once with all N existing paths in manuscript order (a
        fully-recovered chapter must still (re)produce its stitched WAV).

        R1: pre-fix, `run()` short-circuited on `total == 0` with a bare
        `return TaskResult(status="completed", ...)` BEFORE any stitch call —
        `stitch_fn` was never invoked at all on pre-fix code. This test fails
        on that code (0 stitch calls instead of 1).
        """
        existing = {
            "chap-recover-3-seg-0": "/existing/seg_0.wav",
            "chap-recover-3-seg-1": "/existing/seg_1.wav",
            "chap-recover-3-seg-2": "/existing/seg_2.wav",
        }

        def _needs_render(group: dict) -> bool:
            return False

        def _resolve_existing_output(group: dict) -> str | None:
            leader_id = group["segments"][0]["id"]
            return existing.get(leader_id)

        stitched: list[list[str]] = []

        task = _make_chapter_task(
            "chap-recover-3",
            "chapter-recover-3",
            groups_count=3,
            needs_render_fn=_needs_render,
            resolve_existing_output_fn=_resolve_existing_output,
            stitch_fn=lambda paths: stitched.append(paths),
        )

        result = task.run()

        assert result.status == "completed"
        assert len(stitched) == 1, "stitch must still fire once on a full-reuse recovery resume"
        assert stitched[0] == [
            "/existing/seg_0.wav",
            "/existing/seg_1.wav",
            "/existing/seg_2.wav",
        ]


class TestReconstructChapterTaskFromContext:
    def test_recovery_reconstruction_fans_out_only_unfinished_segments(self):
        """End-to-end: a real chapter with 4 segments (own character each ->
        4 groups), 2 already validated on disk (valid WAV + audio_status=done
        pointing at it), reconstructed via
        ``TaskOrchestrator._reconstruct_chapter_task_from_context`` from a
        bare recovered ``TaskContext``. The resulting ``ChapterSynthesisTask``
        must fan out children for exactly the 2 unfinished groups (INV-8),
        wired with a real ``needs_render_fn``/``resolve_existing_output_fn``
        pair derived from ``plugins.tts_mixed.handler``'s own artifact
        validator — not a test-injected stand-in.

        Mock boundaries (R2): none needed above the DB/filesystem — this
        exercises real ``get_chapter``/``get_chapter_segments``/
        ``get_chapter_dir``/``_group_needs_render``/``_group_ready_audio_path``.
        """
        import wave
        from app.db.projects import create_project
        from app.db.chapters import create_chapter
        from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
        from app.core.config import get_chapter_dir
        from app.orchestration.tasks.base import TaskContext
        from app.orchestration.scheduler.orchestrator import TaskOrchestrator
        from unittest.mock import MagicMock

        project_id = create_project("Recovery Project")
        chapter_id = create_chapter(
            project_id, "Recovery Chapter",
            "Alpha segment. Bravo segment. Charlie segment. Delta segment.",
        )
        sync_chapter_segments(chapter_id, "Alpha segment. Bravo segment. Charlie segment. Delta segment.")
        segments = get_chapter_segments(chapter_id)
        assert len(segments) == 4, f"expected 4 sentence segments, got {len(segments)}"

        # Give each segment its own character so build_chunk_groups never
        # coalesces them — 4 groups, one per segment.
        from app.db import get_connection
        with get_connection() as conn:
            cursor = conn.cursor()
            for i, seg in enumerate(segments):
                cursor.execute(
                    "UPDATE chapter_segments SET character_id = ? WHERE id = ?",
                    (f"char-{i}", seg["id"]),
                )
            conn.commit()
        segments = get_chapter_segments(chapter_id)

        chapter_dir = get_chapter_dir(project_id, chapter_id)
        seg_dir = chapter_dir / "segments"
        seg_dir.mkdir(parents=True, exist_ok=True)

        # Segments 0 and 2 already have validated audio on disk.
        already_valid_indexes = {0, 2}
        for i in already_valid_indexes:
            seg = segments[i]
            wav_path = seg_dir / f"{seg['id']}.wav"
            with wave.open(str(wav_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(8000)
                wf.writeframes(b"\x00\x00" * 800)
            update_segment(seg["id"], broadcast=False, audio_status="done", audio_file_path=wav_path.name)

        context = TaskContext(
            task_id="recovered-chap-job-1",
            task_type="synthesis",
            project_id=project_id,
            chapter_id=chapter_id,
            payload={
                "engine": "xtts",
                "project_id": project_id,
                "chapter_id": chapter_id,
                "_recovered": True,
            },
        )

        orchestrator = TaskOrchestrator(progress_service=MagicMock(), voice_bridge=MagicMock())

        with patch("app.engines.behavior.uses_segment_orchestration", return_value=True):
            chapter_task = orchestrator._reconstruct_chapter_task_from_context(context)

        assert chapter_task is not None, "reconstruction must succeed for a segment-orchestrated engine"

        children, skip_entries = chapter_task._fan_out_chapter()

        rendered_leader_ids = {child.group["segments"][0]["id"] for child in children}
        expected_unfinished = {segments[1]["id"], segments[3]["id"]}
        assert rendered_leader_ids == expected_unfinished, (
            f"expected only the 2 unfinished segments to fan out; got {rendered_leader_ids}"
        )
        assert len(children) == 2

        # The 2 already-valid segments must still contribute their existing
        # path to the stitch barrier (the W-PAR 008 bug fix) — not silently
        # dropped from the recovered chapter's final stitched WAV.
        skip_leader_orders = {order for order, _path in skip_entries}
        assert len(skip_entries) == 2
        for order, path in skip_entries:
            assert Path(path).exists(), f"resolved existing output path must be real: {path}"


# ---------------------------------------------------------------------------
# Test E — R-C no state.json corruption under concurrent per-segment writes
# ---------------------------------------------------------------------------


class TestWriteContention:
    def test_concurrent_segment_writes_land_in_sqlite_not_state_json(self, tmp_path, monkeypatch):
        """4 threads concurrently write segment status via
        `update_segments_bulk` (the real per-segment write path). All 4 rows
        must land correctly in SQLite; `state.json` must not be touched by
        this path at all (it is chapter-level only, owned by `update_job`).

        R1: this pins the existing (already-SQLite) write path as a
        regression guard — if a future change routed per-segment writes
        through a `state.json` rewrite, the `save_state`/`STATE_FILE` write
        counter below would go non-zero and fail this test.
        """
        import app.db.state as state_module
        from app.db import segments as segments_module
        from app.db.core import get_connection, init_db

        db_path = tmp_path / "test_write_contention.db"
        monkeypatch.setenv("DB_PATH", str(db_path))
        init_db()

        project_id = "proj-wc-1"
        chapter_id = "chapter-wc-1"
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO projects (id, name) VALUES (?, ?)", (project_id, "WC Project")
            )
            cur.execute(
                "INSERT INTO chapters (id, project_id, title) VALUES (?, ?, ?)",
                (chapter_id, project_id, "Chapter WC"),
            )
            for i in range(4):
                cur.execute(
                    "INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, audio_status) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (f"seg-wc-{i}", chapter_id, i, f"text {i}", "pending"),
                )
            conn.commit()

        save_state_calls = []
        monkeypatch.setattr(state_module, "save_state", lambda *a, **k: save_state_calls.append(1))

        barrier = threading.Barrier(4, timeout=5)

        def _writer(i: int):
            barrier.wait()
            segments_module.update_segments_bulk(
                [f"seg-wc-{i}"], audio_status="done", audio_file_path=f"seg-wc-{i}.wav",
            )

        threads = [threading.Thread(target=_writer, args=(i,)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, audio_status FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order",
                (chapter_id,),
            )
            rows = [dict(r) for r in cur.fetchall()]

        assert len(rows) == 4
        assert all(r["audio_status"] == "done" for r in rows)
        assert save_state_calls == [], "per-segment writes must never touch state.json (R-C)"


# ---------------------------------------------------------------------------
# Test F — retry-once policy (owner directive 2026-07-03)
# ---------------------------------------------------------------------------


class TestRetryOncePolicy:
    def test_segment_fails_once_then_succeeds_chapter_completes(self):
        """Segment 1 fails on attempt 1, succeeds on attempt 2 (the single
        permitted retry) — the chapter completes normally.

        R1: pre-fix (`run()` calling `child.run()` directly with no retry
        wrapper) a single bridge failure is terminal — the chapter never
        reaches `status == "completed"`; this assertion is what catches that.
        """
        attempts: dict[int, int] = {0: 0, 1: 0}

        def _bridge_call(child):
            idx = child.segment_order
            attempts[idx] = attempts.get(idx, 0) + 1
            if idx == 1 and child.attempt == 1:
                return TaskResult(status="failed", message="transient engine error")
            return TaskResult(status="completed", output_path=f"/out/seg_{idx}.wav")

        task = _make_chapter_task(
            "chap-retry-1", "chapter-retry-1", groups_count=2, bridge_call=_bridge_call
        )
        result = task.run()

        assert result.status == "completed"
        assert attempts[1] == 2, "segment 1 must be retried exactly once"
        assert task.permanently_failed_segment_ids == []

    def test_segment_fails_twice_marked_permanent_siblings_unaffected(self):
        """Segment 1 fails on both attempts — it is marked permanently
        failed (no third attempt) and does not block sibling segments 0/2
        from completing, but the chapter overall reports failed-with-partial
        (stitch skipped).

        R1: pre-fix there was no retry/permanent-failure bookkeeping at all,
        so `permanently_failed_segment_ids` didn't exist — AttributeError on
        pre-fix code (or, once patched partially, a third retry attempt
        would occur, which the `attempts[1] == 2` assertion below catches).
        """
        attempts: dict[int, int] = {0: 0, 1: 0, 2: 0}
        stitched: list[list[str]] = []

        def _bridge_call(child):
            idx = child.segment_order
            attempts[idx] = attempts.get(idx, 0) + 1
            if idx == 1:
                return TaskResult(status="failed", message="persistent engine error")
            return TaskResult(status="completed", output_path=f"/out/seg_{idx}.wav")

        task = _make_chapter_task(
            "chap-retry-2",
            "chapter-retry-2",
            groups_count=3,
            bridge_call=_bridge_call,
            stitch_fn=lambda paths: stitched.append(paths),
        )
        result = task.run()

        assert result.status == "failed"
        assert attempts[1] == 2, "segment 1 must be attempted exactly twice, never a third time"
        assert attempts[0] == 1 and attempts[2] == 1, "siblings must not be affected by segment 1's failure"
        assert any("chap-retry-2-seg-1" in sid for sid in task.permanently_failed_segment_ids)
        assert stitched == [], "stitch must be skipped when any segment is permanently failed"


# ---------------------------------------------------------------------------
# Heartbeat / stalled-segment detection (including the 004 dead-worker residual)
# ---------------------------------------------------------------------------


class TestStuckSegmentHeartbeat:
    def test_stalled_segment_flagged_after_stall_threshold(self, monkeypatch):
        """A child that has not ticked its heartbeat past
        `SEGMENT_STALL_TIMEOUT_SECONDS` is flagged `stalled` and surfaces in
        `ChapterSynthesisTask.stalled_segments`; clears once it resumes.

        R1: pre-fix there was no `last_heartbeat`/`stalled` attribute nor
        monitor thread at all — `AttributeError`/empty `stalled_segments`
        on pre-fix code.
        """
        import app.orchestration.tasks.segment_synthesis as seg_mod

        monkeypatch.setattr(seg_mod, "SEGMENT_STALL_TIMEOUT_SECONDS", 0.05)

        hang = threading.Event()
        resume = threading.Event()

        def _bridge_call(child):
            if child.segment_order == 0:
                hang.wait(timeout=5)
                return TaskResult(status="completed", output_path="/out/seg_0.wav")
            resume.wait(timeout=5)
            return TaskResult(status="completed", output_path="/out/seg_1.wav")

        task = _make_chapter_task(
            "chap-heartbeat-1", "chapter-heartbeat-1", groups_count=2, bridge_call=_bridge_call
        )

        result_holder: dict = {}

        def _run():
            result_holder["result"] = task.run()

        t = threading.Thread(target=_run, daemon=True)
        t.start()

        # Wait until the stall monitor has had time to flag segment 0.
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not task.stalled_segments:
            time.sleep(0.01)

        assert task.stalled_segments, "hung segment must be flagged stalled after the threshold"

        hang.set()
        resume.set()
        t.join(timeout=10)

        assert not t.is_alive()
        assert result_holder["result"].status == "completed"

    def test_acquire_worker_does_not_hang_forever_on_dead_worker(self, tmp_path, monkeypatch):
        """004 residual: `WarmWorkerManager._acquire_worker` must not block
        forever on `free_q.get()` when every pooled worker has died without
        being returned to the free-list. It must periodically re-check pool
        liveness (or an injected cancel predicate) rather than hang.

        R1: pre-fix, `_acquire_worker`'s fallback path was a bare
        `self._free_q.get()` with no timeout/poll loop — this test's
        `join(timeout=...)` would fail (thread still alive) on that code.
        """
        from plugins.tts_xtts.plugin.core.warm_worker import WarmWorkerManager

        mgr = WarmWorkerManager(python_exe=Path("/usr/bin/python3"), cap=1)

        class _DeadWorker:
            is_alive = False

            def shutdown(self):
                pass

        # Pool is at cap with a single dead worker; nothing will ever be
        # re-enqueued to free_q by a real run_job — this is the exact 004
        # scenario ("every pooled worker dies while an acquirer waits").
        mgr._pool.append(_DeadWorker())
        mgr._cap = 1

        result_holder: dict = {}
        finished = threading.Event()

        def _acquire():
            result_holder["worker"] = mgr._acquire_worker()
            finished.set()

        t = threading.Thread(target=_acquire, daemon=True)
        t.start()
        # Give the poll loop a couple of cycles to have run and detected the
        # dead worker without a hardcoded ad-hoc timeout constant in the
        # test itself dictating correctness — bounded only by the join.
        finished_in_time = finished.wait(timeout=5)

        assert finished_in_time, "_acquire_worker hung forever on a dead worker (004 residual)"


class TestConcurrentAdmissionWaits:
    """W-PAR 008 live-engine finding (2026-07-03): a semaphore denial during
    real concurrent fan-out commonly means a SIBLING child (same chapter,
    same engine-class semaphore) currently holds the slot — not genuine
    resource exhaustion from unrelated work. Pre-fix, ``SegmentSynthesisTask
    .run()`` treated any denial as an immediate ``retriable=True`` failure,
    and ``_run_child_with_retry`` retries INSTANTLY (no backoff) — so the one
    permitted retry almost always re-hits the same still-busy slot and fails
    again, permanently. Confirmed against the real XTTS engine: with 4
    concurrent children and real ~2s render times, 3 of 4 fan-out children
    failed within single-digit milliseconds (impossible for real synthesis)
    while only the winning child actually rendered.

    R1: pre-fix, this test's child never observes the slot free up — it
    fails immediately on the first denial without ever calling
    ``reserve_task_resources`` a second time; the assertion on
    ``reservation_attempts`` (>= 2, proving it waited/retried admission) and
    ``result.status == "completed"`` both catch that.
    """

    def test_child_waits_for_freed_slot_instead_of_failing_fast(self):
        from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask
        from app.orchestration.scheduler.resources import ResourceClaim

        reservation_attempts = {"count": 0}
        slot_freed = threading.Event()
        first_denial_seen = threading.Event()

        def _fake_reserve(*, task_type, resource_claims):
            reservation_attempts["count"] += 1
            if reservation_attempts["count"] == 1:
                first_denial_seen.set()
                return {"admitted": False, "waiting_reason": "engine-class slot busy"}
            # Slot frees up shortly after the first denial (simulating a
            # sibling child finishing its real render) — but only once the
            # test has confirmed the child actually waited instead of
            # bursting through instant retries.
            slot_freed.wait(timeout=4)
            return {"admitted": True, "waiting_reason": None}

        def _bridge_call(child):
            return TaskResult(status="completed", output_path="/out/seg.wav")

        child = SegmentSynthesisTask(
            task_id="seg-wait-test",
            parent_task_id="chap-wait-test",
            engine_id="xtts",
            group={"segments": [{"id": "s0"}]},
            stop_event=threading.Event(),
            bridge_call=_bridge_call,
            resource_claim=ResourceClaim(engine_class="gpu", cap=1),
        )

        result_holder: dict = {}
        finished = threading.Event()

        def _run():
            result_holder["result"] = child.run()
            finished.set()

        with patch(
            "app.orchestration.scheduler.resources.reserve_task_resources",
            side_effect=_fake_reserve,
        ), patch(
            "app.orchestration.scheduler.resources.release_task_resources",
            lambda **kw: None,
        ):
            t = threading.Thread(target=_run, daemon=True)
            t.start()
            # Wait for the child to hit the first denial and enter its wait
            # loop, then free the slot — proving it polls rather than
            # burning a single instant retry.
            assert first_denial_seen.wait(timeout=5), "child never hit the first admission denial"
            slot_freed.set()
            finished.wait(timeout=5)

        assert result_holder.get("result") is not None, "child.run() never returned — hung waiting for admission"
        result = result_holder["result"]
        assert result.status == "completed", (
            f"child must wait for the slot to free and then succeed, got status={result.status!r} "
            f"message={result.message!r} (pre-fix: fails immediately as retriable on first denial)"
        )
        assert reservation_attempts["count"] >= 2, (
            "child must retry admission after a denial (waiting for the slot), "
            f"got only {reservation_attempts['count']} attempt(s)"
        )


# ---------------------------------------------------------------------------
# Review fixes (W-PAR 008 adversarial pass) — stitch failure propagation,
# segment-scoped recovery fallback, active_segments_map started-gating,
# incremental parent progress.
# ---------------------------------------------------------------------------


class TestStitchFailurePropagation:
    def test_raising_stitch_fn_fails_the_chapter(self):
        """A stitch_fn that raises must fail the chapter task, not crash it
        (and must never let the chapter complete).

        R1: pre-fix, ``run()`` had no try/except around ``self._stitch_fn`` —
        the raise propagated out of ``run()`` (this test errors instead of
        returning a failed TaskResult on pre-fix code).
        """
        def _bridge_call(child):
            return TaskResult(status="completed", output_path=f"/out/{child.segment_order}.wav")

        def _stitch_fn(paths):
            raise RuntimeError("Stitching failed (rc=1).")

        task = _make_chapter_task(
            "chap-stitch-fail", "chapter-stitch-fail", groups_count=2,
            bridge_call=_bridge_call, stitch_fn=_stitch_fn, max_concurrent_workers=1,
        )
        result = task.run()
        assert result.status == "failed"
        assert "Stitching failed" in (result.message or "")

    def test_generation_stitch_fn_raises_on_stitch_failure(self):
        """The live factory's stitch_fn must RAISE when ``stitch_segments``
        fails, so ``run()`` converts it into a failed TaskResult.

        R1: pre-fix, the stitch_fn swallowed the failure (wrote a failed job
        status and returned None) — ``run()`` then returned "completed" and
        the orchestrator's terminal publish overwrote the failure with
        "done" despite no chapter WAV existing. ``pytest.raises`` fails on
        pre-fix code because nothing raises.
        """
        from app.db.projects import create_project
        from app.db.chapters import create_chapter
        from app.db.segments import sync_chapter_segments
        from app.api.routers.generation import _build_chapter_synthesis_task

        project_id = create_project("StitchFail Project")
        chapter_id = create_chapter(project_id, "StitchFail Chapter", "Hello there.")
        sync_chapter_segments(chapter_id, "Hello there.")

        task = _build_chapter_synthesis_task(
            task_id="stitch-fail-job-1",
            engine_id="xtts",
            chapter_id=chapter_id,
            project_id=project_id,
            output_path="/tmp/stitch-fail-job-1.wav",
            active_profile="narrator",
            text_content="Hello there.",
            voice_ref=None,
            display_title="StitchFail",
            is_bake=False,
            safe_mode=False,
            make_mp3=False,
            synthesis_settings={},
        )
        assert task._stitch_fn is not None

        with patch("plugins.tts_mixed.handler.stitch_segments", return_value=1):
            with pytest.raises(RuntimeError, match="Stitching failed"):
                task._stitch_fn(["/tmp/does-not-matter.wav"])

    def test_recovery_stitch_raises_on_stitch_failure(self, tmp_path):
        """``_stitch_recovered_chapter`` must raise on a failed stitch — a
        silent return let a recovered chapter finish as completed with no
        stitched WAV (R1: pre-fix, no raise; pytest.raises fails)."""
        from unittest.mock import MagicMock
        from app.orchestration.tasks.base import TaskContext
        from app.orchestration.scheduler.orchestrator import TaskOrchestrator

        orchestrator = TaskOrchestrator(progress_service=MagicMock(), voice_bridge=MagicMock())
        context = TaskContext(
            task_id="recovered-stitch-fail",
            task_type="synthesis",
            project_id="proj-x",
            chapter_id="chap-x",
            payload={"engine": "xtts"},
        )
        with patch("plugins.tts_mixed.handler.stitch_segments", return_value=1):
            with pytest.raises(RuntimeError, match="Stitching failed"):
                orchestrator._stitch_recovered_chapter(
                    context=context,
                    chapter_dir=tmp_path,
                    output_path=tmp_path / "chapter.wav",
                    segment_paths=[tmp_path / "seg-0.wav"],
                )


class TestSegmentScopedRecoveryFallsBack:
    def test_segment_ids_payload_is_not_reconstructed_as_chapter_fanout(self):
        """A recovered SEGMENT-SCOPED render (payload carries ``segment_ids``)
        must NOT be reconstructed as a ChapterSynthesisTask — that would
        re-render every unfinished group in the whole chapter and stitch/
        overwrite the chapter WAV, when the interrupted job only targeted
        specific segments (handle_mixed_job's segment_ids path renders only
        the target groups and never stitches).

        R1: pre-fix, ``_reconstruct_chapter_task_from_context`` ignored
        ``segment_ids`` and returned a full-chapter ChapterSynthesisTask
        (non-None) for this context.
        """
        from unittest.mock import MagicMock
        from app.orchestration.tasks.base import TaskContext
        from app.orchestration.scheduler.orchestrator import TaskOrchestrator

        orchestrator = TaskOrchestrator(progress_service=MagicMock(), voice_bridge=MagicMock())
        context = TaskContext(
            task_id="recovered-seg-scoped-1",
            task_type="synthesis",
            project_id="proj-seg",
            chapter_id="chap-seg",
            payload={
                "engine": "xtts",
                "project_id": "proj-seg",
                "chapter_id": "chap-seg",
                "segment_ids": ["seg-a", "seg-b"],
                "_recovered": True,
            },
        )
        assert orchestrator._reconstruct_chapter_task_from_context(context) is None


class TestActiveSegmentsMapStartedGating:
    def test_map_excludes_children_not_yet_started(self):
        """``active_segments_map`` must only report children whose ``run()``
        has actually been entered — children still queued behind the parent's
        pool bound are NOT active (C2 contract: presence == genuinely
        in flight).

        R1: pre-fix, the aggregation only excluded ``finished`` children, so
        at cap=1 with 3 groups the first snapshot contained all 3 leader ids
        (2 of which had never started).

        Updated 2026-07-05 (event-driven live map fix): the aggregation is no
        longer re-derived from ``child.started``/``self._children`` at call
        time — it reads ``self._live_segments_map``, populated incrementally
        by ``_on_child_segment_tick`` (the same call a real dispatch makes at
        its own per-tick publish site). This stub ``_bridge_call`` simulates
        that single "started" tick per child; the completion-side pop is
        exercised for real by ``run()``'s own ``as_completed`` loop.
        """
        maps: list[dict] = []
        task_holder: list = []

        def _bridge_call(child):
            leader_id = child.group["segments"][0]["id"]
            task_holder[0]._on_child_segment_tick(
                segment_id=leader_id, status="running", progress=0.0, eta_seconds=None,
            )
            maps.append(dict(task_holder[0]._current_active_segments_map() or {}))
            return TaskResult(status="completed", output_path=f"/out/{child.segment_order}.wav")

        task = _make_chapter_task(
            "chap-startgate", "chapter-startgate", groups_count=3,
            bridge_call=_bridge_call, max_concurrent_workers=1,
        )
        task_holder.append(task)

        result = task.run()
        assert result.status == "completed"
        assert len(maps) == 3
        assert list(maps[0].keys()) == ["chap-startgate-seg-0"], (
            f"first in-flight snapshot must contain ONLY the started child; got {list(maps[0].keys())}"
        )
        all_leader_ids = ["chap-startgate-seg-0", "chap-startgate-seg-1", "chap-startgate-seg-2"]
        for i, snapshot in enumerate(maps):
            # The core invariant this test exists for: a child whose run()
            # has NOT been entered yet must never appear, at any snapshot.
            not_yet_started = set(all_leader_ids[i + 1:])
            leaked = not_yet_started & snapshot.keys()
            assert not leaked, (
                f"snapshot {i} reports {leaked} as active, but that child's run() "
                f"has not started yet; got {snapshot}"
            )
            # A completed child's entry now PERSISTS as phase="done" (2026-07-07
            # fix, escaped defect: popping it on completion was the ONLY live
            # signal keeping the frontend's just-finished-segment text lit, and
            # nothing else refreshes it mid-render) — so snapshot size grows
            # with completed children instead of staying <= 2. Every entry for
            # an ALREADY-STARTED child must be either the transient N/N+1
            # rendering handoff pair or a "done" marker; never anything else.
            for seg_id, entry in snapshot.items():
                assert entry["phase"] in ("rendering", "preparing", "done"), (
                    f"unexpected phase for {seg_id} in snapshot {i}: {entry}"
                )

    def test_permanently_failed_child_never_marked_done_in_map(self):
        """A child that resolves FAILED (retry exhausted) must never surface a
        ``phase="done"`` success marker in ``active_segments_map`` — the
        frontend treats "done" as "keep this segment's text lit as ready" and
        excludes it from the pending/queued sets, so a false marker shows a
        failed segment as successfully finished for the rest of the render.

        R1: on the first cut of the 2026-07-07 done-marker fix, ``run()``'s
        ``as_completed`` loop called ``_on_child_segment_tick(status="done")``
        for EVERY resolved child regardless of ``result.status`` (the hardcoded
        "done" was correct back when every terminal status popped the entry) —
        this test fails there because the failed child's map write carries a
        ``phase="done"`` entry.
        """
        task_holder: list = []

        def _bridge_call(child):
            leader_id = child.group["segments"][0]["id"]
            task_holder[0]._on_child_segment_tick(
                segment_id=leader_id, status="running", progress=0.5, eta_seconds=None,
            )
            return TaskResult(status="failed", message="persistent engine error")

        task = _make_chapter_task(
            "chap-failmark", "chapter-failmark", groups_count=1,
            bridge_call=_bridge_call, max_concurrent_workers=1,
        )
        task_holder.append(task)

        map_writes: list[dict] = []
        from app.db.state import update_job as real_update_job  # noqa: PLC0415

        def _spy_update_job(job_id, *a, **kw):
            if "active_segments_map" in kw:
                map_writes.append(dict(kw["active_segments_map"] or {}))
            return real_update_job(job_id, *a, **kw)

        with patch("app.db.state.update_job", side_effect=_spy_update_job):
            result = task.run()

        assert result.status == "failed"
        leader_id = "chap-failmark-seg-0"
        done_marked = [
            snapshot for snapshot in map_writes
            if (snapshot.get(leader_id) or {}).get("phase") == "done"
        ]
        assert not done_marked, (
            f"a permanently-failed child must never be marked phase='done' in "
            f"active_segments_map; captured done-marked writes: {done_marked}"
        )
        # The failed child's entry is removed (popped), and the terminal clear
        # leaves an explicitly empty map.
        assert map_writes and map_writes[-1] == {}, (
            f"expected the terminal clear to leave an empty map; writes: {map_writes}"
        )


class TestIncrementalParentProgress:
    def test_parent_publishes_progress_while_sibling_still_running(self):
        """The parent must publish chapter-level progress AS EACH CHILD
        COMPLETES, not in a burst after every child has resolved.

        Synchronization (R4, no sleeps): child 1 blocks until the parent has
        published child 0's completion; on pre-fix code (ALL_COMPLETED
        barrier before any result consumption) that publish never happens
        while child 1 is in flight, the wait times out, and the recorded
        flag stays False.
        """
        first_running_publish = threading.Event()
        waited: dict = {}

        class _FakeProgressService:
            def publish(self, **kwargs):
                if kwargs.get("status") == "running":
                    first_running_publish.set()

        def _bridge_call(child):
            if child.segment_order == 0:
                return TaskResult(status="completed", output_path="/out/0.wav")
            waited["ok"] = first_running_publish.wait(timeout=5)
            return TaskResult(status="completed", output_path="/out/1.wav")

        task = _make_chapter_task(
            "chap-incr", "chapter-incr", groups_count=2,
            bridge_call=_bridge_call, max_concurrent_workers=2,
        )
        task._progress_service = _FakeProgressService()

        result = task.run()
        assert result.status == "completed"
        assert waited.get("ok") is True, (
            "parent never published a running progress frame while a sibling "
            "was still in flight (end-burst publishing regression)"
        )
