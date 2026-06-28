# Progress Presentation Contract

```
spec_version: 1.7.1
updated: 2026-06-28
status: active
sources:
  - frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx
  - frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers.ts
  - frontend/src/components/progress/PredictiveProgressBar/useEtaConfidence.ts
  - frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarDebug.ts
  - frontend/src/hooks/useSegmentHandoffQueue.ts
  - frontend/src/store/live-jobs.ts
  - frontend/src/api/contracts/liveEvents.ts
  - frontend/src/demo/stages/siteMockup/SegmentRenderStrip.tsx
  - app/orchestration/progress/service.py
  - app/orchestration/progress/eta.py
  - app/orchestration/progress/events.py
  - design-docs/specs/live-events.md
  - design-docs/specs/queue-jobs.md
  - design-docs/plans/active/parallel-segment-rendering/10-phase2-render-monitor.md
```

> **TL;DR:** `PredictiveProgressBar` renders server-authoritative progress augmented by a client-side ETA confidence model; every prop that gates backward motion or floors the bar MUST be passed explicitly by callers. **As of 1.4.2, the §4A contract is fully shipped:** confidence is ONE backend-authoritative numeric `eta_confidence ∈ [0,1]` computed by `ProgressService.enrich()` (the single RLock-guarded kernel) with a three-term formula (§4A.2), composed share-weighted from segment and chapter ETAs (§4A.3), crossfaded from calculated to observed (§4A.8), bounded by a mechanical ceiling (§4A.4), and emitted on every progress frame from both producers. `compute_progress_confidence` echo is deleted. §2.6 documents the LOADING_MODEL indeterminate window. §2.5 clarifies the two-layer monotonic floor (server enrich + client `progressMemory`).

## Changelog

