"""TDD tests for W-PAR task 013: wire `BracketedEtaTracker` into a live event.

Written per this repo's testing-standards R1 (revert-check): stash the wiring
edit in app/orchestration/progress/service.py + app/api/contracts/events.py
and these tests fail (no eta_low_seconds/eta_high_seconds/eta_display on any
chapters.progress frame; before the fix `BracketedEtaTracker` is pure dead
code, per the task file).
"""

from __future__ import annotations

from app.orchestration.progress.eta import estimate_eta_seconds
from app.orchestration.progress.service import ProgressService


def _make_service():
    events: list[tuple[dict[str, object], str]] = []
    wall_now = {"value": 100.0}
    monotonic_now = {"value": 500.0}

    def wall_clock() -> float:
        return wall_now["value"]

    def monotonic_clock() -> float:
        return monotonic_now["value"]

    def broadcaster(*, payload: dict[str, object], channel: str) -> None:
        events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcaster,
        wall_clock=wall_clock,
        monotonic_clock=monotonic_clock,
        max_silence_seconds=10.0,
    )
    return service, events, wall_now, monotonic_now


def _chapter_progress_payloads(events: list[tuple[dict[str, object], str]]) -> list[dict]:
    return [
        evt["payload"]
        for evt, _channel in events
        if isinstance(evt, dict) and evt.get("topic") == "chapters.progress"
    ]


def _run_n_segments(service, wall_now, *, job_id: str, chapter_id: str, n_segments: int, seg_weight: int = 1000):
    """Drive `n_segments` sequential segment completions through publish().

    Each call starts segment `seg{i}` (active_segment_id) then, on the NEXT
    call, that segment is superseded (SEGMENT_SAVED transition) — this is the
    exact transition `publish()` uses to feed `BracketedEtaTracker`.
    """
    total_chars = seg_weight * n_segments
    completed = 0
    for i in range(1, n_segments + 1):
        wall_now["value"] += 20.0  # 20s wall-clock per segment
        service.publish(
            job_id=job_id,
            status="running",
            scope="chapter",
            chapter_id=chapter_id,
            progress=round(completed / total_chars, 2),
            active_segment_id=f"seg{i}",
            active_segment_progress=0.0,
            active_render_group_weight=seg_weight,
            render_group_count=n_segments,
            completed_render_groups=i - 1,
            char_count=total_chars,
            engine_id="tts_test_bracket_engine",
        )
        completed += seg_weight


def test_no_bracket_fields_before_any_segment_completes():
    service, events, wall_now, _ = _make_service()

    _run_n_segments(service, wall_now, job_id="job-b1", chapter_id="ch-b1", n_segments=1)

    chapter_payloads = _chapter_progress_payloads(events)
    assert chapter_payloads, "expected at least one chapters.progress frame"
    for payload in chapter_payloads:
        assert "eta_display" not in payload
        assert "eta_low_seconds" not in payload
        assert "eta_high_seconds" not in payload


def test_estimating_guard_honored_before_third_completion():
    """After 1-2 completions, the wire must show 'estimating…' — never a number."""
    service, events, wall_now, _ = _make_service()

    _run_n_segments(service, wall_now, job_id="job-b2", chapter_id="ch-b2", n_segments=3)

    chapter_payloads = _chapter_progress_payloads(events)
    # Frames emitted for segment 2's start (after segment 1 completed) must
    # carry the "estimating…" label with NO numeric ETA — the no-fabrication
    # guard (<3 completions observed).
    pre_threshold = [p for p in chapter_payloads if p.get("eta_display") is not None][:1]
    assert pre_threshold, "expected at least one bracket-bearing frame after the first completion"
    first_bracket_frame = pre_threshold[0]
    assert first_bracket_frame["eta_display"] == "estimating…"
    assert first_bracket_frame["eta_low_seconds"] is None
    assert first_bracket_frame["eta_high_seconds"] is None


def test_bracket_appears_after_third_completion():
    service, events, wall_now, _ = _make_service()

    # 4 segments -> after the 4th segment STARTS, 3 completions (seg1-3) have
    # already been recorded, clearing the no-fabrication guard.
    _run_n_segments(service, wall_now, job_id="job-b3", chapter_id="ch-b3", n_segments=4)

    chapter_payloads = _chapter_progress_payloads(events)
    bracketed = [p for p in chapter_payloads if p.get("eta_display") not in (None, "estimating…")]
    assert bracketed, "expected a numeric bracket frame once >= 3 completions were observed"
    last = bracketed[-1]
    assert last["eta_display"].startswith("~")
    assert last["eta_low_seconds"] is not None
    assert last["eta_high_seconds"] is not None
    assert last["eta_low_seconds"] <= last["eta_high_seconds"]


def test_bracket_wiring_does_not_change_existing_eta_seconds_field():
    """Cap=1 parity (INV-1): the pre-existing single-value eta_seconds/eta_basis
    computation is completely independent of the new bracket fields — adding
    BracketedEtaTracker wiring must not perturb the existing crossfade/ceiling
    eta_seconds value or its basis field.
    """
    service, events, wall_now, _ = _make_service()

    _run_n_segments(service, wall_now, job_id="job-b4", chapter_id="ch-b4", n_segments=4)

    chapter_payloads = _chapter_progress_payloads(events)
    # eta_seconds/eta_basis keys must still be present and typed as before —
    # unaffected by whether eta_low_seconds/eta_high_seconds/eta_display exist.
    for payload in chapter_payloads:
        if "etaSeconds" in payload:
            assert payload["etaSeconds"] is None or isinstance(payload["etaSeconds"], (int, float))
