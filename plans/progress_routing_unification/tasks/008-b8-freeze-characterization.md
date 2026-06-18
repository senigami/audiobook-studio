# 008 — B8 freeze characterization (re-scoped)

- **Status:** not-started
- **Workload:** WL-C correctness
- **Severity / type:** major · diagnosis-then-fix
- **Effort:** M
- **Blocked by:** nothing (independent of the enrich chain)
- **Blocks:** nothing

## Goal
Determine — with a **synthetic-marker-stream unit test** — whether a *clean* `[START_SEGMENT]`/`[PROGRESS]`
marker stream actually advances within-group progress through the existing credit machinery. If it does,
then the captured "B8 freeze" is **not** a credit-logic bug — it was a **no-marker** render (model cold-load
+ sub-second synthesis) and the real fix lives engine/relay-side (a separate task). This task's binding
output is the characterization test + a clear verdict, NOT a rewrite of credit logic.

## Why this matters — what v1 got wrong
v1's B8 task assumed uncredited markers and proposed editing the credit path. But the within-group credit
machinery **already exists** (`orchestrator_helpers.py:465-477` `_get_grouped_progress`, and the segment
start/progress handling around `:720-732`), and the **captured render had zero
`[START_SEGMENT]`/`[PROGRESS]` markers** — the freeze was model-load + sub-second synthesis, not uncredited
markers (`../00-architecture-map.md` §4). So editing credit logic would be fixing a bug that the evidence
does not show. The honest first move is to characterize the machinery, then route to the real cause.

## ⚠️ Do not conflate the two captures
There are **two different renders** in the debug evidence: a `0.44-hold` capture and a `0→0.91` capture.
They are not the same job; do not reason about one using the other's frames. Treat each as a distinct data
point. The live "did the segment highlight fire" is **owner manual evidence**, not part of the autonomous
gate.

## Context an executor needs
- Credit machinery (already present): `app/orchestration/scheduler/orchestrator_helpers.py`:
  `_get_grouped_progress` (465-477) computes weighted progress; the segment-start / per-segment progress
  handling around 720-732 (`segment_starts`, `active_seg_progress[0]`, `_observed_remaining_seconds`).
- The marker classifier: `app/api/contracts/events.py:209` `classify_tts_log_line` (maps
  `START_SEGMENT`/`PROGRESS`/`SEGMENT_SAVED` etc.); marker literals at `events.py:206` (`TtsLogLineMarker`).
- The log listener / relay that turns engine stdout markers into progress credit — find it (grep
  `START_SEGMENT`, `log_listener`, `match_timing_marker`); the test drives a synthetic marker stream into
  that listener.
- Per-engine marker patterns: `plugins/*/manifest.json` `behavior.progress_pattern` + `app/engines/behavior.py`
  `match_timing_marker` (referenced at `events.py:213`).

## Target shape / contract
- A unit test that feeds a **clean synthetic marker stream** (`START_SYNTHESIS`, several `START_SEGMENT` +
  `PROGRESS` ticks per segment, `SEGMENT_SAVED`) into the log-listener/credit path and asserts within-group
  progress **advances monotonically** between groups (no freeze) and ETA is credited per segment.
- A written **verdict** in the task/PR: if the clean stream advances → the real freeze is **no markers**
  (engine cold-load / sub-second synth) → file a **separate** engine/relay task (marker emission or a
  synthetic heartbeat during model load); do NOT change credit logic here. If the clean stream **does not**
  advance → there IS a credit bug; fix it here with a revert-checked test.

## Steps
1. Locate the log-listener/credit entry point (grep `START_SEGMENT` / `match_timing_marker`).
2. Write the synthetic-marker-stream unit test (R4: no sleeps; drive markers directly).
3. Run it. Record the verdict.
4. If credit advances cleanly: write up that the freeze is no-marker (cite the zero-marker capture); spawn
   a separate engine/relay task for marker emission during cold-load (cross-reference 009). Close this task
   as "characterized — no credit bug."
5. If credit does NOT advance: identify the gap, add a revert-checked fix + test.
6. `./venv/bin/python -m pytest tests/orchestration/ plugins/*/tests -q` and `ruff check`.

## Acceptance criteria
- [ ] A synthetic clean-marker-stream unit test exists and asserts within-group advance + per-segment ETA
      credit (R4: no sleeps).
- [ ] A documented verdict: clean stream advances (→ no-marker root cause, separate task spawned) OR a real
      credit bug is found and fixed with a revert-checked test.
- [ ] No credit-logic edits unless the test proves a credit bug.
- [ ] The two captures (`0.44-hold` vs `0→0.91`) are treated as distinct; no cross-contaminated reasoning.
- [ ] `pytest tests/orchestration/ plugins/*/tests` and `ruff check` green.

## Out of scope
- The cold-load indeterminate UX — 009 (this may *cause* the separate engine/relay task to be filed).
- Any change to the enrich kernel / confidence / ETA math.
