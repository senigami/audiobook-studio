# Task 001 — Diagnostic: pin the exact marker ordering

**Workstream:** W-MIX-LA · **Depends on:** — · **Blocks:** 002, 003 · **Status:** DONE (2026-06-26) — see [001-findings.md](001-findings.md)

> Read [`../01-map.md`](../01-map.md) parts **P-A/P-B/P-C**, connections **C1/C2/C4**, risks **R-A/R-B** before starting. This task is investigation + a findings note. **No production code change** beyond temporary, reverted instrumentation.

## Goal

Confirm, with a real Voxtral→XTTS mixed render, the **exact ordering and content** of the TTS log lines and the published events around the mid-chapter XTTS cold load — so tasks 002/003 build on observed fact, not the ~90%-confident static read. Specifically pin:

1. The precise sequence of marker/text lines around the second (XTTS) segment's load: where `[START_SEGMENT] {sid}`, the mixed handler's `[ENGINE_ACTIVITY_STARTED] {sid}`, and the inner `"Loading XTTS model..."` text fall **relative to each other**.
2. What `active_seg_id[0]` and `active_engine_id` are at the instant `"Loading XTTS model..."` is processed (the ambient-attribution failure point, `orchestrator_helpers.py:715-756`).
3. Whether `_active_engine_has_specific_activity_marker` returns True/False for the active engine at that instant, and which branch the orchestrator takes (does it publish a `LOADING_MODEL` frame or not?).
4. The published event stream the frontend receives for that segment (does an `indeterminate=True` / `reason_code="LOADING_MODEL"` frame with the correct `active_segment_id` ever go out?).
5. Whether the load line has access to the current segment id at its emit site (`xtts_inference.py:634`) or only the engine wrapper does (`engine.py`) — settles **R-A**.

## Why it matters

Tasks 002 (grammar + emit site) and 003 (attribution logic) hinge on *where* identity is lost and *which* layer can re-attach it. The mixed-handler ordering (R-B) and the cold-vs-warm emit point (R-A) are the two facts that static reading can't fully guarantee. Getting this wrong means 002 tags the marker in the wrong layer or 003 fires on warm groups.

## Files to inspect / instrument (temporarily)

| File | Anchor | What to capture |
|------|--------|-----------------|
| `app/engines/watchdog.py` | `_drain_stream` `:533-592` | Add a temporary `logger.info` dumping each raw `line` + extracted `task_id` (timestamped) — to capture true emit order. |
| `app/orchestration/scheduler/orchestrator_helpers.py` | `log_listener` `:666-756` | Temporarily log `(line, active_seg_id[0], active_engine_id, matched_marker, _active_engine_has_specific_activity_marker(active_engine_id))` at the `ENGINE_ACTIVITY_STARTED` branch. |
| `plugins/tts_mixed/handler.py` | `:346-381` | Confirm the emit order of `[START_SEGMENT]` / `[ENGINE_ACTIVITY_STARTED]` vs the sub-engine call. |
| `plugins/tts_xtts/plugin/server/engine.py` | `relay_marker` / `parse_output` | Confirm whether the current segment id is available to the wrapper for the in-flight request. |
| Event stream | `app/api/ws.py` `broadcast_*` | Capture (or have the owner capture from the browser/ws) the frames published for the XTTS segment. |

## Steps

1. Add the temporary instrumentation above (clearly marked `# TEMP-DIAG-001`, easy to revert).
2. 👁 **Owner-run:** trigger one Voxtral→XTTS mixed render on a 2+ segment chapter; collect the server log and (if possible) the ws event log. *(If the owner can't capture ws, infer from the published frames logged server-side.)*
3. Produce `tasks/001-findings.md` in this folder: the annotated line-by-line ordering, the ambient-state snapshot at the load line, the branch taken, and the published frames. State plainly: **did a correctly-attributed `LOADING_MODEL` frame for the XTTS segment ever publish?** and **which layer (worker / wrapper / mixed handler) knows the segment id at load time?**
4. Recommend, in the findings note, the grammar + emit-site for task 002 and the attribution mechanism for task 003 (e.g. "wrapper appends `{sid}` from the in-flight request" vs "make the load text a real marker in the worker").
5. **Revert all instrumentation** (confirm `git diff` is clean except the findings note).

## Acceptance criteria

- [ ] `tasks/001-findings.md` exists with the annotated ordering, ambient-state snapshot, branch taken, and published frames.
- [ ] The note answers definitively: (a) does a correctly-attributed XTTS-segment `LOADING_MODEL` frame publish today? (b) where is segment identity available at load time (R-A)? (c) the mixed-handler vs sub-engine ordering (R-B).
- [ ] A concrete recommendation for task 002's grammar/emit-site and task 003's attribution mechanism.
- [ ] All temporary instrumentation reverted (`git diff` shows only the findings note).

## Map links

- Parts **P-A/P-B/P-C**; connections **C1** (pipeline), **C2** (grammar), **C4** (real-load gating); risks **R-A** (cold-vs-warm emit site), **R-B** (mixed ordering).

## Out of scope

- Any permanent code change (that's 002+). This task only observes and recommends.
