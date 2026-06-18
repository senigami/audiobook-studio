# Plan Reconciliation — progress / ETA / confidence

The codebase carries several overlapping progress-related plans/specs. This unified plan is the **single
source of truth for progress ROUTING**; the others are dispositioned below. (Disposition is intent;
**Task 011 includes actually reading each in full, then folding/retiring it and leaving a changelog** —
they were inventoried, not deep-read, during the topology audit.)

> Task numbers below reflect the corrected v2 task set (see `01-roadmap.md`): the spec/ADR/plan
> reconciliation is now **Task 011** (was 008); the `enrich` kernel + ETA math is **001 / 003a / 003b**
> (was 001 / 003).

| Doc | Apparent scope | Disposition |
|---|---|---|
| `docs/specs/progress-presentation.md` §4A | **The contract** (numeric confidence §4A.2, char-weighting B9, calculated→observed ETA B10, grouped→1.0, monotonic, terminal latch) | **KEEP — authoritative contract.** This routing plan is the *implementation* that enforces it everywhere. |
| `docs/specs/live-events.md` | WS envelope + producer obligation; currently **allows dual paths** (orchestrated + handler-direct) | **AMEND (T011):** retire the dual-path allowance — both producers enrich then build, so the **event-builder layer** is the single contract authority (NOT `broadcast_job_updated` — that chokepoint was the v1 error). |
| `docs/decisions/ADR-0005-websocket-live-events.md` | one WS connection per client | **KEEP;** add a NEW ADR for "enrich kernel at the event-builder layer, one RLocked ProgressService." |
| `plans/final_release/15_progress_confidence_model.md` | the ETA-confidence math (the model behind §4A.2) | **FOLD into the `enrich` kernel** (T001 / T003a / T003b). The model becomes code in one place; this doc becomes the math reference. |
| `plans/v2_progress_tracking.md` | v2 progress/ETA redesign (historical) | **SUPERSEDE (routing parts)** by this plan; harvest any still-valid intent in T011, then retire. |
| `plans/implementation/progress_service_impl.md` | ProgressService implementation detail | **MERGE** into this plan's tasks (it predates the dual-path discovery); retire after. |
| `plans/implementation/live_event_stream_contract.md` | event-stream contract | **RECONCILE** against `live-events.md` (T011); keep one. |
| `plans/phases/phase_4_progress_and_reconciliation.md` | phase-4 scope (progress + reconciliation) | **CHECK done-ness** in T011; carry forward only open items. |

## Why one routing plan
Each of the above touched progress from a different angle and none owned the *routing* question — which is
exactly how two emit paths (orchestrated vs handler-direct) drifted apart and the contract stopped being
single-source. This folder is the routing owner; the contract spec (§4A) is the behavior owner. After
Task 011, there should be exactly: **one contract spec (§4A), one routing plan (this), one confidence
model reference (doc 15, folded), and a fresh ADR** — no competing progress plans.