| Version | Date       | Change                  |
|---------|------------|-------------------------|
| 1.7.1   | 2026-06-28 | **No fabricated numbers shown as real (owner directive).** The §4A.8 *calculated* ETA requires a REAL calibrated `seconds_per_char`; the `DEFAULT_BASELINE_ENGINE_CPS = 16.7` fallback (added in 1.4.1 / 003b) is removed everywhere it produced a user-facing number — `ProgressService.enrich()` cold ETA, `estimate_active_segment_eta_seconds`, `StudioTask.get_expected_duration`, and the `SEGMENT_SAVED` re-anchor. With no calibration history there is now **no calculated ETA**: cold frames carry `eta_seconds: null` until real observed throughput exists (the first `[PROGRESS]` tick), rather than a made-up countdown — a brief no-ETA window on a never-before-run engine that self-corrects on the first update. Also removed two other fabricated values: chapter `grouped_progress` now reports the TRUE synthesis fraction (clamped < 1.0 until terminal reconciliation forces 100%) instead of an arbitrary ×0.90 "stitching reserve" scale; and voice-sample tasks no longer publish a placeholder `finalizing ≈ 0.9` progress. Amends **B10**; reverses the 1.4.1 cold-ETA-from-baseline note (the spec body already specified a *calibrated* rate — this realigns code to that intent). |
| 1.7.0   | 2026-06-28 | **Segment block-fill / render-monitor presentation (§7A).** Documents the additive per-segment block-fill that sits *beneath* the chapter aggregate bar — the "render monitor" (BitTorrent-style) whose full design lives in plan [10-phase2-render-monitor.md](../plans/active/parallel-segment-rendering/10-phase2-render-monitor.md) and which is validated by a demo reference mock (`frontend/src/demo/stages/siteMockup/SegmentRenderStrip.tsx`). Binding rules (new invariants **M1–M3**, §8): block widths are char-weighted (a manuscript map, not render-time); the aggregate % MUST be derived from the same char-weighted segment sum (done chars + partial rendering chars ÷ total chars), never an independent counter, so the two layers can't drift (M1, cross-refs **B9**); at most `cap` segments active at once (per-engine cap); in-progress reads as a **teal track with the blue fill advancing over it** (owner, 2026-06-28); failure MUST NOT be conveyed by hue alone — a pattern/icon is required for color-blind accessibility (M2); reduced-motion gates the animation at the **timer level**, not just CSS (M3); dual-layer a11y (decorative `aria-hidden` block field + milestone `aria-live` + a queryable segment table as the real keyboard surface); degrade-by-count thresholds. The interim Phase-1 surface remains the existing per-segment bars lighting up in parallel (W-PAR task 006). |
| 1.6.0   | 2026-06-26 | **Segment-granularity preparing tier + per-group (running) load window (§2.7, W-MIX W4).** During a *running* mixed render a later group's model load is a per-group load window: durable `status` stays `running` (INV-1), the frame carries `reasonCode=LOADING_MODEL` + `indeterminate=true` + cleared ETA, force-emitted. Suspension fires only on the active engine's real load marker — the `SEGMENT_PENDING` announce is ETA-neutral, so warm renders don't flash. Frontend: the active segment renders a `preparing` tier (`data-render-status="preparing"`, precedence over rendering, no render cursor, excluded from the rendering set); the segment bar reads "Preparing… / Loading voice model…", is indeterminate, shows no countdown, and the synthetic 120 s lane is suppressed (reasonCode guard); generic indeterminate bars read "Preparing…". ETA suspends then resumes fresh at engine confirmation. No new wire field — threads `reason_code`/`indeterminate`/`loadingElapsedSeconds`. |
| 1.5.0   | 2026-06-19 | **Segment ETA decay-handoff + per-segment confidence (§4A.10).** Two segment-track fixes in `enrich()`. (1) **Segment ETA decay (B11):** the per-segment ETA (`active_segment_eta_seconds`) was raw `remaining_from_update` — noisy early, making the per-segment bar surge then stall. It now blends a grounded baseline (`seg_chars × seconds_per_char`, where `seg_chars = active_render_group_weight`) with the live observed estimate on the implied-total axis, weighted `w_base = c_base × (1 − p)` per the owner's law; `c_base` is the baseline's historical maturity `min(engine_sample_count / N_MATURE, 1)`, fixed per segment. New pure helper `decay_segment_eta()`; new reader `app.db.performance.engine_sample_count`. Only the emitted segment ETA changes — the §4A.3 chapter composition still reads the raw observed value. (2) **Per-segment confidence (B12):** `segments.progress` frames carried the chapter-level `eta_confidence` (rose monotonically across the whole chapter, never reset). They now carry the per-segment `seg_confidence` (from the segment-keyed ring, surfaced via `active_segment_eta_confidence`), resetting per `segment_id`; a saved segment reports `confidence = 1.0`. Added §4A.10, invariants **B11/B12**. |
| 1.4.5   | 2026-06-19 | **Segment bar honors backend status (fixes slow-start highlight).** The `segments.progress` projector (`frontend/src/utils/segmentsProgressProjector.ts`) previously rewrote the backend segment status `running`→`preparing` whenever `activeSegmentProgress <= 0 && reasonCode !== 'START_SEGMENT'` — an obsolete heuristic from when the backend emitted pre-synthesis `preparing`. That manufactured `preparing` made `resolveEndAtMs` return null (I10), so the segment progress bar + text-highlight could not build a predictive lane and didn't animate until progress first exceeded 0 (the "slow start"). The projector now **honors the backend status**, projecting `preparing` only for an explicit load window (`reasonCode === 'SEGMENT_PENDING'` or `indeterminate`); a true running 0% start (START_SEGMENT / `[PROGRESS] 0%` / the START_SYNTHESIS sync) keeps `running` and animates from the first frame. (The `predictive` prop is a no-op for animation — lane motion is gated by status + ETA, not that flag.) |
| 1.4.4   | 2026-06-19 | **Finite-display invariant (I11).** The bar rendered `NaN%` (raw optional `job.progress` from RailBookBlock → non-NaN-safe `clamp01`) and `NaN:NaN` in the ETA countdown (NaN `eta_seconds` slipped through `resolveEndAtMs` because `typeof NaN === "number"` and `NaN < 0` is false). `clamp01` now collapses non-finite to 0; `getLaneProgress` guards NaN duration; `resolveEndAtMs` finite-guards every numeric branch; `displayedRemaining` is null for a non-finite end time; `RailBookBlock` defaults `progress` to 0. New invariant **I11**. |
| 1.4.3   | 2026-06-19 | **Determinate ETA gated on `running` (I10).** Fixes the captured bug where a chapter render emitted `eta_seconds: 57` during `queued`/`preparing` — before `[START_SYNTHESIS]`, across the ~21s XTTS model cold-load — anchored to queue time, then re-anchored at synthesis start, making the bar "jump"; one preparing frame even carried `indeterminate:true` AND `eta_seconds:57` together. `enrich()` now suppresses both the §4A.8 calculated ETA and any incoming observed ETA for non-`running` statuses (nulling `eta_seconds`/`eta_basis`/`estimated_end_at`/`eta_updated_at`); the cold ETA appears at the first `running` frame (START_SYNTHESIS), correctly anchored. Generalized §2.6 (window boundary corrected from `[START_SEGMENT]` announce to `[START_SYNTHESIS]`/first `[PROGRESS]`; new determinate-ETA-only-at-`running` bullet), added §4A.8 I-blend-gate, invariant **I10**. Frontend `PredictiveProgressBar.resolveEndAtMs` enforces the same gate defensively (no countdown for `queued`/`preparing`). Supersedes the 1.4.1 "cold/sparse frames emit non-null ETA" note, which now applies only at `running`. |
| 1.4.2   | 2026-06-18 | **§4A fully shipped; single-source enrich kernel; LOADING_MODEL UX; two-layer floor clarification.** (1) `ProgressService.enrich()` is the single RLock-guarded contract kernel — both producers (Path A `ProgressService.publish` and Path B `broadcast_job_updated`) call `enrich(sample=True)` before building events; snapshot/hydration calls `enrich(sample=False)` (PI6). `compute_progress_confidence` echo deleted; builders fail-loud on `confidence=None` for progress-bearing frames. (2) §4A.2 numeric confidence (variance × completion × freshness, §4A.5 cold-start maturity factor via `n_samples`) implemented and wired. (3) §4A.3 share-weighted segment→chapter ETA/confidence composition implemented in `enrich()`. (4) §4A.8 crossfade `crossfade_eta()` and §4A.4 ceiling `apply_eta_ceiling()` active in `enrich()`. (5) Added **§2.5** to clarify the two-layer monotonic floor: server `enrich` provides monotonically-clamped values; client `progressMemory` is the *display* floor authority. (6) Added **§2.6** for the LOADING_MODEL indeterminate window (Task 009). See also `design-docs/decisions/ADR-0012`. |
| 1.4.1   | 2026-06-17 | **§4A.8 crossfade wiring in `enrich()` (003b).** `ProgressService.enrich()` now computes `eta_calculated = remaining_chars × seconds_per_char` from `script_text` + `engine_id` in the payload (falling back to `DEFAULT_BASELINE_ENGINE_CPS=16.7`) and crossfades it with the incoming observed `eta_seconds` via `crossfade_eta()`, then applies the §4A.4 mechanical ceiling via `apply_eta_ceiling()`. Cold/sparse frames (no incoming `eta_seconds`) with a `script_text` payload now emit a non-null, bounded `eta_seconds`. ETA is null only when both calculated and observed are unavailable. Terminal clearing and the sample=False invariant are preserved. `eta_basis` is set to `"calculated"` when only the baseline is used, `"remaining_from_update"` when an observed value contributed. |
| 1.4.0   | 2026-06-17 | **ETA confidence redesign (target contract; implementation in progress).** Added §4A: a single backend-authoritative numeric `eta_confidence ∈ [0,1]` (deprecating the coarse `"stable"/"estimating"/"done"` string) with a three-term formula (variance × completion × freshness) that is **monotone-rising in progress**; §4A.3 segment→chapter **share-weighted** ETA/confidence composition (a confident late segment dominates; NOT a product); §4A.4 **convergence-to-zero** invariant (countdown ≤ mechanical remaining bound, forced to 0 at completion); §4A.5 variance MUST NOT punish a converging ETA; §4A.6 field/transport conformance — `eta_confidence` numeric must be consumed (today ignored by `live-jobs.ts`), `active_segment_eta_seconds` must be consumed (today dropped), and the undocumented flat `studio_job_event` transport must be documented in live-events.md. New invariants I7–I9, B4–B6. §2.3 cross-referenced to §4A.3. |
| 1.3.4   | 2026-06-16 | Drift corrections: §6 rewritten — `predictiveProgressBarDebug.ts` exports a pure snapshot builder gated by the caller's `onDebugSnapshot` callback, not logging helpers or a `__DEV__` guard; §3.4/I4 scoped to the `done` (completed) transition only — `doneTransitionPendingRef` is never set for `failed`/`cancelled`, and is cleared on done-transition init, not at DOM dismissal; §3.4/§5 terminal animation and eviction clarified — only `done` runs the 500 ms interpolated completion animation, `failed` snaps to `localProgress:1` and `cancelled` snaps to `localProgress:0` with no hold, `progressMemory` eviction fires immediately on any terminal status |
| 1.3.3   | 2026-06-13 | Staleness fix: chapter-bar surface clarified to "queue drawer and Activity page" (§2.3); §7 note that the segment-handoff fill applies to whichever ScriptView mode is active (book view — primary — or script view), not script view only |
| 1.3.2   | 2026-06-11 | H7 re-labelled defense-in-depth: backend per-job terminal latch (live-events.md 1.4.0) now guarantees no post-terminal non-terminal frames |
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

This spec is the binding reference; code that disagrees with it is a bug in one or the other. Progress broadcast rules are cross-referenced to `design-docs/specs/live-events.md` rather than duplicated here.

> **Visual rendering note (P3):** `StatusOrb` adds icon-insets in the Quiet Studio migration (task 003) — see `design-system.md` §6 for the icon-per-state table and calm-pulse/`.is-running` details. `PredictiveProgressBar` carries `.is-running` calm-pulse on its fill; its P3 terminus icon and uppercase status pill were later removed (design-system.md v1.12.0, owner feedback) as redundant. The progress contract (props, math, lane logic, invariants) is unchanged.

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
| Chapter / job   | `job.progress`      | Chapter-level bar (queue drawer and Activity page) |

