# Implementation Map — Mixed-Engine Model-Load Fix

> **TL;DR:** Four edit surfaces across three ownership boundaries. The orchestrator owns marker resolution, ETA suspension, and metrics; the plugin layer owns the load signal; the frontend owns the preparing presentation. The watchdog and VoiceBridge are **not** touched — they must stay ignorant of render-group/model-load semantics (ownership split, `.agent/rules/modular_architecture.md`).

## Parts & fix surface (by ownership boundary)

### A. Marker / progress resolution — *orchestrator (job lifecycle) + plugin manifest (contract)*
- **`app/orchestration/scheduler/orchestrator_helpers.py`** — `log_listener` currently resolves `engine_id` once from the job payload (`"mixed"`) and uses it for `match_timing_marker` / `parse_engine_progress`. Change: resolve the **active group's** engine so the load/progress markers of XTTS/Voxtral actually match. No engine-ID branching — look up the active group's declared engine and use its manifest markers generically.
- **`app/api/routers/generation.py`** (`_build_script_for_chapter`, ~L167) — **correction to an earlier assumption:** the orchestrator iterates `task.script`, and script entries do **not** carry an `engine` key today (they have `text`/`speaker_wav`/`id`/`ids`/`save_path`/`weight` + optional `voice_profile_dir`). The per-active-engine resolution above has nothing to read until this builder propagates `"engine": engine_id` into each script entry (the engine is already computed in this function). This is a required prerequisite edit for surface A, captured in task 001.
- **`plugins/tts_mixed/manifest.json`** — has no `behavior.timing_markers`. Either (preferred) the orchestrator resolves per active-group engine as above, and/or the mixed handler emits an explicit bracketed `[ENGINE_ACTIVITY_STARTED]` per group so detection never depends on matching child-engine stdout strings (robust to warm vs cold worker).
- **`plugins/tts_mixed/handler.py`** — optionally emit the explicit per-group load-start/confirm markers around `_render_segment`.

### B. Duration / metrics capture — *orchestrator + db*
- **`app/orchestration/scheduler/orchestrator_helpers.py`** — `SEGMENT_SAVED` duration must measure from the **engine-confirmation** clock (`segment_starts`), never fall back to the **announce** time when a load window is present; accumulate `model_load_seconds` / `inter_group_overhead_seconds` from the now-matched load markers; orchestrator is the **sole** writer of the render sample (synthesis-only clock).
- **`plugins/tts_mixed/handler.py`** — stop writing a wall-time `synthesis_duration_seconds` that includes load (or subtract the load window); do not write a competing sample.
- **`app/db/performance.py`** — `record_render_sample` keeps `model_load_seconds` out of `cps`; the model-load/overhead split already exists and works **once `model_load_seconds` is captured** (the Layer-1 prerequisite).
- **`app/orchestration/scheduler/eta.py`** — `calculate_chapter_remaining_eta` already accepts an `inter_group_overhead` term; preparation/overhead may inform *total* chapter ETA but never synthesis CPS.

### C. ETA suspension + status/phase — *orchestrator*
- **`app/orchestration/scheduler/orchestrator_publish.py`** — a **null `eta_seconds` must clear** the persisted ETA (currently persisted only when non-null, so it sticks through the load window). On the load window, emit `indeterminate=true` and clear segment/chapter ETA while keeping authoritative progress unchanged.
- **`app/orchestration/scheduler/orchestrator_helpers.py`** — the `SEGMENT_PENDING`/load frame keeps durable `status="running"` (monotonic) but carries a per-group **phase = preparing** (`reason_code` already present); force queue/chapter/segment emission during the window even with no progress delta so the bar updates to preparing.

