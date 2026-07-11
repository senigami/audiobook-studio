# 01 — Implementation map

The big picture, the parts, the wires between them, the invariants that must hold across all tasks, and the risks. Every task file links back here.

## Big picture

A model-load window must travel from the engine that's loading, all the way to the segment span that should pulse "Preparing…", **carrying the identity of the segment it belongs to** the whole way. Today that identity is dropped: XTTS emits its load as anonymous text, and the orchestrator re-attaches a segment only by guessing "whatever segment is active right now." Mid-chapter, that guess is wrong, so the wrong segment (or no segment) gets the preparing state.

The fix threads **segment identity** through the existing log→orchestrator→frontend pipeline, fires the preparing frame on a **real load only** (never warm/cloud groups), and optionally surfaces the load at the chapter level and in the ETA.

```
engine load (cold)                    watchdog               orchestrator                 ws        frontend
[xtts_inference / engine.py]  ──►  [_drain_stream]  ──►  [log_listener +          ──► [LOADING_MODEL ──► [live-jobs store]
 emit a REAL, segment-tagged        extract task_id        marker match +              frame: indeterminate,  ──► [useStudioChapter]
 load marker                        (+ NEW: segment_id)    attribute by IDENTITY]      active_segment_id]     ──► [ScriptView span pulse]
```

## The parts

| ID | Part | Files (anchors) | Responsibility |
|---|---|---|---|
| **P-A** | XTTS load-emit layer | `plugins/tts_xtts/plugin/core/xtts_inference.py:634` (`"Loading XTTS model..."`); `plugins/tts_xtts/plugin/server/engine.py` (`relay_marker` / `parse_output`, normalizes worker markers, appends `task_id`) | Emit the cold-load signal. Today: bare text, no identity, fires at model init (before the segment loop). Must become a real, segment-tagged marker. |
| **P-B** | Watchdog marker extraction | `app/engines/watchdog.py:550-588` (per-marker `task_id` parse), `:586-588` (`listener(line, task_id)`) | Parse identity off marker lines and fan to listeners. Today extracts `task_id` only; must also extract `segment_id` and pass it through. |
| **P-C** | Orchestrator attribution | `app/orchestration/scheduler/orchestrator_helpers.py`: `_active_engine_has_specific_activity_marker` (`:605-622`), `ENGINE_ACTIVITY_STARTED` handling (`:715-756`), `log_listener` (`:666-712`), initial cold-load frame "mechanism A" (`:426-445`), `_get_grouped_progress` (`:506-516`) | Decide *whether* a line is a real load and *which segment* it belongs to, then publish the preparing frame. Today: ambient `active_seg_id`; must use marker-borne identity. |
| **P-D** | Manifest timing-markers + matcher | `plugins/*/manifest.json` `behavior.timing_markers` / `progress_pattern`; `app/engines/behavior.py` (`get_timing_markers`, `match_timing_marker`) | Declares per-engine markers (manifest-driven, no engine-id branching). The contract surface for what a "load marker" looks like. |
| **P-E** | Frontend live-jobs store | `frontend/src/store/live-jobs.ts:250-269` (scope gate on `active_segment_id`, `indeterminate`, `loadingElapsedSeconds`) | Merge live events into job overlay state. Today: `active_segment_id` only updates on `scope:'segment'`. |
| **P-F** | Frontend preparing render | `frontend/src/pages/Book/studio/useStudioChapter.ts:205-246` (`chapterRenderActiveSegmentId`, `isActiveJobPreparing`, `chapterRenderPreparingSegmentIds`); `frontend/src/pages/ChapterEditor/components/ScriptView.tsx:126-161,457-511`; `frontend/src/pages/ChapterEditor/scriptViewProgress.ts:21-52` | Turn job overlay fields into the per-span visual state (preparing pulse vs rendering animation vs frozen). |
| **P-G** | ETA predictor | `app/orchestration/scheduler/eta.py:105-141` (`calculate_chapter_startup_eta`, `get_calibrated_model_params`), `orchestrator_eta.py:18-26` (`estimate_task_duration`) | Forward ETA from history. Today consumes `cps` + `inter_group_overhead_seconds`; ignores `model_load_seconds`. |
| **P-H** | Perf DB | `app/db/core.py:357-382` (`render_performance_samples` schema, incl. `model_load_seconds`, `inter_group_overhead_seconds`); `app/db/performance.py` (insert/read); `app/db/models.py:66-76` | Stores per-render timing samples. `model_load_seconds` is recorded but unread. |

## The connections (the wires)