Callers that render a chapter-level bar MUST source progress from `job.progress` or the equivalent job-level event field. The chapter-level bar surfaces in the **queue drawer** and the **Activity page**; both consume the same `job.progress` field (the §7 segment-handoff fill is a separate, ScriptView-scoped display concern).

> **Scope note (1.4.0).** This separation is about **progress**. The **ETA and confidence** are a different concern: a per-segment ETA *does* compose into the displayed chapter ETA via the share-weighted blend in **§4A.3**. Keeping progress scopes separate does NOT mean the chapter ETA ignores the active segment's clock.

### 2.4 Single-source `enrich` kernel (1.4.2)

All §4A math (confidence, ETA crossfade, ceiling, composition) is performed inside `ProgressService.enrich(job_id, payload, *, sample: bool = True)` — the single boot-installed, RLock-guarded kernel. Both live producers (Path A `ProgressService.publish` and Path B `broadcast_job_updated`) call `enrich(sample=True)` before building any event. Snapshot/hydration calls `enrich(sample=False)` (read-only: computes from the current ring state without mutating it). The event builders in `app/api/contracts/events.py` are the single contract authority: `compute_progress_confidence` (the old echo where `confidence ≡ progress`) is deleted, and builders fail loudly when a progress-bearing frame arrives with `confidence=None`.

### 2.5 Two-layer monotonic floor (D5 — client display authority)

The monotonic floor is enforced at **two distinct layers** that serve different purposes:

- **Server layer (`enrich`):** `ProgressService.enrich()` applies a monotonic clamp so that values written to `state.json` and emitted in frames never regress within a job's lifetime. This prevents the backend from broadcasting backward motion.
- **Client display layer (`progressMemory`):** `PredictiveProgressBar` maintains a `progressMemory` map keyed by `persistenceKey`. The per-key highest value recorded is the **display floor** — the bar never visually moves below this value, regardless of what the server sends. This catches reconnect replays, delayed broadcasts, and smoothing overshoots that occur after the server value was already correctly applied.

These two floors are complementary, not contradictory. The server floor prevents invalid state from being broadcast; the client floor prevents already-displayed progress from visually regressing. The client floor is the **display authority** — it is not a signal that the server floor is absent or insufficient.

### 2.6 LOADING_MODEL indeterminate state (Task 009)

During the model-load window — from `preparing` status dispatch until engine confirmation that synthesis has actually started (the first `[START_SYNTHESIS]` or first `[PROGRESS]` marker, i.e. the status transition to `running` — NOT the earlier `[START_SEGMENT]` *announce*, which can precede a multi-second model cold-load) — the backend emits an indeterminate progress frame:

```jsonc
{
  "status": "preparing",
  "progress": 0.0,
  "reasonCode": "LOADING_MODEL",
  "indeterminate": true,
  "loadingElapsedSeconds": <seconds_since_engine_activity_started_at>  // optional
}
```

Rules:

- `indeterminate: true` signals that no determinate progress is available; the frontend MUST render a **pulsing indeterminate bar** and display "loading voice model…" (or equivalent).
- `loadingElapsedSeconds` is an optional float (seconds since `engine_activity_started_at`); it MAY be used for a wall-clock elapsed display but MUST NOT be used to fabricate a determinate ETA.
- `indeterminate` absent or `false` means a determinate frame; the bar reverts to its normal progress-driven rendering.
- No `eta_seconds` is emitted on a `LOADING_MODEL` frame; `eta_seconds` is `null`.
- **Determinate ETA is valid only at status `running` (I10).** This generalizes the rule above beyond the explicitly-flagged `LOADING_MODEL` frame: frames with status `queued` or `preparing` MUST carry `eta_seconds: null` (and `eta_basis`/`estimated_end_at`/`eta_updated_at` null) *regardless of `reasonCode` or whether a `char_count` payload is present*. `enrich()` MUST NOT emit a §4A.8 calculated ETA (nor pass through an observed one) for a non-`running` status — before synthesis starts there is no synthesis clock, so any ETA would anchor to queue time and visibly "jump" when synthesis begins. The §4A.8 calculated→observed crossfade therefore begins at the first `running` frame. This supersedes the 1.4.1 changelog note that "cold/sparse frames with a `script_text` payload emit a non-null bounded `eta_seconds`": that now applies only once `status == running`. A frame MUST NOT carry `indeterminate: true` together with a non-null `eta_seconds`.
- `expected_model_load_seconds` (a manifest field that would allow a determinate model-load countdown) is **DEFERRED** — do not implement or document it as available.
- The frame is emitted by the orchestrator dispatcher (`orchestrator_helpers.py`) via `ProgressService.publish`; it passes through `enrich()` which preserves the `indeterminate` / `loading_elapsed_seconds` fields and does not compute ETA or confidence for this frame.
- On the next frame that arrives after model load completes (the `[START_SYNTHESIS]` / first `[PROGRESS]` → `running` transition), `indeterminate` is absent/false and the bar reverts to determinate rendering automatically.
- §2.6 covers the **initial** cold-load before the first segment (durable `status="preparing"`, the normal `queued → preparing → running` forward path). A model load that occurs **mid-render** for a *later* group of an already-`running` job is the per-group load window in §2.7 — durable status stays `running` there (INV-1), never regressing to `preparing`.

### 2.7 Per-group preparing tier & segment presentation (W-MIX W3/W4)

For a mixed (or multi-group) render that is already `running`, an individual render group can still hit a model-load window when its engine cold-loads (e.g. a later XTTS group). This is a **per-group phase**, not a durable status change.

**Backend emission (W3):**
- The load window is detected from the **active render-group engine's own load marker** (per-active-engine marker resolution, `live-events.md` §"Per-segment ETA clock semantics"). The mixed handler's generic `[ENGINE_ACTIVITY_STARTED]` placeholder resolves to the *job* engine, not the active group engine, and does **not** trigger suspension.
- On that real marker the orchestrator emits a `LOADING_MODEL` frame with durable `status="running"`, `reasonCode="LOADING_MODEL"`, `indeterminate: true`, `eta_seconds: null` (explicitly cleared — see `live-events.md`), and **force-emitted** (below the normal ≥1 % broadcast threshold) so the UI flips immediately. Authoritative `progress`/`grouped_progress` is unchanged.
- The `[START_SEGMENT]` **announce** (`SEGMENT_PENDING`) is **ETA-neutral** — it carries `eta_seconds: null` *without* an explicit clear (the prior chapter ETA is preserved, not wiped) and without `indeterminate`/force. Because announce fires for every segment of every render, suspending there would make warm single-engine renders flicker at each segment boundary. Suspension is therefore gated on the real load marker only.
- At engine confirmation (`[START_SYNTHESIS]` / first `[PROGRESS]`), ETA pacing resumes from a **fresh** value (re-anchored from 0, per I10), not the stale pre-load ETA.

