# Task 013 — Wire `BracketedEtaTracker` into a live event

Status: complete — 2026-07-11 (live-render verification below still pending owner)

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

- [x] `BracketedEtaTracker` is genuinely consumed by a live event frame (not just imported and unused) — `ProgressService.publish()` feeds it real segment completions, `build_chapter_progress_event` carries `eta_low_seconds`/`eta_high_seconds`/`eta_display`.
- [x] The ≥3-completions no-fabrication guard is honored end-to-end — fields absent before any completion, `eta_display=="estimating…"` with null bounds for 1-2 completions, real bracket from the 3rd on (`test_bracketed_eta_wiring.py`).
- [x] At cap=1, ETA output is byte-identical to today's existing single-stream calculation (`test_eta_bracket_and_engine_cap.py::TestBracketedEtaCap1Parity` still passes unmodified).
- [x] `live-events.md` (1.9.6→1.9.7) and `progress-presentation.md` (1.10.2→1.10.3) updated with changelog rows; known-gap sections rewritten.
- [x] `./venv/bin/python -m pytest -q` clean (orchestrator re-ran `test_bracketed_eta_wiring.py` + `test_eta_bracket_and_engine_cap.py` independently: 23/23 pass).
- [ ] **Not yet done — requires a live render.** Live-verify: render a chapter with cap>1, confirm the ETA transitions from "estimating…" to a bracketed range after the third segment completes and reads sensibly.

**Note (orchestrator-verified deviation, accepted):** the implementer also plumbed `engine_id` end-to-end through `OrchestratorPublishMixin` → `ProgressService.publish()` — a pre-existing gap where `engine_id` was never threaded to `publish()`, which would have made this task's bracket-pool keying always collapse to one `"default"` pool. Minimal, mechanical, additive fix; reviewed and accepted as in-scope (without it this task's own deliverable would be functionally inert in production).

## Map links

Part O in `01-map.md`'s Phase 2 section.

## Dependencies

Loosely depends on 008 for render-monitor-specific ETA display, but is independently valuable to Phase 1's existing chapter-level ETA even without the monitor — can be done in parallel with 008-011.

## Out of scope

Do not modify `BracketedEtaTracker`'s internal algorithm — it's already built and tested; this is a wiring task only. If the algorithm itself needs changes, that's a separate finding to flag, not silently fix here.
