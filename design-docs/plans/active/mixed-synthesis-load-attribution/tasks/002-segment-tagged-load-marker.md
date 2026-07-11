# Task 002 — Segment-tagged, real-load marker (log contract)

**Workstream:** W-MIX-LA · **Depends on:** 001 · **Blocks:** 003, (W-PAR 006) · **Status:** DONE (2026-06-26) — `[MODEL_LOAD_STARTED]` marker (engine.py emit + watchdog extract + manifest + behavior.py pass-through); adversarial review CLEAN

> Read [`../01-map.md`](../01-map.md) parts **P-A/P-B/P-D**, connections **C2/C4**, invariants **INV-2/INV-3/INV-4/INV-7**, risks **R-A/R-D**.

> **⚠ LOCKED by [001-findings.md](001-findings.md) (runtime-confirmed) — read it first; it supersedes the grammar below.** The bug: the XTTS cold-load line is **dropped at the wrapper** (`engine.py:394-398`, `relay_marker` returns `None` for non-bracket lines) and never reaches the orchestrator. **Use a DEDICATED marker, not `[ENGINE_ACTIVITY_STARTED]`** (the mixed handler emits that generically before every group → reusing it would flash warm/cloud groups, violating INV-2). Final design:
> - **Emit** `[MODEL_LOAD_STARTED] {sid?} {task_id}` from `engine.py parse_output` **only when it sees the worker's real cold-load line** (`"Loading XTTS model..."` / `"XTTS serve mode: loading model..."`). Real-load-only for free; never on warm reuse / Voxtral.
> - **Watchdog:** extract `{sid, task_id}` (task_id = last token) following the `[START_SEGMENT]` pattern; thread `segment_id` to listeners.
> - **Manifest:** add `timing_markers.MODEL_LOAD_STARTED: ["[MODEL_LOAD_STARTED]"]` to `tts_xtts` (INV-3). Voxtral: none.
> The orchestrator handling of this marker is **task 003**. Treat the sections below as the fuller contract, reconciled to this dedicated-marker design.

## Goal

Make the model-load signal **identity-bearing and real-load-only**: when (and only when) an engine actually loads its model, it emits a marker carrying the **segment id** (and `task_id`), and the watchdog extracts that segment id and passes it to listeners. This replaces the anonymous `"Loading XTTS model..."` text as the load signal of record.

## Why it matters

This is the log-contract root fix for gap (A): today the load line carries no segment id (P-A), so the orchestrator can only guess (P-C). It is also the prerequisite W-PAR task 006 needs to attribute loads per-segment when multiple segments are active. Per **INV-3**, it must be manifest-driven, not engine-branched in core.

## Grammar (confirm against 001-findings, then lock here)

Follow the existing token shape used by `[START_SEGMENT] {sid} {task_id}`:

- **`[ENGINE_ACTIVITY_STARTED] {segment_id} {task_id}`** emitted **only on a real cold load** (not before every group). Rationale: reuse the marker name already declared in manifests (`behavior.timing_markers.ENGINE_ACTIVITY_STARTED`); the *meaning* sharpens to "a real load is starting for this segment." The mixed handler already emits `[ENGINE_ACTIVITY_STARTED] {segment_id}` (`tts_mixed/handler.py:359`) — extend it to append `{task_id}` and to fire only when the sub-engine is about to actually load (cold), and have XTTS surface its real-load event through the same shape.
- *(Alternative considered: a dedicated `[LOADING_MODEL] {sid} {task_id}` marker. Only choose this if 001 shows reusing `ENGINE_ACTIVITY_STARTED` collides with its synthesis-timing fallback role in `_close_pending_engine_activity_interval`. Document the choice.)*

**INV-7:** the watchdog parse must still yield a sane `task_id` for a legacy un-tagged marker (degrade, not crash).

## Files to touch

