# Task 003 — Orchestrator identity-based attribution (keystone)

**Workstream:** W-MIX-LA · **Depends on:** 002 · **Blocks:** 004, 005, 006 · **Status:** Not started

> Read [`../01-map.md`](../01-map.md) part **P-C**, connections **C1/C3/C4**, invariants **INV-1/INV-2/INV-3/INV-5/INV-6**, risks **R-D**. This is the keystone — it turns the now-delivered load marker from 002 into a correctly-attributed preparing frame.

> **⚠ LOCKED by [001-findings.md](001-findings.md) (runtime-confirmed) — read it first.** "Bug 2" is resolved/moot: the live trace showed the orchestrator goes **silent for the whole 20s load** because the specific trigger never arrives — it's a *delivery* problem (002), not an active-engine-resolution problem. Final scope for 003:
> - Handle the dedicated **`matched_marker == "MODEL_LOAD_STARTED"`** (delivered by 002) → emit the `LOADING_MODEL`/`indeterminate` preparing frame (`clear_eta=True`, `eta_seconds=None`, `active_segment_id` = marker `sid` or current `active_seg_id`, `loading_elapsed_seconds`), reusing the existing publish shape at `:715-756`.
> - **No `_active_engine_has_specific_activity_marker` gate** for this path — the dedicated marker *is* the real-load signal, so warm XTTS / Voxtral stay silent automatically (they never emit it). Do NOT fire preparing on the generic `[ENGINE_ACTIVITY_STARTED]` (keep its current timing-only role to avoid warm-group flashes — INV-2).
> - Keep the existing generic-marker `model_load_seconds` capture (`_close_pending_engine_activity_interval`); ensure no double-count with the new marker. Do not retire the ambient heuristic wholesale.

## Goal

When a real-load marker arrives (002), attribute the load window to **its marker-borne `segment_id`** and publish the `LOADING_MODEL` / indeterminate frame for that segment — including **mid-chapter** loads — while keeping warm and cloud groups silent (INV-2). Retire the ambient-guess path (`_active_engine_has_specific_activity_marker` + `active_seg_id[0]`) as the load attributor.

## Why it matters

This fixes gap (A) end-to-end on the backend: the "first letter frozen" symptom is the orchestrator failing to emit a preparing frame for the second segment because it guessed the wrong active segment. With identity from 002, it can fire the frame for exactly the right segment.

## Files to touch

| File | Anchor | Change |
|------|--------|--------|
| `app/orchestration/scheduler/orchestrator_helpers.py` | `log_listener` `:666-712` | Receive the `segment_id` now threaded from the watchdog (002); make it available to the marker-handling branch. |
| `app/orchestration/scheduler/orchestrator_helpers.py` | `ENGINE_ACTIVITY_STARTED` branch `:715-756` | Attribute the load window to the **marker's `segment_id`** (not `active_seg_id[0]`). Publish the existing `_publish(... status, progress=_get_grouped_progress(), eta_seconds=None, clear_eta=True, indeterminate=True, reason_code="LOADING_MODEL", message="Loading voice model…", active_segment_id=<marker sid>, loading_elapsed_seconds=…)` frame for that segment. Add `segment_load_observed.add(<marker sid>)`. |
| `app/orchestration/scheduler/orchestrator_helpers.py` | `_active_engine_has_specific_activity_marker` `:605-622` | Retire or repurpose: with a real-load marker (002) the cold-vs-warm distinction now comes from *whether the marker fired*, not from marker text. Remove the text heuristic as the load gate (R-D) — but keep whatever synthesis-timing fallback (`_close_pending_engine_activity_interval`) still needs, without double-counting. Do not leave both mechanisms half-wired. |
| `app/orchestration/scheduler/orchestrator_helpers.py` | mechanism A `:426-445` | Verify the **initial** XTTS-first cold-load frame still fires (INV-1). If 002's marker now also covers the first load, ensure no double frame / no regression. |

## Target shape / contract (C3, governed by `live-events.md`)

- A real load for segment *S* ⇒ exactly one transition into the indeterminate `LOADING_MODEL` frame **for `active_segment_id = S`**, then a transition out (fresh ETA from zero) when synthesis confirms — for any position in the chapter, first or mid.
- Warm XTTS group / Voxtral group ⇒ **no** `LOADING_MODEL` frame (INV-2).
- `model_load_seconds` capture (`_close_pending_engine_activity_interval`, `:624-658`) continues to record the dominant load window correctly (no regression to W2).

## Tests (TDD — write first)

- **Mid-chapter attribution (R1 revert-check, the core fix):** simulate the marker sequence for a Voxtral(seg-1)→XTTS(seg-2) chapter feeding `log_listener` the 002-tagged load marker for seg-2. Assert a `LOADING_MODEL` frame publishes with `active_segment_id == seg-2` and `indeterminate=True`. Revert-check: on pre-003 code (ambient attribution) the frame is missing or carries seg-1. Mock boundary (R2): capture published frames at the broadcast boundary; drive `log_listener` directly with crafted lines (do not mock the orchestrator's attribution logic — it's the unit under test). No sleeps (R4).
- **Warm group stays silent (INV-2):** feed a warm XTTS group (no real-load marker per 002) → assert **no** `LOADING_MODEL` frame. Feed a Voxtral group → same.
- **XTTS-first unregressed (INV-1):** initial cold load still produces the preparing frame for seg-1.
- **`model_load_seconds` still captured:** assert the timing/DB capture path records the window (no W2 regression).

## Acceptance criteria

- [ ] Mid-chapter real load publishes a `LOADING_MODEL`/indeterminate frame with the **correct** `active_segment_id` (the marker's segment).
- [ ] Warm XTTS and Voxtral groups publish **no** preparing frame (INV-2).
- [ ] XTTS-first preparing path unregressed (INV-1); Voxtral-only unregressed.
- [ ] The ambient `_active_engine_has_specific_activity_marker` load-gate is retired or cleanly repurposed — no half-wired dual mechanism (R-D).
- [ ] `model_load_seconds` capture unbroken (no W2 regression).
- [ ] R1 revert-check observed; `ruff` + orchestration tests green; spec note staged for task 007.

## Map links

- Part **P-C**; connections **C1** (pipeline), **C3** (publish-frame contract), **C4** (real-load gating); invariants **INV-1/2/3/5/6**; risk **R-D**.

## Out of scope

- Frontend rendering of the frame → **task 004**.
- Chapter-level presentation → **task 005**. Load-aware ETA → **task 006**.
- Final spec bumps → **task 007** (stage the live-events/queue-jobs notes here, land them in 007).
