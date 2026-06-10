# Progress Presentation Contract

```
spec_version: 1.0.0
status: active
sources:
  - frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx
  - frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers.ts
  - frontend/src/components/progress/PredictiveProgressBar/useEtaConfidence.ts
  - frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarDebug.ts
  - app/orchestration/progress/service.py
  - app/orchestration/progress/eta.py
  - docs/specs/live-events.md
  - docs/specs/queue-jobs.md
```

> **TL;DR:** `PredictiveProgressBar` renders server-authoritative progress augmented by a client-side ETA confidence model; every prop that gates backward motion or floors the bar MUST be passed explicitly by callers.

## Changelog

| Version | Date       | Change                  |
|---------|------------|-------------------------|
| 1.0.0   | 2026-06-10 | Initial canonical spec  |

---

## 1. Purpose

This spec defines:

- How server-side progress values are produced, rounded, and throttled before broadcast.
- The `PredictiveProgressBar` component API: required props, defaults that MUST NOT be relied upon, and lane lifecycle.
- The `useEtaConfidence` hook model: adaptive trust weight, EMA velocity, coefficient of variation, and reset triggers.
- The `done` transition and terminal eviction behavior.
- Conformance invariants that callers and the bar implementation must satisfy.

This spec is the binding reference; code that disagrees with it is a bug in one or the other. Progress broadcast rules are cross-referenced to `docs/specs/live-events.md` rather than duplicated here.

---

## 2. Server-Side Progress Rules

### 2.1 Rounding

Progress values are rounded to **2 decimal places** (`round(v, 2)`) by the backend (`app/orchestration/progress/service.py`) before being stored or broadcast. The frontend MUST NOT re-round values it receives.

### 2.2 Broadcast throttle

A progress broadcast fires **only when progress advances by ≥ 1%** relative to the last broadcast value. Regressive or identical values are dropped silently on the server. This is a server-side guarantee; the frontend MUST NOT assume it will never receive equal consecutive values (network re-delivery, reconnect replays).

### 2.3 Segment vs. chapter progress

**MUST NOT** use a value from `segments.progress` as chapter-level progress. These are different scopes:

| Scope           | Source field        | Used for                           |
|-----------------|---------------------|------------------------------------|
| Segment         | `segments.progress` | Per-chunk synthesis progress only  |
| Chapter / job   | `job.progress`      | Bar displayed in queue UI          |

Callers that render a chapter-level bar MUST source progress from `job.progress` or the equivalent job-level event field.

---

## 3. `PredictiveProgressBar` Component

### 3.1 Lane concept

Progress is displayed on a **lane** — a logical unit of work (one rendered segment, one chapter batch). A lane has:

- A `persistenceKey` — unique key; when it changes the bar treats this as a new lane and resets ETA state.
- A `startedAt` timestamp — used as an anchor for velocity computation.
- An `authoritativeFloor` — the minimum progress the bar will ever display for this lane.

### 3.2 Required props (MUST be passed explicitly)

| Prop                    | Type      | Description                                                           |
|-------------------------|-----------|-----------------------------------------------------------------------|
| `allowBackwardProgress` | `boolean` | Whether the bar may animate backward. MUST NOT be left to default.    |
| `authoritativeFloor`    | `number`  | Minimum displayable progress (0–100). MUST NOT be left to default.    |

**MUST** pass `allowBackwardProgress` and `authoritativeFloor` on every `PredictiveProgressBar` usage.
**MUST NOT** rely on the component's internal defaults for either prop; they exist for runtime safety only.

### 3.3 Velocity-continuous lane construction

When a new lane begins (new `persistenceKey` or new `startedAt`), the bar initializes its velocity estimate from the **final velocity of the previous lane** rather than from zero. This prevents a jarring ETA jump at lane boundaries.

### 3.4 Terminal lane and `done` transition

When a lane reaches a terminal status (`completed`, `failed`, `cancelled`):

1. `doneTransitionPendingRef` is set to `true`.
2. The bar holds at its current (high) progress value and plays a brief completion animation.
3. After the animation completes, the lane is dismissed from the DOM.

**MUST NOT** abruptly remove the bar on terminal status; the done transition MUST play first.

### 3.5 `authoritativeFloor` semantics

The bar will never display a value below `authoritativeFloor`. This prevents visible regression when:
- A server broadcast is delayed.
- A reconnect replay delivers an older progress value.
- The predictive model overshoots and then corrects.

**MUST** pass `authoritativeFloor` equal to the highest confirmed progress value seen for the lane, not a static constant.

---

## 4. `useEtaConfidence` Hook

The hook maintains an adaptive model that gates whether an ETA label is shown and how quickly the displayed ETA changes.

### 4.1 Trust weight `w`

`w` is a scalar in `[INITIAL_TRUST, MAX_TRUST]` that expresses how much the model trusts its velocity estimate.

