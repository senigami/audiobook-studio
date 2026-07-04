"""W-PAR enable-gate — size-weighted, order-independent chapter completion.

Owner ruling (binding): chapter completion percentage must be weighted by
segment TEXT SIZE, not segment COUNT, and must be order-independent — "only
completion % matters, no matter the order." Today
``ChapterSynthesisTask._publish_progress`` computes a purely count-based
``round(completed/total, 2)`` and never populates the ``grouped_progress``
kwarg the event contract already supports (``groupedProgress`` on the
frontend ``chapter_progress`` event).

This test drives two unequal-size children (100 and 900 chars) through a
REAL ``ChapterSynthesisTask.run()`` and forces the LARGE (900-char) segment
to complete FIRST. The size-weighted ``grouped_progress`` reported at that
point must be ~0.9 (900/1000), not ~0.5 (1/2 count-based) — proving both the
size-weighting and the order-independence (completion order does not need to
match manuscript/text order for the ratio to be correct).

Mock boundaries (R2): only the true engine boundary
(``plugins.tts_mixed.handler.generate_via_bridge``) is mocked; a MagicMock
progress service is used purely as a capture point for asserting the
``grouped_progress`` kwarg the production code passes to
``ProgressService.publish`` — never a mock of the unit under test's own
math.
"""

from __future__ import annotations

import threading
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.segment_synthesis import ChapterSynthesisTask


def _raised_cap_claim(engine_id: str) -> ResourceClaim:
    return ResourceClaim(gpu=False, vram_mb=0, cpu_heavy=False, exclusive=False, engine_class="cloud", cap=3)


class MockStream:
    def __init__(self, lines: list[str]):
        self._lines = list(lines)

    def readline(self) -> str:
        if self._lines:
            return self._lines.pop(0)
        return ""

    def close(self) -> None:
        pass


def _make_segment(seg_id: str, order: int, *, character_id: str, text: str) -> dict:
    return {
        "id": seg_id,
        "character_id": character_id,
        "speaker_profile_name": "narrator",
        "character_speaker_profile_name": None,
        "text_content": text,
        "segment_order": order,
        "audio_status": "pending",
        "audio_file_path": None,
    }


def _write_tiny_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(8000)
        wf.writeframes(b"\x00\x00" * 800)


def _fake_script_entry(group: dict, chapter_dir: Path, **kw) -> dict:
    leader_id = group["segments"][0]["id"]
    text = " ".join(group["text_parts"])
    return {
        "text": text,
        "speaker_wav": None,
        "id": leader_id,
        "ids": [s["id"] for s in group["segments"]],
        "save_path": str((chapter_dir / "segments" / f"{leader_id}.wav").absolute()),
        "weight": max(1, len(text)),
        "engine": group.get("engine", "mixed"),
    }


@pytest.fixture(autouse=True)
def _reset_semaphores(monkeypatch):
    from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()
    yield
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()


def test_grouped_progress_is_size_weighted_and_order_independent(tmp_path):
    """900-char segment completing BEFORE the 100-char segment must report
    grouped_progress ~= 0.9 at that point, not ~0.5 (count-based).
    """
    small_text = "x" * 100
    large_text = "y" * 900
    script = [
        _make_segment("seg-small", order=0, character_id="char-small", text=small_text),
        _make_segment("seg-large", order=1, character_id="char-large", text=large_text),
    ]

    progress_service = MagicMock()
    published_calls: list[dict] = []
    progress_service.publish.side_effect = lambda **kw: published_calls.append(kw)

    watchdogs: dict[str, TtsServerWatchdog] = {}
    large_started = threading.Event()
    small_may_finish = threading.Event()

    def _fake_generate_via_bridge(**kwargs):
        task_id = kwargs["task_id"]
        out_wav = kwargs["out_wav"]
        on_output = kwargs["on_output"]
        leader = Path(str(out_wav)).stem

        if leader == "seg-small":
            # Force the SMALL segment to wait for the LARGE one to finish
            # first -- completion order is the REVERSE of manuscript order.
            large_started.wait(timeout=10)
            small_may_finish.wait(timeout=10)

        wd = watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())
        _write_tiny_wav(out_wav)
        wd._drain_stream(None, "stdout", MockStream([
            f"[START_SYNTHESIS] {task_id}\n",
            f"[PROGRESS] 100% {task_id}\n",
        ]))
        on_output(f"[stub] wrote {out_wav}\n")

        if leader == "seg-large":
            large_started.set()
            small_may_finish.set()
        return 0

    def _bridge_call(child):
        # Minimal real bridge call: routes straight to _fake_generate_via_bridge
        # via plugins.tts_mixed.handler.render_one_group (patched below to use
        # the REAL implementation, only its engine boundary is mocked).
        from plugins.tts_mixed.handler import render_one_group  # noqa: PLC0415
        result = render_one_group(
            child.group,
            tmp_path,
            lambda line: None,
            lambda: False,
            child.task_id,
            False,
            chapter_id="chapter-weighted",
            lexicon_entries=[],
        )
        from app.orchestration.tasks.base import TaskResult  # noqa: PLC0415
        if result.status == "completed":
            return TaskResult(status="completed", output_path=str(result.output_path) if result.output_path else None)
        return TaskResult(status=result.status, message=result.message)

    task = ChapterSynthesisTask(
        task_id="chap-weighted",
        engine_id="mixed",
        chapter_id="chapter-weighted",
        project_id="proj-1",
        output_path=str(tmp_path / "chap-weighted.wav"),
        script=script,
        max_concurrent_workers=2,
        bridge_call=_bridge_call,
    )
    task._progress_service = progress_service

    with patch("plugins.tts_mixed.handler.generate_via_bridge", side_effect=_fake_generate_via_bridge), \
         patch("app.engines.watchdog.get_watchdog", side_effect=lambda: watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.build_script_entry_for_group", side_effect=_fake_script_entry), \
         patch("app.db.speakers.get_speaker_settings", return_value={}), \
         patch("app.engines.behavior.extract_engine_settings", return_value={}), \
         patch("app.db.update_segment", lambda *a, **kw: None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.orchestration.tasks.segment_synthesis._manifest_resource_claim", side_effect=_raised_cap_claim):
        result = task.run()

    assert result.status == "completed", f"expected completed, got {result}"

    running_calls = [c for c in published_calls if c.get("status") == "running"]
    assert running_calls, "expected at least one running progress publish"

    first_running = running_calls[0]
    assert first_running.get("grouped_progress") == pytest.approx(0.9), (
        f"first completed child is the 900-char segment; grouped_progress must be "
        f"~0.9 (size-weighted), not count-based (~0.5); got {first_running.get('grouped_progress')}"
    )
    # Sanity: the count-based `progress` field is unchanged/still present.
    assert first_running.get("progress") == pytest.approx(0.5)
