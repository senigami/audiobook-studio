# Proposal: Progress, Reconciliation, And ETA Tracking (Studio 2.0)

Progress is a product surface, not just telemetry. The goal is to make status believable, stable, and useful to users.

## 1. Objectives

- Provide one progress model for headers, queue items, block cards, and exports.
- Eliminate false completion caused by stale files or drifted state.
- Make ETA useful without pretending to know more than we know.
- Support reload and restart without the UI snapping to nonsense.
- Make websocket events the primary transport for live progress, with REST reserved for hydration and recovery.

## 2. What I Want To Create

### 2.1 Reconciliation Service

- Validates which work is already satisfied by revision-safe artifacts
- Produces initial job progress before execution starts
- Distinguishes `valid`, `stale`, `missing`, and `unknown` artifact states

### 2.2 Progress Service

- Tracks weighted work completion at block, chapter, and book levels
- Aggregates child task updates into parent progress
- Emits normalized progress events with throttling

### 2.3 ETA Service

- Uses historical per-engine baselines plus current live throughput
- Marks ETA confidence as `estimating`, `stable`, or `recomputing`
- Adapts when resource contention or engine behavior changes

## 3. Progress Rules

- Progress is based on estimated work cost, not raw item count.
- Visible progress must not move backward unless the requested revision changed.
- If progress must regress because the revision changed, the UI must explain why.
- A job is not complete because a file exists; it is complete because a valid artifact satisfies the requested revision.

## 3.1 Live Progress UX Contract

Studio 2.0 should intentionally preserve the strongest parts of the current UI behavior:

- Backend progress is the authoritative floor for active work.
- The frontend may interpolate smoothly between updates for a more stable feel.
- Interpolation must never visually outrun clear system state changes such as failure or cancelation.
- `preparing` and `finalizing` are meaningful phases, not just temporary labels.
- Sparse WebSocket updates should not create a jumpy experience if the job is still healthy.

This is not decorative polish. It is part of user trust.

## 4. What Counts As Work

- Chapter synthesis: weighted primarily by normalized text size with room for engine-specific cost modifiers
- Assembly: weighted by input duration and file count
- Export: weighted by output size and metadata work
- Voice building: weighted by preprocessing and asset-generation phases

## 5. Event Contract

Every progress event should include:

- `job_id`
- `parent_job_id`
- `scope` such as block, chapter, project, export
- `status`
- `progress`
- `eta_seconds`
- `estimated_end_at`
- `eta_basis`
- `eta_confidence`
- `message`
- `reason_code`
- `updated_at`
- `started_at`
- `active_render_batch_id`
- `active_render_batch_progress`

These events are intended to be delivered over the live websocket channel as the default runtime path. Polling should not be required for normal connected operation once the 2.0 progress path is in place.

## 5.2 ETA Contract Adjustment

The ETA contract needs to be explicit enough that the frontend is rendering a trustworthy server estimate, not reverse-engineering one.

- `started_at` is the immutable run anchor for the current execution attempt.
- `progress` is the current normalized completion ratio at `updated_at`.
- `eta_seconds` should mean the server's current remaining-seconds estimate at `updated_at`.
- `estimated_end_at` should be the server-computed absolute finish timestamp when the backend can provide it.
- `eta_basis` exists as a transition field while legacy paths are still mixed:
  - `remaining_from_update`: preferred Studio 2.0 meaning for `eta_seconds`
  - `total_from_start`: compatibility meaning for legacy producers that still send total duration from `started_at`
- `evidence_weight_fraction` should come from the update message, not the initial launch snapshot. For XTTS-style segment progress, derive it from processed segment characters divided by the maximum batch size, with a default fallback confidence around `0.8` when the producer cannot provide a better indicator.

Target state:

- all Studio 2.0 progress events should publish `eta_basis="remaining_from_update"`
- the backend should recompute ETA as live throughput changes instead of expecting the frontend to infer a new end time from stale duration math
- the frontend should prefer `estimated_end_at` when present and otherwise honor `eta_seconds` according to `eta_basis`
- the worker-side producer migration to this target shape is intentionally a later slice after the contract is in place; the contract should be stable before we ask every runtime producer to switch at once

## 5.1 Monotonic Event Handling Rules

The 2.0 frontend plan should preserve current anti-regression safeguards:

- ignore stale status regressions unless the server explicitly indicates a reset/retry transition
- ignore tiny ETA churn that only adds noise
- avoid moving visible active progress backward unless the requested revision changed or the job restarted intentionally
- keep active-start timestamps stable once a run is established unless the run itself was recreated

## 6. UX Requirements

- Show meaningful phase copy such as `Scanning existing renders`, `Rendering 12 of 46 blocks`, `Assembling chapter`, and `Writing metadata`.
- Use softer copy early, such as `About 3 to 5 min`, then tighten when live confidence improves.
- Show per-block waiting and failure reasons inline in the editor.
- Queue and header progress must derive from the same normalized events.

## 7. Risks And Planned Solutions

- **Risk: ETA becomes noisy on tiny blocks**
  Solution: smooth parent progress separately and weight by work, not item count.
- **Risk: Speed multipliers become a crutch for bad modeling**
  Solution: use them only as advanced overrides on top of historical baselines.
- **Risk: Reconciliation causes visible regressions**
  Solution: keep explicit stale-state messaging and never silently snap backwards.
- **Risk: we lose the current smooth-progress feel during cutover**
  Solution: define the live-progress UX contract and test it, instead of assuming backend correctness alone will produce good UX.

## 8. Procedures

### Before Execution

1. Reconcile requested work against valid artifacts.
2. Initialize progress using only valid matches.
3. Publish a preflight phase event if reconciliation takes meaningful time.

### During Execution

1. Accept child task updates.
2. Aggregate by weighted work model.
3. Throttle websocket broadcasts by percentage threshold, status change, and time interval.
4. Recompute ETA confidence as live throughput stabilizes.

### After Execution

1. Validate final artifacts.
2. Mark parent progress complete only after all required child work and post-processing are finished.
3. Emit a final status event with no ambiguous “almost done” state.

## 9. Implementation References

- `plans/implementation/progress_service_impl.md`
- `plans/implementation/domain_data_model.md`
- `plans/implementation/frontend_state_impl.md`