- Starts at `ETA_CONFIDENCE.INITIAL_TRUST` at lane start.
- Ramps upward as more progress events arrive (evidence accumulates).
- Transition is governed by `smoothstepRamp(evidenceCount)` — smooth cubic interpolation between bounds.
- ETA is shown only when `w` exceeds an internal display threshold; below threshold the ETA label is hidden.

### 4.2 EMA velocity smoothing

Velocity (progress units per second) is smoothed with an exponential moving average:

```
velocity_ema = EMA_ALPHA * current_velocity + (1 - EMA_ALPHA) * velocity_ema
```

`EMA_ALPHA` is defined in `ETA_CONFIDENCE` constants. A smaller alpha smooths more aggressively; a larger alpha responds faster to changes.

### 4.3 Coefficient of variation (`cv`)

`cv = std_dev(velocity_samples) / mean(velocity_samples)`

High `cv` (unstable velocity) reduces the effective trust weight, suppressing ETA display when synthesis speed is erratic.

**MUST NOT** show ETA when `cv` exceeds `CV_THRESHOLD`.

### 4.4 `clampSlope`

`clampSlope` prevents the displayed ETA from changing too rapidly between renders. It caps the rate of ETA change to a maximum slope, preventing jitter from sudden velocity spikes.

### 4.5 Stall detection

If no progress events arrive for a lane, the velocity EMA **decays toward 0** over time. This causes the displayed ETA to extend toward infinity (or be hidden), signaling a potential stall to the user without requiring an explicit stall event from the backend.

### 4.6 Reset triggers

The hook resets its full state (velocity history, trust weight, evidence count) when any of the following change:

| Trigger           | Effect                                    |
|-------------------|-------------------------------------------|
| New `persistenceKey` | Full reset; new lane                   |
| New `startedAt`      | Full reset; task restarted             |
| Terminal status      | Transition to done state; reset on next lane |

### 4.7 Constants (`ETA_CONFIDENCE`)

| Constant        | Role                                                              |
|-----------------|-------------------------------------------------------------------|
| `INITIAL_TRUST` | Starting trust weight for a new lane                              |
| `MAX_TRUST`     | Upper bound on trust weight regardless of evidence                |
| `EMA_ALPHA`     | Smoothing factor for velocity EMA                                 |
| `CV_THRESHOLD`  | Maximum coefficient of variation before ETA is suppressed         |

These constants are defined in `predictiveProgressBarHelpers.ts` and MUST NOT be duplicated elsewhere.

---

## 5. Terminal Eviction

`progressMemory` (the in-memory store of lane progress history on the frontend) is capped. Terminal jobs (status `completed`, `failed`, `cancelled`) are evicted from `progressMemory` after their done transition completes.

**MUST** evict terminal entries to prevent unbounded memory growth across long sessions.
**MUST NOT** evict a lane that has not yet completed its done transition.

---

## 6. Debug Utilities

`predictiveProgressBarDebug.ts` provides logging helpers for development. These helpers:

**MUST NOT** be invoked in production builds; they MUST be guarded by a `__DEV__` / `import.meta.env.DEV` check or equivalent.
**MUST NOT** affect the behavior of the bar (no side effects beyond console output).

---

## 7. Conformance Invariants

The following invariants are binding on all callers and on the bar implementation itself.

### Callers

- **C1** — MUST pass `allowBackwardProgress` explicitly on every render.
- **C2** — MUST pass `authoritativeFloor` explicitly on every render, set to the highest confirmed progress seen for the current lane.
- **C3** — MUST NOT feed `segments.progress` into a chapter-level `PredictiveProgressBar`.
- **C4** — MUST NOT remove `PredictiveProgressBar` from the DOM on terminal status without waiting for the done transition.

### Bar implementation

- **I1** — The displayed value MUST never fall below `authoritativeFloor`.
- **I2** — ETA MUST NOT be shown when trust weight `w` is below the display threshold.
- **I3** — ETA MUST NOT be shown when `cv` exceeds `CV_THRESHOLD`.
- **I4** — `doneTransitionPendingRef` MUST be set before the completion animation and cleared after dismissal.
- **I5** — Velocity-continuous lane construction MUST carry forward the previous lane's final EMA velocity when a new lane begins.
- **I6** — On stall (no incoming progress events), the velocity EMA MUST decay toward 0; the bar MUST NOT freeze the ETA display at a stale value indefinitely.

### Backend (cross-reference `live-events.md`)

- **B1** — Progress values broadcast to the frontend MUST be rounded to 2 decimal places.
- **B2** — A broadcast MUST fire only when progress advances ≥ 1% since the last broadcast.
- **B3** — `segments.progress` and `job.progress` are distinct fields and MUST NOT be aliased to each other.

---

## 8. Cross-References

| Topic                              | Canonical spec                        |
|------------------------------------|---------------------------------------|
| WebSocket envelope shape           | `docs/specs/live-events.md`           |
| Job status lifecycle               | `docs/specs/queue-jobs.md`            |
| Progress broadcast topic/fields    | `docs/specs/live-events.md` §progress |
| ETA field ownership in job store   | `docs/specs/queue-jobs.md` §ETA       |
