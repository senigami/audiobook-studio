# Task 006 — Render pipeline: skip Stage Direction, thread Performance Cue SSML

Status: pending

Risk: quality-sensitive (changes what gets sent to synthesis for every chapter render; a bug here either renders text that should never be spoken, or silently drops directives that should not have skipped the segment they were meant for)

## Goal

Teach the synthesis pipeline to:
1. **Never synthesize** a segment with `render = 0` (Stage Direction or Performance Cue) — it must not appear in any chunk sent to an engine, must not consume TTS time/cost, but the manuscript row itself is untouched (still displayed, still has `text_content`).
2. **Merge and forward** `engine_directives` from any Performance Cue segment(s) onto the next renderable segment that follows them in document order, but **only** to engines whose plugin manifest declares support for it — every other engine (today: all of them) must receive the render request exactly as before, with the directive payload silently dropped (INV-2).

This task depends on task 005's `render`/`engine_directives` columns existing on `chapter_segments` and round-tripping through `get_chapter_segments`/`load_chunk_segments`.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §5 (lines 153, 165, 176): Stage Direction text "is never rendered as audio and never passed to the TTS engine," and Performance Cue payloads "ship v1 as model + display; engine consumption is engine-dependent" with XTTS explicitly required to silently no-op. Without this task, task 005's fields are inert — nothing in the actual render path reads them, so painting a segment as Stage Direction today would (once 007/008 exist) look right in the UI but still get spoken aloud, which is the exact failure this task exists to prevent.

## Exact files

- `plugins/tts_mixed/handler.py` — `has_behavior` (lines 131–133, thin re-export of `app.engines.behavior.has_behavior`), `_render_segment` (244–276), `render_one_group` (329–440, esp. the call at line 413).
- `app/domain/chunk_groups.py` — `build_chunk_groups` (lines 47–94, esp. the empty-text skip at 57–59), `build_script_entry_for_group` (97–175).
- `app/engines/behavior.py` — `has_behavior` (lines 97–106, the actual implementation `plugins/tts_mixed/handler.py:131–133` re-exports).
- `app/orchestration/tasks/segment_synthesis.py` — the parallel/per-child render path that also consumes `build_script_entry_for_group`'s output (per that function's own docstring at `chunk_groups.py:104–115`, "the concurrent per-child synthetic-task path... reuse of `_dispatch_segment`" — locate the exact call site with `grep -n "build_script_entry_for_group\|_render_segment" app/orchestration/tasks/segment_synthesis.py app/orchestration/scheduler/orchestrator_helpers.py`).
- Plugin manifests (read-only reference, no change required by this task — see Target shape): `plugins/tts_xtts/manifest.json`, `plugins/tts_voxtral/manifest.json`, `plugins/tts_mixed/manifest.json` — each has a `behavior.features` list (e.g. `tts_xtts/manifest.json:27-37`).

## Current shape (verified)

