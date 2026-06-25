# Task 005 — Spec reconciliation

**Workstream:** W6  ·  **Depends on:** 001, 002, 003, 004 (lands alongside them)  ·  **Blocks:** none  ·  **Status:** Not started

## Goal
Reconcile the canonical specs in `design-docs/specs/` with the behavior changes shipped by tasks 001–004 of the mixed-engine model-load fix, in the **same change** that ships each behavior. Specs and code are jointly authoritative (`design-docs/specs/README.md`): when a behavior change lands, the matching spec is updated, its `spec_version` is bumped, and a changelog row is added — never silently, never deferred. This task identifies exactly which specs and sections change, the new contract text, and the precise version bump + changelog row for each.

## Why it matters
Tasks 001–004 alter documented contracts that a conformance checker (and the next agent) reads as truth:

- **001/002 (W1/W2)** change how `model_load_seconds` is captured for mixed renders and make the orchestrator the sole synthesis-only render-sample writer — the per-segment ETA-clock semantics in `live-events.md` and the render-sample shape in `data-model.md` describe this contract.
- **003 (W3)** changes the load-window frame: a null `eta_seconds` now **clears** the persisted ETA, the window carries `indeterminate=true` / `reason_code`, and durable job `status` stays monotonic (a per-group **phase**, not a status regression) — this touches `live-events.md` §2.6-equivalent window rules and the `queue-jobs.md` status lifecycle.
- **004 (W4)** adds a segment-granularity **preparing tier** and removes the synthetic 120 s "Working…" lane — `progress-presentation.md` documents the presentation contract these consume.

If the specs are not updated alongside the code, the next reader trusts a stale contract: e.g. `live-events.md` still says `SEGMENT_PENDING` is announcement-only and silent about mixed marker resolution; `progress-presentation.md` §2.6 still describes only a chapter/job-level `LOADING_MODEL` window with a generic "Working…" label; `queue-jobs.md` does not distinguish a per-group phase from the monotonic durable status. That drift is exactly what the modular-architecture and joint-authority rules forbid.

## Specs to update

| Spec | Current version | Section(s) (file:line) | Change | New version |
|---|---|---|---|---|
| `design-docs/specs/live-events.md` | `1.6.0` | `## Per-segment ETA clock semantics` + the `SEGMENT_PENDING` announce/confirmation rule at [live-events.md:343](../../../specs/live-events.md) (and the mixed note at :351, :362–369) | (a) State that for **mixed** renders the load window is detected by resolving timing markers per the **active render-group's declared engine** (`group["engine"]` → that engine's manifest markers), not the static `engine_id="mixed"`; the prior contract silently failed to recognize the load line. (b) Document the load-window frame: `reason_code` ∈ {`SEGMENT_PENDING`, `LOADING_MODEL`}, `indeterminate: true`, and `eta_seconds: null` **clears** the persisted ETA (previously a null ETA was not persisted, so the stale positive ETA stuck through the window). (c) Affirm INV-1: durable job `status` stays monotonic — the preparing state is a per-group phase / `reason_code`, never a `running → preparing` regression. | `1.7.0` |
| `design-docs/specs/progress-presentation.md` | `1.5.0` | §2.6 LOADING_MODEL indeterminate state [progress-presentation.md:99–122](../../../specs/progress-presentation.md); the "Working…"/synthetic-lane label note referenced at `predictiveProgressBarHelpers.ts:214` | (a) Add a **segment-granularity preparing tier** distinct from rendering: an `active_segment_id` whose `reason_code` is `SEGMENT_PENDING`/`LOADING_MODEL` is **preparing**, not rendering. (b) Remove the synthetic 120 s "Working…" lane for the preparing/indeterminate window; relabel it "Preparing… / Loading voice model…". (c) State ETA is **suspended** during preparation (null/cleared, no animating countdown) then **resumes from a fresh value** at engine confirmation (re-anchors from 0, not a stale snap) — consistent with §2.6 / I10 (determinate ETA only at `running`). | `1.6.0` |
| `design-docs/specs/queue-jobs.md` | `1.4.0` | §3.1 Defined statuses [queue-jobs.md:153](../../../specs/queue-jobs.md), §3.3 Normal forward path [:177], §3.4 Transition enforcement [:190] | Add a clarifying subsection distinguishing the **per-group phase** (`preparing` / `synthesizing`, a render-group-scoped UI/progress concept carried by `reason_code` on live frames) from the **durable job-status lifecycle** (`queued → preparing → running → done`, monotonic, priority-ordered, regression-guarded in `state_jobs`). The per-group phase MUST NOT drive a durable `running → preparing` status regression; within a `running` job, individual groups may be in a preparing phase. This codifies INV-1 at the lifecycle spec. | `1.5.0` |
| `design-docs/specs/data-model.md` | `1.4.0` | `### render_performance_samples` [data-model.md:249–278](../../../specs/data-model.md), specifically `synthesis_duration_seconds` / `model_load_seconds` / `inter_group_overhead_seconds` (:269–271) | **Clarifying note only** (the columns already exist): add a note that `synthesis_duration_seconds` is the **synthesis-only** clock (engine-confirmation → `SEGMENT_SAVED`) and **excludes** `model_load_seconds`; `model_load_seconds` + `inter_group_overhead_seconds` capture the between-time; `cps` is derived from synthesis-only time. State the orchestrator is the **sole** writer (one sample per group). This is the contract 001/002 make true for mixed; the note removes ambiguity that previously let a load-inclusive wall-time value be recorded. | `1.5.0` |
| `design-docs/specs/system-architecture.md` | `1.2.0` | Ownership-split TL;DR / orchestrator-vs-VoiceBridge boundary ([system-architecture.md:14](../../../specs/system-architecture.md), :222, I2 :254) | **No change needed** unless task 001 adds an explicit handler-emitted per-group marker. The fix resolves markers in the orchestrator from the active group's manifest (no new architectural boundary; watchdog and VoiceBridge stay ignorant of model-load semantics, preserving INV-4). If 001 lands the explicit bracketed `[ENGINE_ACTIVITY_STARTED]`-per-group marker, add a one-line note under the ownership split that the orchestrator resolves load/progress markers per **active render-group engine** (still no engine-ID branching). Decide at implementation time; default is no change. | `1.3.0` *(only if the marker note is added; otherwise unchanged)* |

