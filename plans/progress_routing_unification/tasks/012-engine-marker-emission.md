# 012 — Engine/relay per-segment marker emission + credit during real synthesis

- **Status:** done — VERDICT: emission path already flows (per-sentence PROGRESS + per-segment START/SAVED, relay normalizes, watchdog credits); regression tests added; captured freeze covered by 001+009. No fix needed.
- **Workload:** WL-C correctness (real-render owner symptom)
- **Severity / type:** major · diagnosis-then-fix
- **Effort:** TBD (gated on 008 verdict)
- **Blocked by:** 008 (must deliver a verdict first)
- **Blocks:** nothing

## Goal
If Task 008's synthetic-marker-stream characterization shows that a clean marker stream advances within-group
progress correctly, then the "progress not updating in a real render" symptom has no owner in the current
plan. This task exists to own that gap: getting `[START_SEGMENT]`/`[PROGRESS]`/`[SEGMENT_SAVED]` markers
to flow from the engine/relay and be credited during a real multi-segment render.

## Why this task exists (the B8 real-render gap)
008 is scoped as characterization against a **synthetic** marker stream. If 008 delivers a "clean-stream
advances" verdict, the documented captures (`debug/chapter-segment.txt:48`, the `0.44-hold` render) had
**zero markers** — the freeze was the model-load window + sub-second synthesis. The credit machinery was
never invoked. The path from engine stdout → relay → `log_listener` → `orchestrator_helpers` credit path
may silently drop, buffer, or never emit markers during a real multi-segment render. This task owns
diagnosing and fixing that engine/relay-side emission gap.

## Triggering condition
This task is **blocked** until 008 closes with its verdict:
- **If 008 verdict = "clean synthetic stream advances, real renders emit no markers"** → unblock this task,
  scope it as engine/relay marker emission work, and begin.
- **If 008 verdict = "clean synthetic stream does NOT advance (credit bug found and fixed in 008)"** →
  this task may not be needed; re-evaluate scope at that point.

## Scope (if unblocked)
1. Reproduce the no-marker condition on a real multi-segment render (confirm zero markers arrive at the
   `log_listener` entry point during synthesis of a known input).
2. Identify where markers are dropped or never emitted: engine plugin stdout, the relay/pipe reader, the
   `log_listener` call in `orchestrator_helpers.py`, or the marker classifier.
3. Fix the emission or relay gap so `[START_SEGMENT]`/`[PROGRESS]`/`[SEGMENT_SAVED]` are delivered during
   real synthesis; verify the within-group credit path fires (reuse the 008 characterization test as the
   regression baseline).
4. If the root cause is that sub-second synthesis completes before markers can be credited, consider adding
   a synthetic heartbeat or fallback progress tick for very short segments.

## Not in scope
- Credit logic changes (008 owns that if needed).
- Cold-load indeterminate UX (009).
- Any enrich/confidence/ETA math.

## Acceptance criteria (draft — to be refined when unblocked)
- [ ] Real multi-segment render produces marker events that arrive at the `log_listener` credit path.
- [ ] Within-group progress advances during real synthesis (no freeze matching the `debug/` captures).
- [ ] Revert-checked test (R1): a real-or-representative render that previously produced zero markers now
      produces credited progress.
- [ ] `pytest tests/orchestration/ plugins/*/tests` and `ruff check` green.