**Frontend presentation (W4):**
- **Segment span tier.** An active segment whose job phase is preparing (`reason_code ∈ {SEGMENT_PENDING, LOADING_MODEL}` or `indeterminate`) renders a first-class `preparing` tier: `data-render-status="preparing"` (precedence above `rendering`), distinct styling, and **no render cursor** (`SegmentProgressText` is suppressed). The segment is **excluded from the rendering set** (`useStudioChapter.chapterRenderPreparingSegmentIds`, subtracted from `chapterRenderRenderingSegmentIds`).
- **Bar label.** The per-segment load-window bar reads **"Preparing… / Loading voice model…"** (via a scoped `busyLabel`). The shared busy-text helper (`getBusyStatusText`) returns a generic **"Preparing…"** for all *other* indeterminate bars (assembly / export / warm queue rows) — the model-specific wording must not leak onto non-load bars.
- **No synthetic 120 s lane.** `buildSegmentProgressBarProps` receives `reasonCode`; the `SEGMENT_PENDING` guard suppresses the default 120 s ETA seed so the bar is genuinely indeterminate, not a fake countdown.
- **Phase read from signals only (INV-1/INV-5).** The UI distinguishes preparing from rendering purely via `reason_code`/`indeterminate`; it never requires a `running → preparing` durable-status regression. Signals are threaded end-to-end (extract → overlay whitelist → hydration merge → hook → view); no new event field is introduced.
- **Reduced motion.** The preparing pulse is decorative and disabled under `prefers-reduced-motion` (the global guard in `base.css`); it is a pure opacity breathe, no movement.

Reduced-motion, INV-1 (monotonic durable status), and INV-5 (preserve existing signals) all hold. Cross-references: `live-events.md` §"Model-load preparing window", `queue-jobs.md` §3.8 (per-group phase vs durable status).

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

When a lane reaches the `done` (completed) status and the previous `presentationState` was an active state (`running`, `processing`, or `finalizing`):

1. `doneTransitionPendingRef` is set to `true` on the render where `presentationState` first becomes `'done'`.
2. The bar holds at its current progress value and plays a 500 ms interpolated completion animation (`COMPLETION_HOLD_MS = 500`).
3. `doneTransitionPendingRef` is cleared when the done-transition object is initialized in the subsequent effect (not at DOM dismissal).

`doneTransitionPendingRef` is **never** set for `failed` or `cancelled` — those statuses render `localProgress: 1` (failed) or `localProgress: 0` (cancelled) with no hold animation and no pending flag.

**MUST NOT** abruptly remove the bar on `done` status without waiting for the completion animation.

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

## 4A. Numeric ETA Confidence, Composition & Convergence (v1.4.0 — authoritative)

> **Status:** This section is the binding contract. As of 1.4.2 the implementation is in
> conformance: the §4A kernel (`enrich`) is shipped; §4A.2/§4A.3/§4A.4/§4A.5/§4A.8 are
> active in production. §4A.6 items 1–4 have been resolved (numeric confidence, both
> transports enriched, echo deleted). §4A.7 empirical evidence is retained for history.
>
> **Why this exists.** Three unrelated "confidence" quantities had accreted: a backend
> status-derived string `eta_confidence` (emitted, gated on, but **never read** by the
> client), an internal frontend trust weight `w` (never displayed), and a separately
> computed displayed percentage. They never composed. A render once "finished" while the
> UI showed ~30 s remaining, because a late, accurate 4 s / high-confidence segment ETA was
> diluted by smoothing and a low chapter weight, and nothing forced the countdown to 0 at
> completion. §4A defines the single model that fixes this.

### 4A.1 One confidence — numeric, backend-authoritative

There is exactly **one** confidence quantity: **`eta_confidence ∈ [0, 1]`**, a float computed
by the backend and emitted on every progress frame at **both** the job/chapter scope and the
active-segment scope. The UI **MUST** display this value directly and **MUST NOT** compute a
second, independent confidence number for display.

The coarse string form (`"stable" | "estimating" | "done"`) is **deprecated** as of 1.4.0 and
replaced by the float. It MAY be retained only as a derived presentational *label* (e.g.
bucketing the float), never as the source of truth.

The frontend trust weight `w` (§4.1) is retained **only** as the internal smoothing/slope
control. Its `base` term **MUST** be seeded from the backend `eta_confidence` so the displayed
confidence and the smoothing trust can never diverge. `w` is never the displayed confidence.

### 4A.2 Confidence formula (monotone-rising toward completion)

`eta_confidence` is composed from three terms, each in `[0, 1]`:

```
c_var   = clamp01(1 - K_VAR * cv)                      # stability: low ETA variance → high
c_done  = smoothstep(progress, P_LO, P_HI)             # completion: 0→1 as progress P_LO→P_HI
c_fresh = exp(-max(0, age_ms - STALL_MS) / TAU_MS)     # freshness: decays when samples go stale
eta_confidence = clamp(BASE_FLOOR, 1, c_fresh * (c_var + (1 - c_var) * c_done))
```

- **I-conf-monotone:** with a steady sample stream (`c_fresh = 1`), `eta_confidence` is
  **monotone non-decreasing in `progress`** — the `c_done` term lifts a noisy-but-progressing
  estimate toward 1 as the work completes. This is the owner-specified "confidence rises toward
  the end" rule. A test MUST assert this.
- Recommended constants (calibrate against render telemetry, do not hardcode in multiple places):
  `K_VAR = 2.0`, `P_LO = 0.55`, `P_HI = 0.95`, `STALL_MS = 10000`, `TAU_MS = 8000`,
  `BASE_FLOOR = 0.2`. These SHOULD live beside `ETA_CONFIDENCE`.

### 4A.3 Segment → chapter composition (a confident late segment dominates)

When an active segment reports its own `active_segment_eta_seconds` and segment-scope
`eta_confidence`, the **displayed chapter ETA and confidence** are composed by a
**share-weighted blend**, NOT a product:

```
share        = remaining_in_active_segment / remaining_total      # → 1 near end of chapter
w_seg        = seg_confidence * share
eta_display  = w_seg * seg_eta + (1 - w_seg) * chapter_eta_excluding_active
conf_display = max(chapter_confidence, seg_confidence * share)
```

- **I-compose:** a high-confidence segment ETA that covers the dominant remaining share
  (`share → 1`) **MUST** pull the displayed chapter ETA toward the segment estimate and lift
  `conf_display` toward the segment confidence. It **MUST NOT** be diluted to
  `seg_confidence * chapter_confidence`.
- This is precisely why the observed "91% × 37% ≈ 34%" is the wrong operation: multiplication
  double-penalizes, so a correct final-segment estimate can never take over. Share-weighting
  lets the last segment win as it should.

### 4A.4 Convergence-to-zero invariant

Independent of EMA / `clampSlope` smoothing, the displayed remaining time MUST be bounded by the
mechanical remaining-work estimate and MUST reach 0 at completion:

```
eta_ceiling = (1 - progress) / max(velocity, EPS)         # mechanical bound from observed rate
eta_shown   = min(eta_smoothed, CEIL_SLACK * eta_ceiling)  # CEIL_SLACK ≈ 1.3 for slack
eta_shown   = 0   when progress ≥ 0.999  OR  status ∈ {done, failed, cancelled}
```