- **`build_chunk_groups`** (`app/domain/chunk_groups.py:47–94`) is the single chokepoint that turns a chapter's ordered segment rows into render-ready "chunk groups" — consecutive segments with the same `character_id`/`profile_name`/resolved `engine` get concatenated into one group (up to `get_text_chunk_limit(engine)`), each group becoming one call to the engine. The only existing filter is `if not text: continue` at line 58–59 (empty text_content is skipped). There is **no** `render`/stage-direction awareness today — a Stage Direction segment with non-empty text would currently be grouped and spoken like any other line.
- **`has_behavior(engine_id, feature)`** (`app/engines/behavior.py:97–106`) checks membership in `behavior_for_engine(engine_id)["features"]` — a plain list already read from each plugin's `manifest.json` `behavior.features` array (e.g. `plugins/tts_xtts/manifest.json` lines 27–37 list `"script_synthesis"`, `"segment_rendering"`, etc.). This function is already fully generic — checking a brand-new feature string (e.g. `"ssml_directives"`) requires **zero code changes** to `has_behavior` itself; it will simply return `False` for every engine today because no manifest lists it yet.
- **`_render_segment`** (`plugins/tts_mixed/handler.py:244–276`) synthesizes exactly one chunk: resolves speaker settings via `extract_engine_settings(engine_id, spk)` (a **per-voice-profile** settings dict — temperature, top_k, etc. — pulled from the persisted speaker profile, not from any per-line/per-segment source) and calls `generate_via_bridge(engine=engine_id, text=text, ..., **settings)` (line 265–276). There is no existing parameter for per-call, per-line SSML directives — `extract_engine_settings`/`get_speaker_settings` are the wrong injection point (they're profile-scoped, not segment-scoped); a new explicit parameter is needed.
- **`render_one_group`** (`plugins/tts_mixed/handler.py:329–440`) is the actual caller of `_render_segment`, at line 413: `rc = _render_segment(engine, chunk_text, profile_name, seg_out, safe_mode, on_output, cancel_check, task_id=task_id)`. It operates on a `group: dict` built by `build_chunk_groups` (character_id, profile_name, engine, segments, text_parts, text_length) — this is the sequential (non-parallel) render path used by `handle_mixed_job`.
- **`build_script_entry_for_group`** (`chunk_groups.py:97–175`) builds a *different* shaped dict (`script_entry`: text, speaker_wav, id, ids, save_path, weight, engine, optional voice_profile_dir) consumed by the **parallel/per-child** render path (per its own docstring, reused by `app.orchestration.tasks.segment_synthesis`'s per-child dispatch). This is a second, structurally separate path to the same engine call — both need the same skip/merge treatment, independently, or the parallel-render path (used for the majority of real renders per the W-PAR work referenced elsewhere in this repo's history) will not respect Stage Direction/Performance Cue at all.
- **No PRAGMA/manifest currently declares any SSML-capable engine.** `plugins/tts_xtts/manifest.json`, `plugins/tts_voxtral/manifest.json`, and `plugins/tts_mixed/manifest.json`'s `behavior.features` lists (each ~lines 27–40) contain no SSML/prosody-related string today. Voxtral's actual capability list (`"capabilities": ["synthesis", "preview"]`, `plugins/tts_voxtral/manifest.json` line 15) does not claim SSML support either — there is no engine today that should have this gate turned on.

## Target shape

1. **Filter in `build_chunk_groups`** (`chunk_groups.py:56–92`): alongside the existing `if not text: continue` check, add a `render` check. A segment with `render == 0` (or falsy `render`) must never be added to any group — `continue` past it exactly like the empty-text case. Before skipping, if the segment also carries a non-null/non-empty `engine_directives`, merge its keys into a running accumulator local to the loop (last-value-wins per key: `pending_directives.update(decoded_directives)`); if it carries no `engine_directives` (a plain Stage Direction), skip without touching the accumulator. This exactly matches the design doc's "skipping any Stage Direction or other Performance Cue spans between them" merge rule (§5 line 165).
2. **Isolate cue-carrying groups.** When a renderable segment is reached and `pending_directives` is non-empty, that segment's group must be **its own group** — do not let it merge into an adjacent same-character/profile/engine run (the existing `last_group` merge-continuation check at lines 71–81). Attach `pending_directives` to this new group as `group["engine_directives"]`, then reset `pending_directives = {}` immediately (a cue applies to exactly the first renderable segment following it, never to segments after that one). **Why isolate:** SSML rate/pitch/volume apply to the whole synthesized utterance; if a cued segment were merged into a larger chunk with unrelated following text, the directive would incorrectly color that unrelated text too. This is a deliberate design decision for this task, not an oversight — do not "optimize" it away by allowing the cued segment to merge with neighbors.
3. **Thread `engine_directives` through both render paths, gated by a new manifest feature string `"ssml_directives"`:**
   - `render_one_group` (`handler.py:329–440`): read `group.get("engine_directives")`; if truthy AND `has_behavior(engine, "ssml_directives")` is true, pass it through to `_render_segment` as a new parameter (e.g. `_render_segment(engine, chunk_text, profile_name, seg_out, safe_mode, on_output, cancel_check, task_id=task_id, engine_directives=group.get("engine_directives"))`); otherwise pass nothing extra (or explicitly `None`) — the engine adapter must never receive the kwarg at all when the capability flag is absent, not receive-and-ignore it, so a future engine that doesn't expect the kwarg can never break on it.
   - `_render_segment` (`handler.py:244–276`): add an `engine_directives: dict | None = None` parameter; inside, only merge it into the `generate_via_bridge(...)` kwargs when both `engine_directives` is truthy and `has_behavior(engine_id, "ssml_directives")` is true (check inside this function too, not just at the caller, so any other caller of `_render_segment` gets the same safety).
   - `build_script_entry_for_group` (`chunk_groups.py:97–175`): add `if group.get("engine_directives"): script_entry["engine_directives"] = group["engine_directives"]` near the end of the function (only set the key when non-empty, so the parallel path's existing consumers that don't expect this key see no shape change for ordinary segments).
   - Trace the parallel path's consumer of `script_entry` (`app/orchestration/tasks/segment_synthesis.py` — locate via `grep -n "build_script_entry_for_group\|script_entry\[" app/orchestration/tasks/segment_synthesis.py app/orchestration/scheduler/*.py`) and thread `engine_directives` through to whatever function there ultimately calls the engine bridge, applying the identical `has_behavior(engine_id, "ssml_directives")` gate. If that path calls `_render_segment`/`generate_via_bridge` directly, reuse the same gate; if it calls a different bridge helper, add the identical truthy-and-capable check there.
4. **Do not flip the feature flag on for any real engine in this task.** No manifest (`tts_xtts`, `tts_voxtral`, `tts_mixed`) gets `"ssml_directives"` added to its `behavior.features` list — none of them actually consumes SSML today (Voxtral's real capability list does not claim it either). This task ships the *gate* and the *skip/merge* logic as correct, tested infrastructure; turning it on for a real engine is a separate future change once an engine plugin actually implements consumption. Verify the gate/threading logic using either a test-only fake manifest/engine fixture, or by monkeypatching `has_behavior` in a unit test to return `True` for a synthetic engine id and asserting the kwarg reaches `generate_via_bridge`.

## Steps

1. Add the `render == 0` skip + `engine_directives` merge-accumulator logic to `build_chunk_groups` (`chunk_groups.py:56–92`), including the "isolate cue-carrying groups" rule.
2. Add `if group.get("engine_directives"): script_entry["engine_directives"] = group["engine_directives"]` to `build_script_entry_for_group` (`chunk_groups.py:97–175`).
3. Add the `engine_directives` parameter to `_render_segment` and thread it from `render_one_group`'s call site (`handler.py:244–276,413`), gated by `has_behavior(engine_id, "ssml_directives")` at both the caller and callee.
4. Run `grep -n "build_script_entry_for_group\|_render_segment(" app/orchestration/tasks/segment_synthesis.py app/orchestration/scheduler/orchestrator_helpers.py` to find the parallel-render path's engine-call site; thread `engine_directives` through it the same way, with the same capability gate.
5. Write backend tests (see Acceptance criteria) that: (a) confirm a `render=0` segment's text never appears in any chunk group's `text_parts`/`weight`/character count and is never dispatched to `generate_via_bridge`; (b) confirm a Performance Cue segment's `engine_directives` reach the target segment's group when a synthetic test engine declares `"ssml_directives"` (via manifest fixture or `has_behavior` monkeypatch), and do **not** reach `generate_via_bridge`'s kwargs when the engine does not declare it (using the real `tts_xtts`/`tts_mixed` manifests, unmodified); (c) confirm a cue with no following renderable segment (e.g. end of chapter) does not crash and its directives are simply dropped, per the design doc ("A cue with no following renderable segment displays correctly but its payload is never consumed").
6. Run `./venv/bin/python -m pytest -q` and confirm zero regressions in existing chunk-grouping/mixed-handler/orchestration tests (INV-5 — no capability regression for the base paint-assignment/render flow).
7. Bump the relevant spec (check `design-docs/specs/README.md` for whichever doc covers the render/synthesis pipeline or plugin manifest contract) with a changelog row describing the new `render`-flag skip behavior and the `ssml_directives` manifest feature-flag convention.

## Acceptance criteria

- [ ] A segment with `render = 0` never appears in any `build_chunk_groups` output group, in either render path (sequential `handle_mixed_job` and the parallel/per-child path), verified by a test asserting its `text_content` is absent from every group's `text_parts`.
- [ ] A `render = 0` segment's own DB row is untouched otherwise — `audio_status` stays whatever it was (never flips to `processing`/`done`), verified by a test.
- [ ] A Performance Cue segment's `engine_directives` merge (last-value-wins per key, descriptions/free-text fields simply overwritten per key like everything else since concatenation is a display-only concern owned by task 008, not this task) onto the next renderable segment's group, skipping any intervening Stage Direction/Performance Cue segments, verified by a test with 2+ consecutive cues before one renderable line.
- [ ] The cue-carrying group never merges with an adjacent same-character/profile/engine group (isolation rule), verified by a test.
- [ ] `has_behavior(engine_id, "ssml_directives")` gates whether `generate_via_bridge` ever receives an `engine_directives`/`ssml_directives` kwarg — false for all real engines today (no manifest changed), true only for a synthetic test fixture, verified by a test asserting the real `tts_xtts` manifest path never receives the kwarg even when a preceding cue exists (INV-2).
- [ ] No manifest JSON file is changed by this task (`plugins/tts_xtts/manifest.json`, `plugins/tts_voxtral/manifest.json`, `plugins/tts_mixed/manifest.json` all diff-clean).
- [ ] `./venv/bin/python -m pytest -q` passes with no regressions.
- [ ] Relevant spec doc bumped with a changelog row.

## Map links

Part E (render-pipeline half) in `01-map.md`. Invariant INV-2 (XTTS/all non-capable engines silently no-op). Invariant INV-5 (no capability regression on the base render flow). Risk R-A.

## Dependencies

Task 005 (needs `chapter_segments.render`/`engine_directives` columns and their round-trip through `get_chapter_segments`/`load_chunk_segments` to exist first).

## Out of scope

- Turning on real SSML consumption for any actual engine (Voxtral or otherwise) — no manifest is edited by this task.
- The gutter glyph rendering (task 007) and Cue Editor UI (task 008) — this task is backend-only.
- The human-readable display-string merge/format logic (`[slowly · low | voice catches]`) — that is task 008's concern; this task's merge is purely the engine-payload merge (last-value-wins per SSML key), not the display string.
- Any change to `app/engines/behavior.py`'s `has_behavior`/`behavior_for_engine` implementation — it is already fully generic and needs no code change, only a new feature-string convention used by callers.
