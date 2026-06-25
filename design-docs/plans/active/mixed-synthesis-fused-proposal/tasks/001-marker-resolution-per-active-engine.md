# Task 001 — Marker / progress resolution per active group engine

**Workstream:** W1  ·  **Depends on:** none  ·  **Blocks:** 002, 003  ·  **Status:** DONE (2026-06-25)

> Read [`../01-map.md`](../01-map.md) (surface **A**, invariants **INV-1…INV-6**) and
> [`../00-overview.md`](../00-overview.md) (Layer 1 root cause) before starting. This task is the
> keystone: until the load window is *detectable* for a mixed render, W2 and W3 have nothing to act on.

## Goal
Make a mixed render recognize the **active render group's** engine timing-markers and progress
pattern instead of the static job engine-id `"mixed"`. Today a mixed job resolves markers once from
`engine_id="mixed"`, whose manifest declares no `behavior.timing_markers`, so marker matching falls
back to `DEFAULT_TIMING_MARKERS` and never matches the child engine's real stdout (e.g. XTTS's
unbracketed `"Loading XTTS model..."`). After this change, when an XTTS group inside a mixed render
loads its model, the orchestrator's `log_listener` matches `ENGINE_ACTIVITY_STARTED` and captures
`engine_activity_started_at` / `model_load_seconds` — exactly as a pure XTTS render already does.

## Why it matters
This is **Layer 1** in `00-overview.md` — the linchpin neither prior plan found. The existing
load-exclusion design (split clocks, `model_load_seconds`, the preparing frame) is *correct but
unreachable for mixed* because marker resolution is keyed on the wrong engine. Fixing it is the
prerequisite for W2 (synthesis-only duration) and W3 (ETA suspension): both consume the markers this
task makes matchable.

## Files to touch
| File | Current anchor (file:line) | Change |
|------|----------------------------|--------|
| `app/orchestration/scheduler/orchestrator_helpers.py` | `log_listener` resolves `engine_id` once from `context.payload.get("engine_id")` (≈ L560-565) and calls `match_timing_marker(plugin_id or engine_id, line)` at **L595-596**; `parse_engine_progress(engine_id, line)` at **L767-769** | Resolve the **active group's** declared engine for marker + progress matching: use the engine of the currently-active render group (tracked by `active_seg_id`/`active_render_group_index`), falling back to the job engine-id only when no group is active. No engine-ID branching. |
| `app/api/routers/generation.py` | `_build_script_for_chapter` script entry built at **L208-219** — carries `text/speaker_wav/id/ids/save_path/weight` (+ optional `voice_profile_dir`) but **no `engine`** | Add `"engine": engine_id` to each `script_entry` (the group engine is already computed/available — see `group.get("engine")` used at **L199**). This is what lets the orchestrator resolve per-group markers without re-deriving from voice profiles. |
| `plugins/tts_mixed/handler.py` | per-group loop emits `[START_SEGMENT]` at **L352** and `[SEGMENT_SAVED]` at **L388**; per-group `engine = group["engine"]` at **L338**; bridge call at **L368** | (Preferred, robust) Emit an explicit **bracketed** per-group load-start marker (e.g. `[ENGINE_ACTIVITY_STARTED] {segment_id}`) immediately *before* the `_render_segment` bridge call, so detection never depends on matching child-engine stdout strings (handles warm-vs-cold worker, future engines). |
| `plugins/tts_mixed/manifest.json` | `behavior` block has `features` only, **no `timing_markers`** (whole file is 22 lines) | Add a `behavior.timing_markers.ENGINE_ACTIVITY_STARTED` that includes the bracketed marker the handler emits (e.g. `["[ENGINE_ACTIVITY_STARTED]"]`), so even the static-engine fallback path recognizes the handler-emitted load signal. Keep the other markers at default (handler already emits bracketed `[START_SEGMENT]`/`[SEGMENT_SAVED]`). |

### Anchor correction vs. proposal
`01-map.md` surface A states *"the group entry already carries `group["engine"]`"*. That is true of
the **chunk-group** dict from `build_chunk_groups` (`app/domain/chunk_groups.py:81`), but the
**orchestrator iterates `task.script`**, whose entries are built in
`generation.py:_build_script_for_chapter` (L208-219) and **do not include an `engine` key**. So the
script-entry propagation (row 2 above) is required for the "resolve from `group["engine"]`" plan to
work. Capture this in the spec changelog.

## Target shape / contract
- `log_listener` resolves the engine for marker/progress matching from the active group:
  - When a render group is active, look up its engine from the script entry
    (`script[active_render_group_index[0]].get("engine")`, or the entry whose `ids[0] == active_seg_id[0]`).
  - Fall back to the job engine-id (`context.payload["engine_id"]`) when no group is active (e.g. before
    the first `[START_SEGMENT]`), so single-engine renders are unchanged.
  - `match_timing_marker(active_engine, line)` and `parse_engine_progress(active_engine, line)` are
    keyed on that resolved engine. **No `if engine == "xtts"` branching** (INV-2) — resolution is
    generic via the manifest.
