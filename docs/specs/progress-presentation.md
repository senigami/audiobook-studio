# Progress Presentation Contract

```
spec_version: 1.3.1
status: active
sources:
  - frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx
  - frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers.ts
  - frontend/src/components/progress/PredictiveProgressBar/useEtaConfidence.ts
  - frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarDebug.ts
  - frontend/src/hooks/useSegmentHandoffQueue.ts
  - app/orchestration/progress/service.py
  - app/orchestration/progress/eta.py
  - docs/specs/live-events.md
  - docs/specs/queue-jobs.md
```

> **TL;DR:** `PredictiveProgressBar` renders server-authoritative progress augmented by a client-side ETA confidence model; every prop that gates backward motion or floors the bar MUST be passed explicitly by callers.

## Changelog

| Version | Date       | Change                  |
|---------|------------|-------------------------|
| 1.3.1   | 2026-06-11 | H7 strengthened: steady-state failure suppresses late segment inputs (no resurrect after reset) |
| 1.3.0   | 2026-06-11 | H7 added: terminal failure (failed/cancelled) resets handoff queue immediately — no completion animation, no hold |
| 1.2.1   | 2026-06-11 | H4 strengthened: bar mount gate is handoff-aware directly; bridge alone is insufficient |
| 1.2.0   | 2026-06-10 | Remaining-hold rule H6: swaps arriving after early visual completion serve out the rest of the 500 ms hold (§7) |
| 1.1.0   | 2026-06-10 | Segment handoff queue: COMPLETING→HOLD state machine, end-of-chapter animation, 500 ms completion hold (§7) |
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

- A `persistenceKey` — unique key; when it changes the bar treats this as a new lane and resets ETA state. The per-key highest displayed value is tracked in the module-level `progressMemory` map and acts as the lane's floor.
- A `startedAt` timestamp — used as an anchor for velocity computation.

### 3.2 Backward-motion / floor props

| Prop                    | Type      | Default                  | Description                                                                 |
|-------------------------|-----------|--------------------------|-----------------------------------------------------------------------------|
| `allowBackwardProgress` | `boolean` | `!authoritativeFloor`    | Whether the bar may animate backward.                                       |
| `authoritativeFloor`    | `boolean` | `false`                  | **Deprecated** — legacy on/off floor toggle. Prefer `allowBackwardProgress`. |

Both props are optional (`?`). `allowBackwardProgress` defaults to `!authoritativeFloor`. Note `authoritativeFloor` is a **boolean toggle**, not a numeric floor value — the actual numeric floor for a lane is the highest value recorded in `progressMemory` for its `persistenceKey`.

**SHOULD** pass `allowBackwardProgress` explicitly on every `PredictiveProgressBar` usage (all production call sites do) rather than relying on the derived default. `authoritativeFloor` is retained only for backward compatibility.

### 3.3 Lane migration (smooth boundary transition)