- **I7 (convergence):** the displayed countdown **MUST NOT** exceed `CEIL_SLACK * eta_ceiling`
  and **MUST** be 0 at completion/terminal — regardless of how sticky the smoothed estimate is.
  This is the rule whose absence let the bar "finish" at 30 s. A revert-checkable test MUST
  cover: progress→1 with a stale large `eta_smoothed` ⇒ `eta_shown` → 0.

### 4A.5 Trust MUST NOT punish a converging ETA

The variance term (`cv`) **MUST NOT** treat a **monotonically improving** ETA — a late estimate
dropping sharply toward 0 as the render completes — as instability. Today a 4 s sample landing
after a run of ~30 s samples produces a high `cv`, which *lowers* trust exactly when it should
rise. The model MUST compute `cv` so that an expected, completion-driven downward convergence
does not depress `eta_confidence` (e.g. recency-weight the samples, or measure variance of
*throughput/velocity* rather than of raw remaining-seconds). A late accurate ETA MUST raise, not
lower, trust.

### 4A.6 Field & transport conformance (known drift — implementation MUST fix)

1. **`eta_confidence` numeric, emitted AND consumed.** The backend emits a status-derived string
   that no frontend runtime path reads (`live-jobs.ts` copies ~20 fields, not this one). Replace
   with the float per §4A.1–4A.2 and consume it for display.
2. **`active_segment_eta_seconds` MUST be consumed** as the segment ETA. Today it is computed and
   sent but the UI reads the generic envelope `etaSeconds`, dropping the per-segment clock; the
   composition in §4A.3 depends on consuming the dedicated field.
3. **Both transports MUST carry the full ETA field set.** Progress reaches the client on two
   wires: the documented `studio_event` envelope (camelCase) **and** a flat `studio_job_event`
   frame (snake_case) — the latter currently carries `eta_basis`, `estimated_end_at`, and the
   active-segment fields that the envelope omits. Both MUST carry `eta_seconds`/`etaSeconds`,
   `eta_basis`, `estimated_end_at`, `eta_confidence`, `eta_updated_at`, and the active-segment
   counterparts, so the merged result is not transport-order-dependent.
4. **Document the flat transport.** The flat `studio_job_event` frame is undocumented in
   `live-events.md`, which asserts every backend frame uses the `studio_event` envelope. This is
   the largest spec gap; `live-events.md` MUST document the flat frame (or the backend MUST route
   progress through the envelope) and reconcile the camelCase/snake_case split for these fields.

### 4A.7 Empirical evidence (debug capture 2026-06-17, job-845cf017, chapter 1)

A captured render confirms the diagnosis and pins two backend defects the build MUST fix:

- **`etaSeconds` is `null` on nearly every progress frame.** `chapter_progress` frames from
  `orchestrator_publish._publish` carry `confidence` but `etaSeconds: null`; only frames from a
  **second publisher**, `app.studio_plugin_sdk.context.update_job_fields`, carry a real
  `etaSeconds`. The accurate late estimate DID arrive — exactly one frame:
  `{progress: 0.91, groupedProgress: 0.9, etaSeconds: 4, confidence: 0.91}` — but it was the lone
  real ETA among many null-ETA frames, so the bar coasted on its own velocity estimate (~30 s)
  and one 4 s/0.91 frame could not overcome the smoothing (no convergence rule fired). **Fix:**
  emit `etaSeconds` + numeric `eta_confidence` on **every** chapter_progress frame from a
  **single authoritative publisher**; the two-publisher split with disjoint field sets makes the
  merged client state frame-order-dependent (§4A.6.3) and starves the predictive bar of ETAs.
- **`groupedProgress` caps at 0.9 even at completion.** `queue.txt` shows `progress: 1` with
  `grouped_progress: 0.9` at `done` (the "stitching room" scaling). The displayed chapter
  progress MUST reach 1.0 at completion — the 0.9 cap MUST NOT leave the bar visually short
  (ties to I7 convergence).
- **Dual confidence fields confirmed disjoint:** numeric `confidence` (observed `0.44`, `0.9`,
  `0.91`, `1` on the envelope, populated) vs string `eta_confidence` (`null` on the snapshot,
  dead). Per §4A.1 these MUST collapse to one numeric field.

The full `recentAuditFrames` timeline (queue.txt) makes two **primary backend defects** undeniable —
these dominate the frontend smoothing and MUST be fixed first:

- **`confidence` is just `progress` echoed.** Every running frame: `progress 0.44 → confidence 0.44`,
  `0.9 → 0.9`, `0.91 → 0.91`, `1 → 1` (and `confidence 1` while `progress 0`). The emitted
  `confidence` carries **zero** variance/freshness/ETA-stability information — it is the progress
  value under another name. **Fix:** `confidence`/`eta_confidence` MUST be the §4A.2 metric
  (variance × completion × freshness), distinct from `progress`. A test MUST assert `confidence`
  diverges from `progress` under unstable ETAs. *(New invariant B7.)*
- **Chapter progress is render-group-quantized and freezes mid-group.** Observed: `progress`
  held at `0.44` for ~18 s (group 1 of 2 done; group 2 rendering) while `etaSeconds` *grew*
  28→47 (elapsed rises, progress frozen ⇒ remaining-from-rate inflates), then snapped
  `0.44→0.9→1` in ~1 s. The within-group segment progress never lifted chapter progress, so the
  bar stalls then jumps and the ETA climbs instead of falling. **Fix:** chapter `progress`/
  `grouped_progress` MUST advance *continuously within* a render group from the active segment's
  progress (`completed_weight + active_seg_progress × active_weight`), not only at group
  boundaries — i.e. the per-segment `[PROGRESS]` markers MUST feed `active_seg_progress` for the
  active group. *(New invariant B8.)*
- **ETA must not inflate during a progress stall.** While progress is flat, `etaSeconds` grew
  monotonically (28→47). Combined with B8, a stalled-progress ETA MUST be bounded by the
  mechanical ceiling (§4A.4) and the confidence MUST drop (freshness/variance), rather than the
  ETA silently climbing.

### 4A.8 ETA source blend — calculated (start) → observed (end)

The displayed ETA is a **progress-driven crossfade** of two sources, because each is reliable at a
different phase of the render:

- **Calculated ETA** — `remaining_chars × seconds_per_char`, where `seconds_per_char` is a **real
  calibrated** rate from the engine's recorded history. Reliable at the **start**, before any
  observed throughput exists. **No fabricated fallback rate (1.7.1):** if the engine has no
  calibration history, `seconds_per_char` is null and there is NO calculated ETA — the bar shows no
  countdown at progress ≈ 0 until observed throughput appears, rather than inventing one from a
  hardcoded default. A made-up number is never shown as a real ETA.
- **Observed ETA** — `remaining_work / observed_velocity` (velocity measured from actual render
  throughput). Reliable toward the **end**, once enough real data has accumulated.

```
ramp        = smoothstep(progress, P_LO, P_HI)         # 0 at start → 1 toward completion
eta_display = (1 - ramp) * eta_calculated + ramp * eta_observed
```

- **I-blend:** at `progress = 0` the **calculated** ETA dominates; as `progress → 1` the
  **observed** ETA dominates. Both inputs MUST be bounded by the §4A.4 mechanical ceiling and the
  blended result MUST converge to 0 at completion. *(New invariant B10.)*