- For a mixed render reaching an XTTS group, `match_timing_marker(<active engine>, "Loading XTTS model...")`
  returns `"ENGINE_ACTIVITY_STARTED"`, so the existing branch at **L599-606** sets
  `timing["engine_activity_started_at"]`.
- The handler-emitted bracketed marker (preferred) is matched by the **mixed** manifest's
  `timing_markers` too, so detection is robust even if the active-engine lookup mis-resolves or the
  child engine's stdout string changes.
- Durable job `status` is untouched (INV-1) — this task only fixes *detection*, not status/phase.

## Steps (ordered)
1. **Write the failing test first** (see Tests). Confirm it is red on current code.
2. In `generation.py:_build_script_for_chapter`, add `"engine": engine_id` to `script_entry`
   (compute `engine_id = group.get("engine") or resolve_profile_engine(...)` once per group, as L199 already does).
3. In `orchestrator_helpers.py` `log_listener`, add a small local resolver that returns the active
   group's engine from `task.script` (by `active_render_group_index` / leader id), defaulting to the
   job engine-id. Use it for both `match_timing_marker` (L595-596) and `parse_engine_progress`
   (L767-769). Keep the existing per-line broadcast using the job engine-id for log attribution.
4. (Preferred) In `plugins/tts_mixed/handler.py`, emit `[ENGINE_ACTIVITY_STARTED] {segment_id}` just
   before the `_render_segment` call (L368), inside the per-group loop.
5. Add `behavior.timing_markers.ENGINE_ACTIVITY_STARTED: ["[ENGINE_ACTIVITY_STARTED]"]` to
   `plugins/tts_mixed/manifest.json`.
6. Revert-check (R1): stash the fix, run the test, confirm red, restore.
7. Update specs (W6 slice): `design-docs/specs/live-events.md` — note per-active-group marker resolution for
   mixed; bump `spec_version` + changelog row. Cross-check `.agent/rules/modular_architecture.md`
   (no engine-ID branching).

## Tests (TDD — write first)
- **Failing test (R1 revert-check)** — `tests/engines/test_engine_behavior.py` (or a new
  `tests/orchestration/test_mixed_marker_resolution.py`):
  - Assert that with current code `match_timing_marker("mixed", "Loading XTTS model...")` is `None`
    (documents the bug), and that after the fix the orchestrator's per-active-group resolver returns
    `"ENGINE_ACTIVITY_STARTED"` for the same line when the active group's engine is `"xtts"`.
  - Stronger behavioral test (preferred): drive `log_listener` for a mixed task whose `script` has an
    XTTS group, feed the `"Loading XTTS model..."` line, and assert `timing["engine_activity_started_at"]`
    becomes non-`None`. On current code this stays `None` → red.
- **R2 (mock boundaries only):** do not mock `app.engines.behavior` (the unit under test consumes it);
  mock only the watchdog/broadcast boundary (`broadcast_tts_log_line`) and DB writers (`update_job`)
  as needed. Build the task/`context` with a real `script` list.
- **R3:** not a frontend task — no socket frames here.
- **R4:** no sleep/timeouts; feed log lines synchronously into `log_listener`. Use explicit values, not
  wall-clock waits.
- **Regression guard:** a pure-XTTS render still resolves markers correctly (active-group engine ==
  job engine), and a Voxtral group does not spuriously match the XTTS load marker.
- Reuse fixtures from `plugins/tts_mixed/tests/test_mixed_handler.py` (mixed Job construction,
  `resolve_profile_engine` patching pattern) for an integration-flavored variant.
- **Commands:**
  `./venv/bin/python -m pytest tests/engines/test_engine_behavior.py tests/orchestration -q -k "marker or mixed"`
  ; `ruff check app/orchestration/scheduler/orchestrator_helpers.py app/api/routers/generation.py plugins/tts_mixed`

## Acceptance criteria
- [ ] In a mixed render with an XTTS group, the orchestrator captures `engine_activity_started_at`
      (and downstream `model_load_seconds`) from the XTTS load window.
- [ ] Each chapter script entry built by `_build_script_for_chapter` carries an `engine` key.
- [ ] Marker/progress resolution keys on the active group's declared engine; **no** engine-ID `if`
      branches added in core (INV-2).
- [ ] The mixed handler emits a bracketed per-group load marker AND the mixed manifest declares it,
      so detection is robust to warm-vs-cold workers (risk noted in `01-map.md`).
- [ ] Durable job `status` is unchanged by this task (INV-1).
- [ ] Pure-XTTS and Voxtral-only renders are unaffected (regression test green).
- [ ] Spec updated (`live-events.md`) with version bump + changelog row.

## Map links
- `01-map.md` surface **A** (marker/progress resolution — orchestrator + plugin manifest/handler);
  invariants **INV-2** (no engine-ID branching), **INV-5** (preserve existing signals), **INV-1**
  (monotonic status untouched here).

## Out of scope
- Duration/metrics capture and the sole-writer change → **task 002**.
- ETA suspension, null-clear, and the preparing phase → **task 003**.
- Any frontend work (preparing tier, relabel) → task 004 (W4).
- Mixed `ResourceClaim` (W5) — deferred.
