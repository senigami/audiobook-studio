# Task 013 — Wire `BracketedEtaTracker` into a live event

Status: pending

Risk: quality-sensitive (progress/ETA display — this project has a standing progress-no-fabrication principle; getting this wrong risks a fabricated-looking number)

## Goal

Connect the already-built, already-unit-tested `BracketedEtaTracker`/`BracketedEtaResult` (`app/orchestration/progress/eta.py`, built in Phase 1 task 007) to an actual live progress frame — today it's built and tested but wired into nothing a real consumer reads.

## Why this matters

Both the render monitor's ETA display (Phase 2) and Phase 1's own chapter-level ETA under parallelism depend on this. Per Phase 1 task 007's own documentation (`TASKS.md`, W-PAR entry): "**Not wired** into `ProgressService.enrich()` or any live frame this session — explicitly documented as a known gap (`live-events.md` 1.9.3 §7, `progress-presentation.md` 1.9.0 §4A.11)." This task closes that gap.

## Exact files

- `app/orchestration/progress/eta.py` (`BracketedEtaTracker`, `BracketedEtaResult` — read fully first, do not re-derive the algorithm, it's already built and tested)
- Wherever `ProgressService.enrich()` lives (search `app/orchestration/progress/`)
- The live event builder that currently produces chapter-level ETA (find via the existing `eta_seconds`/`indeterminate` fields already on wire types)

## Current shape (verified)

`BracketedEtaTracker` implements: rolling-throughput (K=10) / bottleneck-pool model, the `"estimating…"` no-fabrication guard until ≥3 completions, and exact cap=1 parity with today's single-stream CPS (pinned by an existing test, per `tests/orchestration/test_eta_bracket_and_engine_cap.py`). It is a pure, already-tested utility — this task is purely a wiring task, not an algorithm task.

## Steps

1. Read `eta.py` fully to understand `BracketedEtaTracker`'s exact call contract (what it needs fed in, what it returns).
2. Find `ProgressService.enrich()` (or the equivalent live-frame-building function) and identify exactly where chapter/segment ETA is currently computed for the live WS frame.
3. Wire `BracketedEtaTracker` in at that point, feeding it the real per-segment/per-worker completion data it needs.
4. Confirm the ≥3-completions "estimating…" guard is honored on the wire (no fabricated countdown before threshold) — this repeats the same no-fabrication rule Phase 1 task 007 already established; do not weaken it.
5. Bump `live-events.md`/`progress-presentation.md` per this repo's "behavior change updates the spec in the same commit" rule — both specs already have placeholder "known gap" entries (1.9.3 §7 / 1.9.0 §4A.11) documenting exactly what needs to change; update those sections to reflect the real wiring instead of the gap note.

## Acceptance criteria

- [ ] `BracketedEtaTracker` is genuinely consumed by a live event frame (not just imported and unused).
- [ ] The ≥3-completions no-fabrication guard is honored end-to-end, verified by a test that asserts no numeric ETA appears before the third completion.
- [ ] At cap=1, ETA output is byte-identical to today's existing single-stream calculation (parity test already exists per `test_eta_bracket_and_engine_cap.py` — confirm it still passes, extend if this wiring touches new code paths it doesn't already cover).
- [ ] `live-events.md` and `progress-presentation.md`'s "known gap" sections updated to reflect the real wiring, with a changelog row.
- [ ] `./venv/bin/python -m pytest -q` clean.
- [ ] Live-verify: render a chapter with cap>1, confirm the ETA shown transitions from "estimating…" to a bracketed range after the third segment completes, and that it reads sensibly (not wildly different from the old single-stream estimate at cap=1).

## Map links

Part O in `01-map.md`'s Phase 2 section.

## Dependencies

Loosely depends on 008 for render-monitor-specific ETA display, but is independently valuable to Phase 1's existing chapter-level ETA even without the monitor — can be done in parallel with 008-011.

## Out of scope

Do not modify `BracketedEtaTracker`'s internal algorithm — it's already built and tested; this is a wiring task only. If the algorithm itself needs changes, that's a separate finding to flag, not silently fix here.