### D. Preparing presentation — *frontend*
- **`frontend/src/pages/Book/studio/useStudioChapter.ts`** — split a "preparing/loading" set out of `chapterRenderRenderingSegmentIds`: an `active_segment_id` whose `reason_code` is `SEGMENT_PENDING`/`LOADING_MODEL` must **not** count as rendering.
- **`frontend/src/pages/ChapterEditor/components/ScriptView.tsx`** — add a `preparing` render-status tier (distinct styling) to the span vocabulary.
- **`frontend/src/store/live-jobs.ts`** — **correction:** `reason_code` is *already* mapped onto the overlay delta (~L247 `applyEvent`, ~L371 `applyJobUpdated`); the actual gap is that the `indeterminate`/loading flag isn't surfaced as a stable branch field. Surface `indeterminate` so the hook can branch.
- **`frontend/src/pages/ChapterEditor/components/ChapterHeader.tsx`** — pass `reasonCode` into `buildSegmentProgressBarProps({...})` (call at ~L561-578; `reasonCode` currently dropped). This is what *activates* the existing guard below.
- **`frontend/src/components/progress/progressBarContracts.ts`** — **correction (this is where the 120 s lane lives, not predictiveProgressBarHelpers):** the `SEGMENT_PENDING` guard + the synthetic 120 s default-ETA seed already exist here (~L41-46). No change needed to the guard itself — it simply isn't reached because `ChapterHeader` drops `reasonCode`. Once threaded, `isSegmentPending` suppresses the 120 s seed automatically.
- **`frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers.ts`** — relabel only: `getBusyStatusText` (~L214-219, text at L218) says "Working…" universally; render "Preparing… / Loading voice model…" for the preparing/indeterminate window. Keep generic so `QueueItem.tsx` inherits it.
- **`frontend/src/components/ui/StatusOrb.tsx`** — optional preparing appearance distinct from the running spinner.

### E. (Owner decision) Resource claim — *orchestrator (scheduler)*
- **`app/orchestration/tasks/synthesis.py:88`** — mixed task claims `ResourceClaim.none()`. If in scope: claim the **union** of child-group engine resource needs (short-term) or a per-group lease (longer-term), so other GPU jobs aren't admitted mid-load.

## Invariants to preserve

- **INV-1 — Durable job status is monotonic.** Never regress `running→preparing`. The preparing state is a per-group phase / `reason_code`, per [docs/specs/live-events.md:343](../../specs/live-events.md) (`SEGMENT_PENDING` is announcement-only).
- **INV-2 — No engine-ID branching in core.** Marker/progress resolution keys on the *active group's declared engine* via its manifest, never `if engine == "xtts"` (`modular_architecture.md`).
- **INV-3 — `model_load_seconds` stays out of `synthesis_duration_seconds` and out of ETA/CPS training data.** Synthesis CPS is computed from confirmation→saved only.
- **INV-4 — Ownership split holds.** Orchestrator owns lifecycle/progress/metrics; watchdog only passes log lines through (no model-load semantics); VoiceBridge owns routing. The fix must not teach the watchdog about model state.
- **INV-5 — Existing live-event signals are preserved, not invented.** `SEGMENT_PENDING`, `LOADING_MODEL`, `indeterminate`, `loadingElapsedSeconds`, `reasonCode` already exist end-to-end in `app/api/contracts/events.py` ↔ `frontend/src/api/contracts/liveEvents.ts`; the fix threads them through, it does not add a parallel channel.
- **INV-6 — One sample per group.** Eliminate the duplicate handler+orchestrator render-sample write.

## Connections / contracts touched

- Event envelope fields (`reason_code`, `indeterminate`, `eta_seconds` null-clearing) — backend `app/api/contracts/events.py` and frontend `liveEvents.ts` must agree; R3 frontend tests build frames via these types.
- DB render-performance sample (`synthesis_duration_seconds`, `model_load_seconds`, `inter_group_overhead_seconds`).
- Specs to update in the same change (joint authority): `live-events.md`, `progress-presentation.md`, `queue-jobs.md`.

## Risks / open questions

- **Warm vs cold worker** may emit the load line differently (or not at all) — argues for the explicit handler-emitted marker (surface A) over string-matching engine stdout.
- **Concurrent jobs**: load lines without a task-id could misattribute across listeners (`watchdog._drain_stream` extracts task-id only from bracketed markers) — verify under concurrency.
- **ETA resume**: ensure the bar re-anchors cleanly from 0 on confirmation rather than snapping from a stale value.
