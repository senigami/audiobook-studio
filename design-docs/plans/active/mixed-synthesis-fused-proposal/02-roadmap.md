# Roadmap — Mixed-Engine Model-Load Fix

> **TL;DR:** Five workstreams. W1 (marker resolution) is the keystone and must land first — it makes the load window *detectable* for mixed, which everything else depends on. W2 (metrics) and W3 (ETA/phase) build on it; W4 (frontend) consumes the corrected signals; W5 (resource claim) is the owner-gated optional. Specs update alongside the code that changes them (joint authority).

## Dependency graph

```
W1 (marker resolution: detect load per active engine)
 ├─► W2 (synthesis-only metrics, sole writer)
 └─► W3 (ETA suspension + null-clear + per-group preparing phase)
        └─► W4 (frontend preparing tier + reasonCode + relabel)
W5 (mixed ResourceClaim) — independent; owner-gated
W6 (spec reconciliation) — folds into W1–W4 as they land
```

## Workstreams

### W1 — Detect model-load for mixed (keystone)
Resolve timing markers / progress patterns by the **active group's engine**, not the static `engine_id="mixed"`. Optionally add an explicit bracketed per-group load-start/confirm marker emitted by the mixed handler so detection is independent of child-engine stdout strings (robust to warm-vs-cold worker).
- Files: `orchestrator_helpers.py` (`log_listener` marker/engine resolution), `plugins/tts_mixed/handler.py`, `plugins/tts_mixed/manifest.json`.
- Done when: in a mixed render, the XTTS load window produces a recognized `ENGINE_ACTIVITY_STARTED` and `model_load_seconds` is captured.
- Tests: marker resolution for a mixed job with an XTTS group recognizes the load line (R1 revert-check: fails on current code where `match_timing_marker("mixed", "Loading XTTS model...")` is `None`).

### W2 — Synthesis-only duration, single writer
Measure synthesis from engine-confirmation (`segment_starts`) to `SEGMENT_SAVED` only; never fall back to announce time when a load window exists; accumulate `model_load_seconds`/`inter_group_overhead_seconds`. Make the orchestrator the sole render-sample writer; stop the mixed handler writing a load-inclusive `synthesis_duration_seconds`.
- Files: `orchestrator_helpers.py` (`SEGMENT_SAVED` capture, `_record_render_stats_inner`), `plugins/tts_mixed/handler.py`, `app/db/performance.py`.
- Done when: a mixed multi-group render records exactly one sample per group with `synthesis_duration_seconds ≤ wall` and `model_load_seconds` populated; CPS excludes load.
- Tests: regression asserting load excluded + single sample (R1: fails on current duplicate/wall-time path).

### W3 — Suspend ETA + per-group preparing phase (durable status monotonic)
Null `eta_seconds` clears the persisted ETA; during the load window emit `indeterminate=true`, clear segment/chapter ETA, keep authoritative progress unchanged, force emission so the bar updates. Carry preparing as a per-group phase / `reason_code` — **do not** regress durable `status`.
- Files: `orchestrator_publish.py` (null-ETA clear), `orchestrator_helpers.py` (`SEGMENT_PENDING`/load frame).
- Done when: during load the segment/queue ETA is suspended (not animating) and durable status stays `running`.
- Tests: pending frame clears ETA and freezes the bar; confirmation resumes from a fresh ETA; status never regresses.

### W4 — Frontend preparing presentation
Split a preparing/loading set out of the rendering set (don't treat an `active_segment_id` with `SEGMENT_PENDING`/`LOADING_MODEL` reason as rendering); add a `preparing` span tier; thread `reason_code` (incl. `ChapterHeader` passing it into the bar contract); relabel the window "Preparing… / Loading voice model…" and drop the synthetic 120 s lane.
- Files: `useStudioChapter.ts`, `ScriptView.tsx`, `store/live-jobs.ts`, `ChapterHeader.tsx`, `predictiveProgressBarHelpers.ts`, optionally `StatusOrb.tsx`.
- Done when: the segment bar reads **Preparing** during load and **Working/rendering** only after confirmation; `QueueItem` inherits the same.
- Tests (R3): frames built via `liveEvents.ts` types through `publishStudioSocketMessage`; assert preparing vs rendering classification and label.

### W5 — Mixed resource claim *(owner-gated; see 00-overview Scope)*
Give the mixed task the union of its child groups' engine resource needs (or a per-group lease) so other GPU jobs aren't admitted during its load/synthesis.
- Files: `app/orchestration/tasks/synthesis.py`, `app/orchestration/scheduler/resources.py`.
- Decision required before starting.

### W6 — Spec reconciliation (joint authority; folds into W1–W4)
Update `design-docs/specs/live-events.md` (preparing window / ETA suspension), `progress-presentation.md` (segment preparing tier, no synthetic lane), `queue-jobs.md` (per-group phase vs monotonic status); bump versions + changelog rows in the same change that alters the behavior.

## Sequencing notes
- **W1 first** — without it the load window is invisible to a mixed job and W2/W3 cannot act on it.
- W2 and W3 can proceed in parallel after W1.
- W4 needs W3's emitted signals.
- W5 is independent and only proceeds on owner approval.
- This proposal stops at the roadmap deliberately (owner asked for a proposal, not a fix). Per-task files are written after approval, following the `task-plan-architect` task template, each linked back to `01-map.md`.