| File | Anchor | Change |
|------|--------|--------|
| `plugins/tts_xtts/plugin/server/engine.py` | `relay_marker` / `parse_output` | Per 001's finding on R-A: when the XTTS worker actually loads (cold), surface a `[ENGINE_ACTIVITY_STARTED] {sid} {task_id}` marker for the in-flight request's segment. If the worker's `"Loading XTTS model..."` text is the only cold-load signal, normalize it here (the wrapper knows `req.task_id` and the current segment) into the tagged marker — mirroring how `relay_marker` already normalizes `[START_SEGMENT]`. Do **not** emit it on warm reuse (INV-2). |
| `plugins/tts_xtts/plugin/core/xtts_inference.py` | `:634` | If 001 shows the segment id is available here, emit the tagged marker directly; otherwise leave the text and let the wrapper normalize. (Prefer the wrapper layer if the worker lacks per-segment context.) |
| `plugins/tts_mixed/handler.py` | `:346-381` | Append `{task_id}` to the existing `[ENGINE_ACTIVITY_STARTED] {segment_id}`; ensure it represents a real load for that segment (or defer the real-load signal to the sub-engine per the chosen design). |
| `app/engines/watchdog.py` | `:567-580` (START_SEGMENT/SEGMENT_SAVED parse pattern) | Add an `ENGINE_ACTIVITY_STARTED` (or `LOADING_MODEL`) branch that extracts `segment_id` (and confirms `task_id`) from the tagged marker, following the existing positional-split pattern. |
| `app/engines/watchdog.py` | `:551` (`task_id = None`) and `:586-588` (`listener(line, task_id)`) | Thread a `segment_id` alongside `task_id` to listeners — extend the listener callback signature to `(line, task_id, segment_id=None)` (keep it backward-compatible with existing listeners; default None). |
| `plugins/*/manifest.json` | `behavior.timing_markers` | If a dedicated `LOADING_MODEL` marker is chosen, declare it per engine that loads a model; XTTS yes, Voxtral no (cloud, no load). Manifest-driven (INV-3). |

## Tests (TDD — write first)

- **Watchdog extraction (R1 revert-check):** unit test that a `[ENGINE_ACTIVITY_STARTED] {sid} {task_id}` line yields both `task_id` and `segment_id` to the listener. Revert-check: on pre-002 code the `segment_id` is `None`. Mock boundary (R2): drive `_drain_stream` with a fake stream of lines; assert listener call args. No real subprocess.
- **task_id still extracted (INV-4):** assert the per-job filter still drops a tagged marker bearing another job's `task_id`.
- **Engine normalization:** unit test on `engine.py` `relay_marker`/`parse_output` that a cold-load produces the tagged marker for the in-flight segment, and a warm reuse produces **no** load marker (INV-2). Mock the worker/engine boundary.
- **Backward-compat (INV-7):** a legacy un-tagged `[ENGINE_ACTIVITY_STARTED]` line still parses (degrades to `segment_id=None`, no crash).
- Reuse existing plugin test fixtures; do not mock the watchdog parser or `relay_marker` (units under test, R2).

## Acceptance criteria

- [ ] A real cold load emits `[ENGINE_ACTIVITY_STARTED] {segment_id} {task_id}` (or the chosen `LOADING_MODEL` grammar); warm reuse and Voxtral emit no load marker (INV-2).
- [ ] Watchdog extracts `segment_id` and passes it to listeners; `task_id` extraction + per-job filter unchanged (INV-4).
- [ ] Grammar + emit-layer decision documented in this file's "Grammar" section (reconciled with 001-findings).
- [ ] No engine-id branching in core; markers manifest-declared (INV-3).
- [ ] Legacy un-tagged marker still parses (INV-7).
- [ ] `ruff` + plugin/watchdog tests green; R1 revert-check observed and reported.

## Map links

- Parts **P-A** (emit), **P-B** (extract), **P-D** (manifest grammar); connections **C2** (grammar), **C4** (real-load gating); invariants **INV-2/3/4/7**; risks **R-A/R-D**.

## Out of scope

- Consuming the new identity in the orchestrator → **task 003**.
- Frontend changes → **task 004**.