- **I-blend-gate (1.4.3):** the crossfade is **gated on `status == running`**. At `queued`/`preparing`
  no ETA is emitted (`eta_seconds = null`); the calculated source becomes active only at the first
  `running` frame (§2.6, I10). "`progress = 0` calculated dominates" applies to the first *running*
  frame, not to pre-synthesis frames.
- This complements §4A.2: the ramp shifts which ETA *source* is trusted, while `eta_confidence`
  expresses how much to trust the displayed result; both rise/shift with progress.

### 4A.9 Character-count weighting (real work, not segment count)

All progress/ETA weighting MUST be by **character count**, never segment count:

```
total_chars       = Σ chars(segment) over the chapter      # e.g. 1685
weight(segment)   = chars(segment)                          # e.g. 340  (NOT 1/N)
progress          = completed_chars / total_chars
active_contribution = active_seg_progress × chars(active_segment)   # within-group credit (B8)
eta_calculated    = (total_chars - completed_chars) × seconds_per_char
```

- **I-charweight:** a segment's contribution to chapter progress and to the ETA MUST be proportional
  to its character count (`340 / 1685`), not `1 / segment_count`. The grouped-progress weight table
  (`id_to_weight`/`total_weight`) MUST be the per-segment character counts summed; within a render
  group, each segment's chars MUST be credited as it completes (ties to B8). *(New invariant B9.)*
- Today the group weight already uses `len(text)` per group entry; this invariant extends it to
  **per-segment** credit within a group and to the calculated-ETA's `seconds_per_char` basis.

### 4A.10 Segment ETA decay-handoff (confidence-gated baseline → observed)

§4A.8 stabilises the **chapter** ETA. The **per-segment** ETA (`active_segment_eta_seconds`, the
value that drives the per-segment render bar) was raw `remaining_from_update` extrapolation — noisy
at the start of each segment (a tiny first-interval velocity sample), which makes the bar surge then
stall. The segment ETA MUST be stabilised by a confidence-gated decay handoff in `enrich()`,
analogous to §4A.8 but operating on the **implied total-duration axis** and weighted by the
baseline's **own historical confidence**:

```
T_obs   = seg_eta_observed / max(1 - p, EPS)  # implied total from the live estimate (T_obs = T_base when no observed value)
T_base  = seg_chars × seconds_per_char        # grounded baseline total (seg_chars = active_render_group_weight)
w_base  = c_base × (1 - p)                     # baseline influence: its confidence, decaying with progress
eta     = ( w_base · T_base + (1 - w_base) · T_obs ) × (1 - p)
```

- **c_base** is the baseline's historical maturity — `min(n_samples / N_MATURE, 1)` over the
  engine's recorded render samples (`engine_sample_count`). A freshly-verified engine has ~1 sample
  (`c_base ≈ 0.2`) so the baseline is given little influence and the live estimate leads;
  `c_base` rises toward 1 as real renders accumulate, so a well-sampled engine gets a strong early
  baseline anchor that damps the surge. **c_base is FIXED at segment start** (cached per
  `segment_id` on the live `sample=True` path) — the `(1 - p)` term carries all intended
  time-variation. The snapshot/hydration path (`sample=False`) computes `c_base` read-only and
  does not write the cache, so a hydration call never fixes the value mid-segment.
- **I-segeta:** the emitted segment ETA MUST equal the formula above when a baseline is available
  (`seg_chars > 0` and a positive `seconds_per_char`); when no baseline is available the raw observed
  value is kept. Edge behaviour: `c_base = 0` → pure observed; `c_base = 1, p = 0` → pure baseline
  anchor; `p → 1` → pure observed; terminal/`p ≥ 0.999` → 0. *(New invariant B11.)*
- **I-segconf:** a `segments.progress` frame's `confidence` MUST be the **per-segment** confidence
  (a `seg_confidence` from the segment-keyed ring, resetting per `segment_id`), never the chapter-level
  `eta_confidence` (which legitimately accumulates across the whole chapter). A finished segment
  (`SEGMENT_SAVED`) reports `confidence = 1.0`. *(New invariant B12.)*
- This blend only adjusts the **emitted segment ETA**; the §4A.3 chapter composition continues to
  read the raw observed segment ETA, so the chapter ETA path is unchanged.

---

## 5. Terminal Eviction

`progressMemory` (the in-memory store of lane progress history on the frontend) is capped. Terminal jobs (`completed`, `failed`, `cancelled`, or `queued` — any status matched by `isTerminalStatus`) are evicted from `progressMemory` **immediately** when the terminal status is observed (via the `useEffect` that watches `presentationState`). Eviction does not wait for the done-transition animation to finish.

For `completed` lanes, the completion animation still runs because `doneTransitionRef` was already initialized on the prior render before the eviction effect fires; the animation completes its 500 ms hold and then the bar is dismissed. For `failed`/`cancelled` lanes there is no hold, so the eviction and the snap to terminal render happen in the same cycle.

**MUST** evict terminal entries to prevent unbounded memory growth across long sessions.

---

## 6. Debug Utilities

`predictiveProgressBarDebug.ts` exports a single pure function, `buildPredictiveProgressDebugSnapshot`, which assembles a `PredictiveProgressDebugSnapshot` object from the bar's internal state fields. It has no side effects (no `console.*`, no logging, no `__DEV__` guard).

The snapshot builder is invoked only when the caller passes the optional `onDebugSnapshot` callback prop to `PredictiveProgressBar`. Production renders that omit `onDebugSnapshot` never call this function.

**MUST NOT** call `buildPredictiveProgressDebugSnapshot` for any purpose other than forwarding to `onDebugSnapshot`; it MUST remain side-effect-free.

---

## 7. Segment Handoff Queue (`useSegmentHandoffQueue`)

`frontend/src/hooks/useSegmentHandoffQueue.ts` owns the display-layer queueing between consecutive segments in the Chapter Editor. One page-level instance drives BOTH the header segment bar and the ScriptView text fill/highlight.

> **Note (ScriptView mode scope).** The segment-handoff text fill applies to whichever
> ScriptView mode is currently active — **book view** (the PRIMARY Studio mode) or
> **script view** (secondary) — not script view only. Both modes are rendered by the one
> ScriptView and fed by the same single page-level handoff instance; the handoff decides
> WHICH segment owns the fill regardless of which mode displays it. Older phrasing in this
> section that says "script-view text fill" should be read as "the active ScriptView mode's
> text fill". The mechanism below is unchanged.

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
- **H7** — When the observed job status transitions to a terminal FAILURE state (`'failed'` or `'cancelled'`), the handoff MUST reset immediately: clear pending, set `displayedSegmentId` to `'none'`, cancel all hold/safety timers, and record a `terminal_failure_reset` ring event (with `jobId` and `priorDisplayedSegmentId`). No completion animation and no 500 ms hold — a failed render MUST NOT be presented as completing. The reset fires on the non-terminal → failed/cancelled edge; additionally, while the status REMAINS failed/cancelled, late segment inputs (e.g. a trailing `segments.progress` overlay re-delivering the last active segment after the failure frame) MUST be suppressed — they must not re-mount the cleared display (`terminal_failure_suppress` ring event). Normal mounting resumes when the status leaves the failure set. A terminal SUCCESS (`'done'`) is NOT a failure state and MUST keep the existing COMPLETING→HOLD path (H1/H2). *Defense-in-depth:* the backend now guarantees no non-terminal frame follows a job's terminal frame (live-events.md §"Terminal ordering guarantee" — per-job terminal latch), so the late-input suppression here is no longer load-bearing; it stays as the client-side safety net.

