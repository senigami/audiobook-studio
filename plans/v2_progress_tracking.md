# Proposal: Progress, Reconciliation, And ETA Tracking (Studio 2.0)

Progress is a product surface, not just telemetry. The goal is to make status believable, stable, and useful to users.

## 1. Objectives

- Provide one progress model for headers, queue items, block cards, and exports.
- Eliminate false completion caused by stale files or drifted state.
- Make ETA useful without pretending to know more than we know.
- Support reload and restart without the UI snapping to nonsense.

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
- `eta_confidence`
- `message`
- `reason_code`
- `updated_at`

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

## 8. Procedures

### Before Execution

1. Reconcile requested work against valid artifacts.
2. Initialize progress using only valid matches.
3. Publish a preflight phase event if reconciliation takes meaningful time.

### During Execution

1. Accept child task updates.
2. Aggregate by weighted work model.
3. Throttle broadcasts by percentage threshold, status change, and time interval.
4. Recompute ETA confidence as live throughput stabilizes.

### After Execution

1. Validate final artifacts.
2. Mark parent progress complete only after all required child work and post-processing are finished.
3. Emit a final status event with no ambiguous “almost done” state.

## 9. Implementation References

- `plans/implementation/progress_service_impl.md`
- `plans/implementation/domain_data_model.md`
- `plans/implementation/frontend_state_impl.md`