When the rendered lane changes, the bar runs a `LaneMigration` that interpolates the rendered `startAtMs` / `endAtMs` / `startProgress` from the previous lane to the new lane over a short duration (see `getRenderedStartAtMs` / `getRenderedEndAtMs` / `getRenderedStartProgress`). This prevents a jarring jump at lane boundaries. Note the `useEtaConfidence` hook itself **fully resets** its EMA/samples/trust on a lane change (it does not carry the previous lane's EMA forward) — continuity is achieved at the rendering layer, not in the confidence model.

### 3.4 Terminal lane and `done` transition

When a lane reaches a terminal status (`completed`, `failed`, `cancelled`):

1. `doneTransitionPendingRef` is set to `true`.
2. The bar holds at its current (high) progress value and plays a brief completion animation.
3. After the animation completes, the lane is dismissed from the DOM.

**MUST NOT** abruptly remove the bar on terminal status; the done transition MUST play first.

### 3.5 Floor semantics (`progressMemory`)

When backward motion is disallowed (`allowBackwardProgress` falsy), the bar will not display a value below the lane's floor — the highest value previously recorded for the `persistenceKey` in `progressMemory`. This prevents visible regression when:
- A server broadcast is delayed.
- A reconnect replay delivers an older progress value.
- The predictive model overshoots and then corrects.

The floor is maintained automatically per `persistenceKey`; callers do not pass a numeric floor value.

---

## 4. `useEtaConfidence` Hook

The hook maintains an adaptive model that gates whether an ETA label is shown and how quickly the displayed ETA changes.

### 4.1 Trust weight `w`

`w` is a scalar in `[0, 1]` that expresses how much the model trusts its smoothed ETA. It is **not** an evidence counter — it is computed each update as:

```
base = max(1 - K * cv, BASE_FLOOR)        // stability-derived base trust
ramp = smoothstepRamp(progress)           // progress-driven ramp (RAMP_START→RAMP_END)
w    = clamp01(base + (1 - base) * ramp)
```

- `base` starts at `ETA_CONFIDENCE.BASE_FLOOR` (the floor that keeps the backend ETA from being fully ignored).
- `ramp` is `smoothstepRamp(progress)` — a smooth cubic of the **progress value**, 0 below `RAMP_START`, 1 above `RAMP_END`. (Not a function of an evidence/event count.)
- `w` is consumed to widen the slope cap and to set the EMA alpha; there is no separate hard "display threshold" constant.

### 4.2 EMA velocity / ETA smoothing

The smoothed end-time is an exponential moving average whose alpha is derived from `w`:

```
alpha = ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * w
ema   = emaStep(ema, etaEndRaw, alpha)
```

A low `w` yields alpha near `ALPHA_MIN` (heavy smoothing); a high `w` yields alpha near `ALPHA_MAX` (near-raw tracking). There is no single fixed `EMA_ALPHA` constant.

### 4.3 Coefficient of variation (`cv`)

`cv` is computed by `computeCv(samples, nowMs)` over a ring buffer of `N` end-time samples.

High `cv` (unstable ETA) lowers `base` (`base = max(1 - K * cv, BASE_FLOOR)`), which lowers `w` and so increases smoothing. `cv` feeds a continuous scaling via `K` and `BASE_FLOOR`; there is **no** discrete `CV_THRESHOLD` that hard-hides the ETA.

### 4.4 `clampSlope`

`clampSlope` prevents the displayed ETA from changing too rapidly between renders. The slope cap is interpolated from `w`: `slopeCap = SLOPE_CAP_LOW + (SLOPE_CAP_HIGH - SLOPE_CAP_LOW) * w` — a low-trust (coasting) lane gets a tight cap, a high-trust lane is allowed looser ETA movement.

### 4.5 Stall detection

If no update arrives for longer than `STALL_MS` (10 s) while running, `getStallDecayedW()` decays the trust weight `w` toward 0 (decay factor `max(0, 1 - (stalledMs - STALL_MS) / (STALL_MS * 3))`). This suppresses confidence in the stale ETA, signaling a potential stall without requiring an explicit stall event from the backend.

### 4.6 Reset triggers

The hook resets its full state (ETA sample ring buffer, EMA, base trust, `lastUpdateMs`) when any of the following hold:

| Trigger           | Effect                                    |
|-------------------|-------------------------------------------|
| New `persistenceKey` | Full reset; new lane                   |
| New `startedAt`      | Full reset; task restarted             |
| Status is `done`, `failed`, `cancelled`, **or `queued`** | Full reset |

### 4.7 Constants (`ETA_CONFIDENCE`)

| Constant         | Value   | Role                                                          |
|------------------|---------|---------------------------------------------------------------|
| `ALPHA_MIN`      | `0.15`  | Minimum EMA alpha (heavy smoothing when trust is low)         |
| `ALPHA_MAX`      | `0.85`  | Maximum EMA alpha (near-raw tracking when trust is high)      |
| `RAMP_START`     | `0.55`  | Progress at which the progress-based trust ramp begins        |
| `RAMP_END`       | `0.90`  | Progress at which the ramp reaches 1                          |
| `K`              | `2.0`   | CV scaling factor for base trust (`1 - K*cv`)                 |
| `BASE_FLOOR`     | `0.2`   | Minimum base trust (never fully ignore the backend ETA)       |
| `N`              | `6`     | End-time samples in the CV ring buffer                        |
| `SLOPE_CAP_LOW`  | `1.5`   | Slope cap at `w=0` (coasting, tight)                          |
| `SLOPE_CAP_HIGH` | `4.0`   | Slope cap at `w=1` (trusted ETA, loose)                       |
| `STALL_MS`       | `10000` | No-update stall duration before decaying `w` toward 0         |

These constants are defined in `ETA_CONFIDENCE` in `predictiveProgressBarHelpers.ts` and MUST NOT be duplicated elsewhere.

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

## 7. Segment Handoff Queue (`useSegmentHandoffQueue`)

`frontend/src/hooks/useSegmentHandoffQueue.ts` owns the display-layer queueing between consecutive segments in the Chapter Editor. One page-level instance drives BOTH the header segment bar and the script-view text fill/highlight.

State machine:

- **IDLE** — displayed identity tracks the job's `active_segment_id` directly.
- **COMPLETING** — entered when the incoming segment identity changes while the displayed bar has not visually reached 100%. The displayed frame is immediately driven to `progress: 1.0, etaSeconds: null` so the bar/text animate forward; the incoming segment is queued as pending (latest-wins).
- **HOLD** — when the visual bar reports ≥ 0.999 (`notifyDisplayProgress`), the completed frame is held for `COMPLETION_HOLD_MS` (500 ms) so the completion visually registers, then the pending segment is flushed (mounted at 0, caught up one tick later).

Rules:

- **H1** — The end-of-chapter transition (real segment → no active segment, job terminal) MUST take the same COMPLETING→HOLD path as a mid-chapter handoff; it MUST NOT reset immediately. The pending frame is the sentinel (`'none'`), and the flush clears the display instead of mounting a next segment.
- **H2** — The 500 ms completion hold applies to every flush, mid-chapter and end-of-chapter.
- **H3** — A 3 s safety timer force-flushes if visual completion is never reported; the flush MUST clear any safety timer re-armed during the hold so a stray fire cannot mark visual-complete and make the next handoff skip its animation.
- **H4** — During COMPLETING/HOLD the page MUST keep the rendering-segment set and the header bar mounted even if the job is terminal, because the bar's display feedback is what drives visual completion. The bar's mount gate is handoff-aware directly (`liveSegmentProgressJob || hasPending || displayedSegmentId !== 'none'`); when mounted purely via the handoff (no live job), the bar renders with state `running` so the predictive lane keeps animating and firing `onDisplayProgress`. It MUST NOT rely solely on the terminal-job bridge, whose candidate selection can drop the job at end-of-chapter.
- **H5** — The script text fill MUST follow the bar's *animated* display progress (fed back via `onSegmentDisplayProgress`), never raw stepped event data; the handoff decides only WHICH segment owns the fill. The fill resets to 0 keyed on the *displayed* segment identity.
- **H6** — When the visual bar completes *before* the next swap arrives (segment data hits 1.0 while the job is still finishing; the next segment or sentinel lands later), the swap MUST serve out the *remaining* hold time: the hook records when visual completion occurred, and a swap arriving within `COMPLETION_HOLD_MS` is queued as pending and flushed when the remainder elapses. A swap arriving after the window mounts immediately.
- **H7** — When the observed job status transitions to a terminal FAILURE state (`'failed'` or `'cancelled'`), the handoff MUST reset immediately: clear pending, set `displayedSegmentId` to `'none'`, cancel all hold/safety timers, and record a `terminal_failure_reset` ring event (with `jobId` and `priorDisplayedSegmentId`). No completion animation and no 500 ms hold — a failed render MUST NOT be presented as completing. The reset fires on the non-terminal → failed/cancelled edge; additionally, while the status REMAINS failed/cancelled, late segment inputs (e.g. a trailing `segments.progress` overlay re-delivering the last active segment after the failure frame) MUST be suppressed — they must not re-mount the cleared display (`terminal_failure_suppress` ring event). Normal mounting resumes when the status leaves the failure set. A terminal SUCCESS (`'done'`) is NOT a failure state and MUST keep the existing COMPLETING→HOLD path (H1/H2).

---

## 8. Conformance Invariants

The following invariants are binding on all callers and on the bar implementation itself.

### Callers

- **C1** — SHOULD pass `allowBackwardProgress` explicitly on every render rather than relying on the `!authoritativeFloor` derived default.
- **C2** — MUST pass a stable `persistenceKey` per lane so the `progressMemory` floor is tracked correctly. (There is no numeric `authoritativeFloor` prop to pass; the floor is derived from `progressMemory`.)
- **C3** — MUST NOT feed `segments.progress` into a chapter-level `PredictiveProgressBar`.
- **C4** — MUST NOT remove `PredictiveProgressBar` from the DOM on terminal status without waiting for the done transition.

### Bar implementation

- **I1** — When backward motion is disallowed, the displayed value MUST never fall below the lane's `progressMemory` floor.
- **I2** — A low trust weight `w` MUST increase ETA smoothing (alpha trends toward `ALPHA_MIN`) and tighten the slope cap toward `SLOPE_CAP_LOW`; the model MUST NOT present a high-confidence ETA when `w` is low.
- **I3** — A high coefficient of variation `cv` MUST reduce base trust via `base = max(1 - K*cv, BASE_FLOOR)` (continuous), thereby damping the displayed ETA. (There is no discrete `CV_THRESHOLD` cutoff.)
- **I4** — `doneTransitionPendingRef` MUST be set before the completion animation and cleared after dismissal.
- **I5** — On a lane boundary the `LaneMigration` MUST interpolate the rendered start/end/startProgress between lanes for a smooth transition. (The confidence hook resets its EMA on lane change — it does not carry velocity forward.)
- **I6** — On stall (no update for > `STALL_MS`), `getStallDecayedW()` MUST decay the trust weight `w` toward 0; the bar MUST NOT present a high-confidence ETA at a stale value indefinitely.

### Backend (cross-reference `live-events.md`)

- **B1** — Progress values broadcast to the frontend MUST be rounded to 2 decimal places.
- **B2** — A broadcast MUST fire only when progress advances ≥ 1% since the last broadcast.
- **B3** — `segments.progress` and `job.progress` are distinct fields and MUST NOT be aliased to each other.

---

## 9. Cross-References

| Topic                              | Canonical spec                        |
|------------------------------------|---------------------------------------|
| WebSocket envelope shape           | `docs/specs/live-events.md`           |
| Job status lifecycle               | `docs/specs/queue-jobs.md`            |
| Progress broadcast topic/fields    | `docs/specs/live-events.md` §progress |
| ETA field ownership in job store   | `docs/specs/queue-jobs.md` §ETA       |