---

## 7A. Segment Block-Fill / Render Monitor Presentation

A chapter that renders its segments in parallel (W-PAR) earns an **additive** per-segment visualization: a row of blocks, one per segment, sized to the manuscript and filling in as audio data arrives — the "render monitor" (BitTorrent-style). It sits **beneath** the chapter aggregate `PredictiveProgressBar`; it does **not** replace it. Full UX design (progressive disclosure, power controls, open questions) lives in the plan: [10-phase2-render-monitor.md](../plans/active/parallel-segment-rendering/10-phase2-render-monitor.md). This section is the binding *presentation contract* the production component must satisfy.

**Status.** Target contract for the Phase-2 render monitor (not yet in the real app). The interim Phase-1 surface is the existing per-segment bars lighting up in parallel (W-PAR task 006). A demo **reference implementation** — `frontend/src/demo/stages/siteMockup/SegmentRenderStrip.tsx`, on the Activity queue screen — validates the encoding, the aggregate-derivation rule, the fail→retry state, and reduced-motion gating.

### Block encoding

- **Width = character count** (a manuscript map), clamped to a minimum (~6 px in production; the demo uses 3 px to keep slivers visible in its narrow panel). Blocks abut as one continuous strip (the container rounds + clips the outer ends; no per-block gaps). Width encodes *how much manuscript*, **not** render time — engines differ in chars/second, so this MUST be made clear (label/tooltip on first expand).
- **State:**
  - **queued** — recessive flat fill (`--surface-alt`), no animation.
  - **preparing** (model-load / `LOADING_MODEL` window, §2.6–2.7) — indeterminate sweep, no determinate inner fill.
  - **rendering** — a **teal track** with the **blue (`--accent`) fill advancing left-to-right** over it as the segment's `progress` rises, plus a subtle pulse so parallel workers read as alive. The teal/blue two-tone makes "working" instantly distinct from queued (grey) and done (solid blue). *(Owner decision, 2026-06-28.)*
  - **done** (validated artifact) — solid `--accent`, static.
  - **failed / retrying** — MUST be distinguishable **without relying on hue** (M2): a pattern (crosshatch) or icon overlay, because red/green is inaccessible to color-blind users. A danger-hued border MAY be a *secondary* cue but MUST NOT be the only one. *(The current demo mock uses a red inset border only — acceptable for the mock; production MUST add the pattern/icon.)*
- **Engine is NOT a colour axis** — engine identity lives in the per-segment detail/popover, never as a second hue on the block.
- **Concurrency** — at most `cap` blocks are in an active (preparing/rendering) state at once, where `cap` is the per-engine concurrency cap (W-PAR 001). The active blocks are the visible "parallel mini-queues".

### Aggregate consistency (the load-bearing rule)

The chapter % shown on the aggregate bar above the strip MUST be **derived from the same char-weighted segment set** that the blocks render from — `progress = (Σ done.chars + Σ rendering.chars × fill) / Σ total.chars` — and MUST NOT be an independently-maintained counter. This guarantees the two layers can never drift (e.g. the aggregate honestly *stalls* while segments sit in `preparing`, and *dips* when a segment fails and retries from zero). Cross-references the char-weighted progress rule **B9**.

### Accessibility (dual-layer)

The block field is a **decoration layer** (`aria-hidden`, or `role="img"` with one summary label such as "Rendering 6 of 50 segments, 4 in parallel"). Accessibility is delivered through a parallel surface: a milestone-only `aria-live` region (chapter start/complete + threshold counts — **never** per-segment chatter) and an always-present, keyboard-reachable **segment table** (index, state, engine, ETA) that is the real keyboard surface. The block field decorates; the table informs.

### Motion & scale

