# 011 — Specs + ADR + plan reconciliation

- **Status:** done (live-events.md 1.5.2, progress-presentation.md 1.4.2, ADR-0012, 5 plans superseded, wiki entry)
- **Workload:** WL-D docs
- **Severity / type:** major · documentation (binding per CLAUDE.md)
- **Effort:** M
- **Blocked by:** 005
- **Blocks:** nothing

## Goal
Record the design as actually built: amend `live-events.md` to retire the dual-path allowance and name the
**event-builder layer** as the single contract authority; confirm `progress-presentation.md` §4A wiring and
the **client-vs-server monotonic-floor reconciliation** (D5); add an ADR for "enrich kernel at the
event-builder layer, one RLocked `ProgressService`"; and fold/retire the scattered progress plans per
`../02-plan-reconciliation.md`.

## Why this matters
CLAUDE.md is binding: behavior changes MUST update the matching spec (bump `spec_version`, add a changelog
row) in the same line of work, and structural reversals get an ADR. This plan changed the contract topology
(single-source at the builders, one RLocked singleton, deleted echo, snapshot enrichment) — the specs and an
ADR must reflect it or the docs drift. This is the last task so it documents reality, not intent.

## Context an executor needs
- `docs/specs/README.md` (router index — read first), `docs/specs/live-events.md` (currently **allows dual
  paths** orchestrated + handler-direct — that allowance is now wrong), `docs/specs/progress-presentation.md`
  §4A (the contract; confirm §4A.2/§4A.3/§4A.4/§4A.5/§4A.8 wiring matches the shipped `enrich`).
- **D5 monotonic-floor reconciliation** (`../00-architecture-map.md` D5): §4A/§3 put the *display* floor
  **client-side** (`progressMemory` by `persistenceKey`). The server `enrich` provides monotonic-clamped
  values but the **client floor remains the display authority** — the spec must state this explicitly so the
  two floors aren't read as contradictory. (If 009/anyone wants server-authoritative, that's a separate
  spec change.)
- `docs/decisions/` (ADR home; existing `ADR-0005-websocket-live-events.md` stays — add a new ADR, don't
  rewrite it). New behavior-state from 009 (indeterminate `preparing`/`LOADING_MODEL`) also needs a spec
  paragraph — fold in the spec text 009 prepared.
- `../02-plan-reconciliation.md` — the disposition table for the scattered plans
  (`plans/final_release/15_progress_confidence_model.md`, `plans/v2_progress_tracking.md`,
  `plans/implementation/progress_service_impl.md`, `plans/implementation/live_event_stream_contract.md`,
  `plans/phases/phase_4_progress_and_reconciliation.md`). This task **actually reads each in full**, folds
  the still-valid intent, retires the rest, leaves a changelog.
- `wiki/Changelog.md` — add a dated entry (CLAUDE.md notes section).

## Target shape / contract
- `live-events.md`: dual-path allowance retired; the **event builders** in `app/api/contracts/events.py` are
  named the single contract authority (both producers enrich then build); `spec_version` bumped + changelog
  row. Document that snapshot/hydration also routes through `enrich` (PI6).
- `progress-presentation.md`: confirm/repair §4A wiring to match `enrich` (numeric confidence §4A.2,
  composition §4A.3, ceiling §4A.4, convergence-trust §4A.5, crossfade §4A.8); add the D5 client-floor
  reconciliation paragraph; add the 009 indeterminate-`preparing` state; bump `spec_version` + changelog.
- New ADR in `docs/decisions/` (next number): "enrich kernel at the event-builder layer; one RLocked
  ProgressService singleton; `compute_progress_confidence` echo deleted." Record the corrected convergence
  point (builders, not `broadcast_job_updated`) and the rejected alternative (chokfrom v1).
- `../02-plan-reconciliation.md` dispositions executed; each folded/retired plan gets a changelog note.

## Steps
1. Read `docs/specs/README.md`, `live-events.md`, `progress-presentation.md` §4A in full; diff against the
   shipped `enrich`/builders/snapshot.
2. Amend the two specs (single authority + D5 floor + 009 state), bump `spec_version`, add changelog rows.
3. Write the new ADR.
4. Read each plan in `../02-plan-reconciliation.md` in full; fold valid intent, retire the rest, leave notes.
5. Add a dated `wiki/Changelog.md` entry.
6. Sanity: `grep` the specs for any remaining "dual path" / "handler-direct may emit raw" language and the
   repo for `compute_progress_confidence` (should be gone after 005).

## Acceptance criteria
- [ ] `live-events.md` retires the dual-path allowance and names the builder layer as single authority;
      `spec_version` bumped + changelog row.
- [ ] `progress-presentation.md` §4A confirmed against `enrich`; D5 client-floor reconciliation + 009 state
      documented; `spec_version` bumped + changelog row.
- [ ] A new ADR records "enrich at the builder layer, one RLocked ProgressService, echo deleted" with the
      corrected convergence point and the rejected v1 chokepoint.
- [ ] Every plan in `02-plan-reconciliation.md` is folded/retired with a changelog note; no competing
      progress-routing plan remains.
- [ ] Dated `wiki/Changelog.md` entry added.

## Out of scope
- Any code/behavior change (docs only; behavior already shipped in 001–010).
