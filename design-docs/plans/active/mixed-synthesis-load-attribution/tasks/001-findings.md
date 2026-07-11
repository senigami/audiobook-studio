# 001 — Findings (diagnostic)

**Status:** DONE (2026-06-26) — root cause confirmed by static trace of the full mixed→xtts call path. Live owner-trace confirmation folds into the G0 re-check (task 007).

## Confirmed root cause (gap A)

**The XTTS cold-load signal is dropped at the engine wrapper and never reaches the orchestrator.**

- XTTS emits its cold load as a **bare text line** — `"Loading XTTS model..."` (`plugins/tts_xtts/plugin/core/xtts_inference.py:634`, one-shot) / `"XTTS serve mode: loading model..."` (`:132`, warm-worker `--serve`). It is emitted **once per worker process** (cold load only); warm reuse re-runs the job loop without re-printing it. So the line is already an accurate real-load-only signal.
- The XTTS engine wrapper's `parse_output` (`plugins/tts_xtts/plugin/server/engine.py:322-400`) re-emits a line to the TTS-server stderr (where `app/engines/watchdog.py:_drain_stream` can see it) **only when `relay_marker(line, task_id)` returns non-None** (`:394-398`).
- `relay_marker` (`engine.py:28-81`) only recognizes **bracketed markers** (`[START_SYNTHESIS]`, `[START_SEGMENT]`, `[SEGMENT_SAVED]`, `[PROGRESS]`). For the bare cold-load line it returns `None` → **the line is dropped** and never reaches the watchdog → never reaches the orchestrator's `log_listener`.
- Therefore the manifest text-match (`behavior.timing_markers.ENGINE_ACTIVITY_STARTED: ["Loading XTTS model..."]`) **can never fire on the warm-worker path** — the orchestrator's mid-chapter load mechanism (`orchestrator_helpers.py:715-756`) is starved of its trigger.

### Why XTTS-first works but mid-chapter doesn't
- **XTTS-first:** the orchestrator emits the preparing frame at **dispatch time** (mechanism A, `orchestrator_helpers.py:426-445`), independent of any runtime marker. So the first cold load is covered regardless of the dropped line.
- **Mid-chapter XTTS (2nd engine):** there is no dispatch-time frame for a later segment; it relies entirely on the runtime `ENGINE_ACTIVITY_STARTED` match — which is dropped. Result: no preparing frame → the segment shows near-zero rendering progress ("first letter, frozen") until real synthesis output flows.

## Call-flow facts (R-A / R-B answered)

- Mixed handler (`plugins/tts_mixed/handler.py:346-381`) emits, per segment, in order: `[START_SEGMENT] {sid}` → `[ENGINE_ACTIVITY_STARTED] {sid}` (generic placeholder) → **then** calls the sub-engine in-process (`generate_via_bridge` → bridge → HTTP `/synthesize`). So by the time the sub-engine's cold-load line *would* arrive, the orchestrator's `active_seg_id` is **already** the correct segment. **The ordering is NOT the bug** (correcting the pre-diagnostic hypothesis).
- The sub-engine call carries the **mixed job's `task_id`** end-to-end (`bridge_helpers`→`bridge_remote`→`tts_client`→`/synthesize`).
- **Segment-id availability (R-A):** the orchestrator's `log_listener` already tracks the correct `active_seg_id` (from the mixed handler's `[START_SEGMENT]`). The XTTS wrapper has `req.task_id` and its own `active_segment_id` (set by any `[START_SEGMENT]` it processes), but in the mixed per-segment path the sub-engine call may be plain-text (no in-call `[START_SEGMENT]`), so the wrapper's `active_segment_id` can be `None`. **The authoritative segment id lives in the orchestrator, not the wrapper.**
- **Cold-vs-warm truth (C4):** the worker prints the load line only on cold load; the `WarmWorkerManager` spawn-vs-reuse (`warm_worker.py:_acquire_worker`) is the other cold signal. The bare load line is already a correct real-load-only signal — no per-group false positives.

## Secondary item to verify in task 003 ("Bug 2")

Even once the load line reaches the orchestrator, the frame only fires if the guard at `orchestrator_helpers.py:715-756` passes: `matched_marker_engine == active_engine_id and _active_engine_has_specific_activity_marker(active_engine_id)`. `_resolve_active_engine_for_matching` (`:561-585`) derives the active engine from `script[group_index].get("engine")`. **Confirm** the mixed job's `script` (as seen in the orchestrator closure) carries per-group `engine: "xtts"` so this resolves to `"xtts"` (guard passes). If it resolves to `"mixed"`, `_active_engine_has_specific_activity_marker("mixed")` is `False` and the frame still won't fire — in which case task 003 must either populate the per-group engine or relax the guard to fire when `matched_marker_engine` itself has a specific marker and `active_seg_id` is set. *(Best confirmed by the owner G0 trace at 007, or by reading how the mixed `script` is assembled for the orchestrator.)*

## Locked approach (supersedes the tentative grammar in 002/003)