- **Reduced motion** — `prefers-reduced-motion: reduce` MUST gate the animation at the **timer level** (don't start the simulation/subscription interval), not merely via CSS, so there is no DOM churn for assistive tech. A static representative frame is still shown (reduced motion ≠ no information).
- **Degrade by segment count** — `< 10`: omit the field (the aggregate bar suffices); `10 – ~60`: full block field; `> ~60` (exact threshold TBD, see plan): degrade to bar + count or virtualize; `> ~500`: a canvas escape hatch (the accessible table then becomes the sole keyboard surface). The real feature MUST NOT silently render hundreds of sub-pixel slivers as if legible.

---

## 8. Conformance Invariants

The following invariants are binding on all callers and on the bar implementation itself.

### Callers

- **C1** — SHOULD pass `allowBackwardProgress` explicitly on every render rather than relying on the `!authoritativeFloor` derived default.
- **C2** — MUST pass a stable `persistenceKey` per lane so the `progressMemory` floor is tracked correctly. (There is no numeric `authoritativeFloor` prop to pass; the floor is derived from `progressMemory`.)
- **C3** — MUST NOT feed `segments.progress` into a chapter-level `PredictiveProgressBar`.
- **C4** — MUST NOT remove `PredictiveProgressBar` from the DOM on `done` (completed) status without waiting for the completion animation. `failed` and `cancelled` have no hold, so immediate removal is acceptable for those statuses.
- **C5 (1.4.0)** — MUST surface the backend numeric `eta_confidence` as the displayed confidence and MUST consume `active_segment_eta_seconds` for segment ETA; MUST NOT invent a separate displayed confidence number (§4A.1, §4A.6).

### Bar implementation

- **I1** — When backward motion is disallowed, the displayed value MUST never fall below the lane's `progressMemory` floor.
- **I2** — A low trust weight `w` MUST increase ETA smoothing (alpha trends toward `ALPHA_MIN`) and tighten the slope cap toward `SLOPE_CAP_LOW`; the model MUST NOT present a high-confidence ETA when `w` is low.
- **I3** — A high coefficient of variation `cv` MUST reduce base trust via `base = max(1 - K*cv, BASE_FLOOR)` (continuous), thereby damping the displayed ETA. (There is no discrete `CV_THRESHOLD` cutoff.)
- **I4** — `doneTransitionPendingRef` MUST be set on the first render where `presentationState` becomes `'done'` from an active state, and MUST be cleared when the done-transition object is initialized in the subsequent effect. It MUST NOT be set for `failed` or `cancelled`.
- **I5** — On a lane boundary the `LaneMigration` MUST interpolate the rendered start/end/startProgress between lanes for a smooth transition. (The confidence hook resets its EMA on lane change — it does not carry velocity forward.)
- **I6** — On stall (no update for > `STALL_MS`), `getStallDecayedW()` MUST decay the trust weight `w` toward 0; the bar MUST NOT present a high-confidence ETA at a stale value indefinitely.
- **I7 (1.4.0)** — **Convergence:** the displayed remaining time MUST NOT exceed `CEIL_SLACK * (1-progress)/velocity` and MUST be 0 at completion/terminal, independent of EMA/slope smoothing (§4A.4).
- **I8 (1.4.0)** — **Composition:** a high-confidence active-segment ETA covering the dominant remaining share MUST pull the displayed chapter ETA toward it and lift displayed confidence toward the segment's (share-weighted, never a product) (§4A.3).
- **I9 (1.4.0)** — **Display = backend confidence:** the bar MUST display the backend numeric `eta_confidence` and MUST NOT invent a second confidence number; the internal `w` is seeded from it (§4A.1). A converging (monotonically dropping) ETA MUST NOT lower confidence (§4A.5).
- **I11 (1.4.4)** — **Finite display:** the rendered percentage AND the ETA countdown MUST be finite. A non-finite progress (undefined/NaN — e.g. a raw optional `job.progress`) collapses to 0 via `clamp01` (the shared percentage sink); a non-finite `eta_seconds` (NaN passes `typeof === "number"` and `NaN < 0 === false`, so every numeric branch of `resolveEndAtMs` MUST use `Number.isFinite`) suppresses the countdown (`displayedRemaining = null`) rather than rendering `"NaN%"` / `"NaN:NaN"`.
- **I10 (1.4.3)** — **ETA gated on `running`:** `eta_seconds` (and `eta_basis`/`estimated_end_at`/`eta_updated_at`) MUST be `null` for any frame whose status is not `running` — a determinate (calculated or observed) ETA MUST NOT appear on `queued`/`preparing` frames (incl. the model cold-load window); the §4A.8 crossfade begins at the first `running` frame (§2.6, §4A.8 I-blend-gate). A frame MUST NOT carry `indeterminate: true` together with a non-null `eta_seconds`. The frontend `PredictiveProgressBar` enforces the same gate defensively (`resolveEndAtMs` returns no countdown for `queued`/`preparing`).

### Backend (cross-reference `live-events.md`)

- **B1** — Progress values broadcast to the frontend MUST be rounded to 2 decimal places.
- **B2** — A broadcast MUST fire only when progress advances ≥ 1% since the last broadcast.
- **B3** — `segments.progress` and `job.progress` are distinct fields and MUST NOT be aliased to each other.
- **B4 (1.4.0)** — `eta_confidence` MUST be a numeric `[0,1]` float computed per §4A.2 (variance × completion × freshness), emitted at job AND active-segment scope. The coarse string form is deprecated.
- **B5 (1.4.0)** — Every progress transport (the `studio_event` envelope AND the flat `studio_job_event` frame) MUST carry the full ETA field set — `eta_seconds`/`etaSeconds`, `eta_basis`, `estimated_end_at`, `eta_confidence`, `eta_updated_at`, and `active_segment_eta_seconds` + segment-scope `eta_confidence` — so the merged client state is not transport-order-dependent. The flat frame MUST be documented in `live-events.md`.
- **B6 (1.4.0)** — `eta_confidence` MUST be monotone non-decreasing in `progress` for a steady sample stream (§4A.2 I-conf-monotone).
- **B7 (1.4.0)** — The emitted `confidence`/`eta_confidence` MUST be the §4A.2 metric and MUST NOT be the `progress` value echoed. Today `confidence == progress` on every frame (§4A.7); a test MUST assert they diverge under an unstable/stalled ETA.
- **B8 (1.4.0)** — Chapter `progress`/`grouped_progress` MUST advance **continuously within** a render group from the active segment's progress, not only at group boundaries. The per-segment `[PROGRESS]` markers MUST feed `active_seg_progress` so the bar does not freeze mid-group and the ETA does not inflate during the stall (§4A.7).
- **B9 (1.4.0)** — Progress/ETA weighting MUST be by **character count** (`weight(segment) = chars(segment)`, `progress = completed_chars/total_chars`), never segment count; within-group credit is per-segment chars (§4A.9).
- **B10 (1.4.0; amended 1.7.1)** — The displayed ETA MUST crossfade from the **calculated** ETA (`remaining_chars × seconds_per_char`, dominant at start) to the **observed** ETA (dominant toward completion) via a progress ramp, both bounded by the §4A.4 ceiling and converging to 0 (§4A.8). The **calculated** ETA exists ONLY when a real calibrated `seconds_per_char` is available — there is no fabricated baseline rate (1.7.1). With no calibration the crossfade has only the observed source, and `eta_seconds` is null until observed throughput exists. An ETA MUST NEVER be derived from a hardcoded default rate.
- **B11 (1.5.0)** — The emitted per-segment ETA (`active_segment_eta_seconds`) MUST be the §4A.10 confidence-gated decay blend of the grounded baseline (`seg_chars × seconds_per_char`) and the live observed estimate, weighted `w_base = c_base × (1 − p)` on the implied-total axis, when a baseline is available; otherwise the raw observed value is kept. `c_base` is the engine's historical maturity, fixed per `segment_id`. The blend MUST NOT alter the §4A.3 chapter composition input (§4A.10).
- **B12 (1.5.0)** — A `segments.progress` frame's `confidence` MUST be the per-segment `seg_confidence` (segment-keyed ring, resetting per `segment_id`), never the chapter-level `eta_confidence`; a finished segment (`SEGMENT_SAVED`) reports `1.0` (§4A.10).

### Render monitor (§7A)

- **M1 (1.7.0)** — **Aggregate derived from segments:** the chapter % shown above a segment block-fill MUST be the char-weighted sum over the same segment set (`(Σ done.chars + Σ rendering.chars × fill) / Σ total.chars`), never an independent counter, so the strip and the bar cannot diverge (§7A; cross-ref **B9**).
- **M2 (1.7.0)** — **Failure not by hue alone:** a failed/retrying block MUST be distinguishable via a non-hue channel (pattern or icon); a danger colour MAY be a secondary cue only (§7A, accessibility).
- **M3 (1.7.0)** — **Reduced-motion gates the timer:** under `prefers-reduced-motion: reduce` the animation driver (interval/subscription) MUST NOT run; a static representative frame is rendered instead. CSS-only suppression is insufficient (§7A).

---

## 9. Cross-References

| Topic                              | Canonical spec                        |
|------------------------------------|---------------------------------------|
| WebSocket envelope shape           | `design-docs/specs/live-events.md`           |
| Job status lifecycle               | `design-docs/specs/queue-jobs.md`            |
| Progress broadcast topic/fields    | `design-docs/specs/live-events.md` §progress |
| ETA field ownership in job store   | `design-docs/specs/queue-jobs.md` §ETA       |

> **Open cross-spec action (1.4.0).** `live-events.md` currently documents only the
> `studio_event` envelope, but progress/ETA/confidence ride a second, **flat
> `studio_job_event`** frame that is undocumented. Per §4A.6/B5, `live-events.md` MUST be
> updated to document that frame (fields, casing) — or the backend MUST route progress through
> the envelope. `queue-jobs.md` MUST also bump `eta_confidence` from a string to the numeric
> `[0,1]` float. Both are tracked as part of the 1.4.0 implementation.
