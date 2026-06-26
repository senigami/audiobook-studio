# 00 — Overview

## The task

Fix how the sequential render core **detects, attributes, and presents model-load windows**, so that a model loading mid-chapter (e.g. XTTS as the second engine in a mixed cast) is shown as an honest "preparing / loading voice model" state on the correct segment — and optionally at the chapter level — and so the load time we already record can inform the ETA.

This was triggered by the **G0 visual check failing** on 2026-06-26 during W-PAR's prerequisite gate.

## Goal (the outcome)

A mixed render is **visually honest about model loading**, regardless of engine order:
- The segment whose engine is loading shows the pulsing "Preparing… / Loading voice model…" state — whether it is the first segment or a mid-chapter one.
- Warm/already-loaded groups and cloud (Voxtral) groups never flash "preparing".
- The load window is attributed by **identity** (which segment/engine), not by "whatever segment is active right now."
- (Optional) the chapter/queue reflects the load window; (optional) the ETA accounts for expected load time from history.

## Definition of done (success criteria)

1. **The XTTS-second case is fixed:** in a Voxtral→XTTS mixed render, the XTTS segment shows the preparing pulse during its cold load (not "first letter frozen"), then animates normally. *(👁 G0 re-check.)*
2. **No regression:** XTTS-first still pulses-then-animates; a Voxtral-only render shows "Working…" immediately with no preparing flash; a warm XTTS group (already loaded) does not flash preparing. *(👁 G0 re-check + tests.)*
3. **Load attribution is identity-based:** the load window is associated with a specific segment id carried on the marker, not inferred from ambient `active_seg_id`. The log contract carries segment identity on the load marker. This is verifiable from the event stream/logs and unblocks W-PAR 006.
4. **(Optional, ML-3)** chapter/queue-level preparing presentation is correct; the ETA folds in expected load time from `model_load_seconds` history.
5. **Specs reconciled:** every behavior change bumps the matching spec (live-events / progress-presentation / queue-jobs / data-model / system-architecture) with a changelog row, in the same change.
6. **Quality gate:** new behavior is TDD'd (R1 revert-check on each bug-fix test), mock-boundaries-only (R2), contract-shaped frontend frames via `publishStudioSocketMessage` (R3), no sleep-based timing (R4); `ruff` + `eslint` clean; full suite green.

## Scope / boundary

**In scope:** the load-detection + attribution pipeline (engine load-emit → watchdog extraction → orchestrator attribution → publish frame → frontend store → segment render), the frontend scope-gate, the (optional) chapter-level preparing presentation, the (optional) load-aware ETA, and the matching specs.

**Out of scope:**
- Parallel/concurrent segment rendering — that's **W-PAR** (this workstream is its prerequisite, not part of it).
- Multi-segment simultaneous display — **W-PAR 006** (this lands the log contract it needs, but not the display).
- Reworking the warm-worker pool, semaphores, or any W-PAR 001/004 code.
- New engines or engine-routing changes.
- Voice taxonomy, audio player, or any unrelated backlog.

## Constraints

- **INV-3 / modular_architecture INV-5:** no engine-id branching in core; load markers are manifest-declared and engine-emitted.
- **Joint spec authority:** behavior and spec change together.
- **TDD + testing-standards R1–R4.**
- **No regression to W-MIX W1–W4** (see success criterion 2).