- **Task 002 (simpler than originally framed):** in the XTTS wrapper, **stop dropping the cold-load line** — re-emit it as a *recognized* marker so it reaches the orchestrator. Re-emit as **`[ENGINE_ACTIVITY_STARTED] {task_id}`** (matching the existing relay grammar; the orchestrator attributes it to its own authoritative `active_seg_id`). Add an `active_segment_id` token when the wrapper knows it (`[ENGINE_ACTIVITY_STARTED] {sid} {task_id}`) — harmless when present, and the watchdog `segment_id` extraction (still part of 002) lets W-PAR 006 use it later for multi-active attribution. Real-load-only is **free** (the worker only prints the line on cold load). No engine-id branching — it's the XTTS plugin's own wrapper recognizing its own load line (INV-3 satisfied).
- **Task 003:** (a) confirm/fix "Bug 2" (mixed active-engine resolution) so the guard fires for the XTTS segment; (b) keep warm/cloud silent (INV-2) — guaranteed because no load line is emitted for them. The ambient `_active_engine_has_specific_activity_marker` heuristic can largely stay; the fix is making the trigger *arrive* + resolving the active engine correctly, not replacing the attribution wholesale.
- **Per-segment tagging across the plain-text mixed path** (full identity independent of a single ambient `active_seg_id`) is the residual that **W-PAR 006** formalizes; for the current single-active reality the orchestrator's `active_seg_id` is sufficient once the trigger arrives.

## Runtime confirmation (2026-06-26 — owner-provided live trace)

Owner supplied a live Voxtral→XTTS mixed render (`/Users/stevendunn/Documents/debug/{chapter-segment,event-stream,queue}.txt`, job `job-6aa4acbb…`, engine `mixed`, 3 render groups). It confirms the static diagnosis and resolves the open items:

- **Group 0 = Voxtral `_0`:** rendered instantly (19:25:37→39, no load), chapter progress → 0.06.
- **XTTS cold load = 19:25:39 → 19:25:59 (~20s):** during this window the backend published **zero frames**. Last frame before the gap = `chapter_progress status=running progress=0.06 reasonCode=SEGMENT_PENDING` (frame 38); next frame at 19:25:59 = `_close_pending_engine_activity_interval` (frame 46), still `progress=0.06 eta=51`. **No `LOADING_MODEL`/`indeterminate` frame was ever emitted for the load.** ✅ confirms gap A.
- **ETA not suspended (gap B):** `eta_seconds` went 53 → 51 across the load — never cleared/indeterminate — so the predictive bar kept creeping ("didn't pause"). Chapter progress held at 0.06 but with no preparing indicator.
- **Timing capture works (gap C):** the mixed handler's *generic* `[ENGINE_ACTIVITY_STARTED] {sid}` **does** reach the orchestrator and opened/closed the `pending_engine_activity` interval (frame 46), capturing the ~20s load. `predicted_audio_length=57` vs `produced=82s` → load-aware ETA has real data.
- **Bug 2 resolved:** the generic `[ENGINE_ACTIVITY_STARTED]` reaches the orchestrator but is (correctly) ignored as a preparing trigger; the *specific* `"Loading XTTS model..."` trigger never arrives (dropped at `relay_marker`). So attribution doesn't depend on `_resolve_active_engine_for_matching` — it depends on **delivering a real-load signal that the orchestrator acts on**.

## LOCKED DESIGN (final — supersedes the tentative grammar above)

**Reusing `[ENGINE_ACTIVITY_STARTED]` is rejected** — the mixed handler emits it before *every* group (warm XTTS, Voxtral included), so firing "preparing" on it would flash warm/cloud groups (INV-2 violation). Instead:

- **Dedicated marker `[MODEL_LOAD_STARTED] {sid} {task_id}`**, emitted by the **XTTS wrapper** (`engine.py parse_output`) **only when it observes the worker's real cold-load line** (`"Loading XTTS model..."` / `"XTTS serve mode: loading model..."`). Real-load-only by construction (the worker prints those once per process, on cold load) → INV-2 safe; never emitted for warm reuse or Voxtral.
- `sid` = the wrapper's `active_segment_id` when known (omit if not); `task_id` = `req.task_id` (last token, for the per-job filter — avoids the cross-job leak a bare text line would cause).
- **Watchdog** extracts `{sid, task_id}` from `[MODEL_LOAD_STARTED]` (following the `[START_SEGMENT]` positional pattern).
- **Manifest:** add `timing_markers.MODEL_LOAD_STARTED: ["[MODEL_LOAD_STARTED]"]` to `tts_xtts` (manifest-driven; INV-3). Voxtral declares none (no load).
- **Orchestrator:** handle `matched_marker == "MODEL_LOAD_STARTED"` → emit the `LOADING_MODEL`/`indeterminate` frame (`clear_eta=True`, attributed to the marker's `sid` or `active_seg_id`). No `_active_engine_has_specific_activity_marker` gate needed — the marker *is* the real-load signal. Keep the existing generic-marker timing-interval capture for `model_load_seconds` (avoid double-count). This is real-load-only, so warm/cloud stay silent automatically.

## No code left behind
No production instrumentation was added (the trace was static; the live trace was owner-run). `git diff` for this task = this findings note only.