## Target shape / contract
The end state after 001–004 + this task:

- **`live-events.md` 1.7.0** — the per-segment ETA clock section explicitly covers mixed marker resolution (per active-group engine) and the load-window frame contract (`reason_code`, `indeterminate: true`, null `eta_seconds` clears); durable status documented as monotonic with preparing carried as a per-group phase/`reason_code`.
- **`progress-presentation.md` 1.6.0** — §2.6 (or a new sibling subsection) documents the **segment-granularity preparing tier**, the removal of the synthetic 120 s "Working…" lane in favor of "Preparing… / Loading voice model…", and ETA suspend-then-resume-fresh.
- **`queue-jobs.md` 1.5.0** — a subsection cleanly separates per-group **phase** from the durable monotonic **status** lifecycle.
- **`data-model.md` 1.5.0** — render-sample note: `synthesis_duration_seconds` excludes `model_load_seconds`; orchestrator is sole writer, one sample per group.
- **`system-architecture.md`** — unchanged by default; 1.3.0 only if 001 adds the explicit per-group marker (then a one-line per-active-engine-resolution note).

Every changed spec gets a changelog row dated to the landing day, referencing the originating task (001–004) and this proposal.

## Steps (ordered)
1. **Confirm the as-built behavior** from the merged 001–004 diffs (do not write the spec from this plan alone — write it from what shipped). For each spec below, re-read the current section cited in the table to capture exact existing wording before editing.
2. **`live-events.md` → 1.7.0** (lands with 001 + 003): edit the `## Per-segment ETA clock semantics` section and the `SEGMENT_PENDING` rule (~:343) per the table; add the changelog row at the top of `## Changelog`.
3. **`data-model.md` → 1.5.0** (lands with 002): add the clarifying note to `### render_performance_samples`; add the changelog row.
4. **`queue-jobs.md` → 1.5.0** (lands with 003): add the per-group-phase-vs-durable-status subsection near §3.1/§3.3; add the changelog row.
5. **`progress-presentation.md` → 1.6.0** (lands with 004): update §2.6 / add the preparing-tier + label + ETA-suspend-resume rules; add the changelog row.
6. **`system-architecture.md`** — only if 001 added the explicit handler marker: bump to 1.3.0 with the per-active-engine marker-resolution note. Otherwise leave untouched and record "no change needed" in the 005 PR description.
7. **Verify each bumped `spec_version` matches its new changelog row** and that cross-references between specs (e.g. `live-events.md` ↔ `progress-presentation.md` §2.6, `queue-jobs.md` lifecycle) remain consistent.
8. **Grep for stale claims** the fix invalidates — e.g. any spec text asserting "the mixed handler writes `synthesis_duration_seconds`" (contradicted by 002's sole-writer rule, see `01-map.md` surface B / INV-6) or "`SEGMENT_PENDING` cannot affect progress presentation" — and fix or remove them in the same edits.

## Acceptance criteria
- Each of `live-events.md`, `progress-presentation.md`, `queue-jobs.md`, `data-model.md` has its `spec_version` bumped exactly as in the table, with a matching dated changelog row referencing the originating task and this proposal.
- `system-architecture.md` is either left at `1.2.0` (with a recorded "no change needed and why") or bumped to `1.3.0` with the per-active-engine marker note — matching whatever 001 actually shipped.
- No spec retains a claim contradicted by the shipped behavior (sole-writer metrics, synthesis-only duration, mixed marker resolution, ETA clearing, per-group phase, no synthetic 120 s lane).
- INV-1 (monotonic durable status) and INV-3 (`model_load_seconds` excluded from `synthesis_duration_seconds`/CPS) are explicitly stated in the relevant specs.
- Spec edits land **in the same commit/PR** as the behavior change they document (joint authority); this task does not ship as a standalone "docs cleanup" after the fact.
- `design-docs/specs/README.md` conventions (version bump + changelog row per behavior change) are satisfied for every touched spec.

## Map links
- Implementation map: [01-map.md](../01-map.md) — see "Connections / contracts touched" (specs listed for joint-authority update) and invariants INV-1, INV-3, INV-4, INV-5, INV-6.
- Roadmap: [02-roadmap.md](../02-roadmap.md) — W6.
- Overview / root cause: [00-overview.md](../00-overview.md) — Decisions 1, 4, 5, 6 and Success criteria 3, 5.

## Out of scope
- Any **behavior/code** change — this task authors spec text only; the behavior is delivered by tasks 001–004. (If a spec edit reveals a behavior gap, that is a defect in the matching task, fixed there, not patched in docs.)
- W5 (mixed `ResourceClaim`) and any spec text about cross-job GPU contention — deferred per `00-overview.md` Scope; do not document a resource-claim contract here.
- ADRs (`design-docs/decisions/`) — this task updates `design-docs/specs/`. If reversing a structural decision were involved it would need an ADR, but threading existing signals through (INV-5) reverses nothing, so no ADR is authored here.
- The `expected_model_load_seconds` determinate-countdown field — explicitly DEFERRED in `progress-presentation.md` §2.6; do not document it as available.