- **C1 — the load-attribution pipeline (P-A→P-B→P-C→ws→P-E→P-F).** The end-to-end path a load window travels. The break is between P-A (drops identity) and P-C (re-guesses it). Fixing C1 is the spine of this workstream (tasks 002→003→004).
- **C2 — the marker grammar (P-A↔P-B↔P-D).** Marker token order must be stable and backward-parseable. Today: `[START_SEGMENT] {sid} {task_id}` and `[SEGMENT_SAVED] {path} {task_id}`. New load marker should follow the same shape: **`[ENGINE_ACTIVITY_STARTED] {sid} {task_id}`** (or a dedicated `[LOADING_MODEL] {sid} {task_id}`). The watchdog parse (P-B) keys on substring + positional split — adding tokens must not break existing `task_id` extraction (it currently reads `sub_parts[1]` for START_SEGMENT). **Decide grammar in task 002; the diagnostic (001) confirms what's emitted today.**
- **C3 — the publish-frame contract (P-C↔P-E, governed by `live-events.md`).** The orchestrator's `_publish(... reason_code="LOADING_MODEL", indeterminate=True, active_segment_id=…, loading_elapsed_seconds=…, clear_eta=True)` fields must match what the store reads. Relaxing the P-E scope gate must keep this contract honest (an `active_segment_id` on a non-segment-scoped frame must be intentional and documented).
- **C4 — real-load gating (P-A↔P-C, the hazard).** The mixed handler emits `[ENGINE_ACTIVITY_STARTED]` (generic) before **every** group; `_active_engine_has_specific_activity_marker` exists precisely to stop warm/cloud groups from being treated as loads (see the comment at `orchestrator_helpers.py:632-641`). The new marker must fire **only on an actual cold model load**, so the distinguisher moves from "is the marker engine-specific text?" to "did the engine actually load?". The cleanest source of truth is the engine itself (it knows cold vs warm) — P-A emits the real-load marker only when it loads.
- **C5 — load history → ETA (P-H↔P-G).** Task 006 (chosen approach — owner 2026-06-26; DONE 2026-07-01) wires `model_load_seconds` history into the forward ETA (cold-vs-warm aware).

## Invariants (must hold across all tasks)

- **INV-1 — No regression to working paths.** XTTS-first cold load still shows preparing (mechanism A, `:426-445`); Voxtral-only shows "Working…" immediately, no preparing flash. Covered by tests + 👁 G0.
- **INV-2 — Warm/cloud groups never flash "preparing."** A warm XTTS group (model already loaded) and any Voxtral group must not trigger the preparing frame. This is the single biggest regression risk (C4). Every change to load detection must add/extend a test asserting the warm path stays silent.
- **INV-3 — No engine-id branching in core** (modular_architecture INV-5). Load detection is driven by manifest `behavior.timing_markers` and marker identity, never `if engine_id == "xtts"`.
- **INV-4 — Job routing stays intact.** Adding `segment_id` to a marker must not break `task_id` extraction (P-B) or the `log_listener` per-job filter (`:668`). Lines for other jobs must still be dropped.
- **INV-5 — Joint spec authority.** Behavior change ⇒ matching spec bump + changelog row, same change. Affected specs: `live-events.md` (1.7.1), `progress-presentation.md` (1.6.0), `queue-jobs.md` (1.6.0), `data-model.md` (1.4.1), `system-architecture.md` (1.5.0).
- **INV-6 — TDD + R1–R4.** Failing test first; R1 revert-check each bug-fix test; R2 mock boundaries only; R3 contract-shaped frames via `publishStudioSocketMessage`; R4 no sleep timing.
- **INV-7 — Backward-compatible markers.** Plugins are versioned and updated together with the parser, but the grammar must be chosen so an un-tagged legacy marker still parses to a sane result (degrade to ambient attribution, never crash).

## Risks & open questions

- **R-A — Cold-vs-warm at emit time.** P-A must emit the real-load marker only when it actually loads the model. In the warm-worker model the load happens on a worker's first job; confirm where "Loading XTTS model..." actually fires relative to the per-segment job (diagnostic 001). *Open: does the load line have access to the current segment id at its emit site, or must the engine wrapper (P-A, engine.py) attach it from the in-flight request?*
- **R-B — Marker ordering in mixed casting.** The mixed handler emits `[START_SEGMENT] {sid}` and `[ENGINE_ACTIVITY_STARTED] {sid}` around the sub-engine call; the sub-engine's own load text fires inside. Confirm the exact ordering (001) so the attribution fires for the right segment and after the right START_SEGMENT.
- **R-C — Scope-gate relaxation (P-E).** Relaxing `live-jobs.ts:262` so a chapter-scoped frame can set `active_segment_id` risks stale attribution if a frame carries an old id. Define precise semantics: only set when the frame explicitly carries a concrete `active_segment_id` tied to a `LOADING_MODEL`/`indeterminate` reason.
- **R-D — The `_active_engine_has_specific_activity_marker` heuristic.** It keys on marker text ≠ `"[ENGINE_ACTIVITY_STARTED]"`. If the grammar changes, this heuristic may misfire; task 003 likely replaces it with identity+real-load logic. Don't leave both mechanisms half-wired.
- **R-E — Chapter-level "pause" semantics (task 005).** Holding chapter progress during load could read as "stuck." Decide: indeterminate styling vs. literal hold vs. reserved-time ETA. Owner-facing 👁 decision.

## Map links index (for task backlinks)

Parts P-A…P-H · Connections C1…C5 · Invariants INV-1…INV-7 · Risks R-A…R-E.
