# Phase 5 — Plugin consolidation (lift duplication into the SDK)

> Map: [00_overview.md](00_overview.md). The three TTS plugins (`tts_xtts`, `tts_voxtral`,
> `tts_mixed`) copy-paste a lot of structural boilerplate that belongs in the shared SDK
> (`app/studio_plugin_sdk/`, `app/engines/voice/base.py`). Lifting it shrinks every plugin and makes
> the next engine cheap to add — **without** introducing engine-ID branches in core
> (`modular_architecture.md`). Each task keeps plugin behavior identical; run `plugins/*/tests` +
> the app suite per task.

> **Guardrail:** the consolidation target is the *SDK contract*, shared by all engines. Do not add
> `if engine == "xtts"` logic to core — parameterize (pass `engine_id`, asset lists, formulas) so
> the shared code stays engine-agnostic.

---

## PL-1 — One SDK context factory (kills 9 copies of `_get_ctx()`)

**Why:** an identical ~13-line lazy-singleton block (`_ctx_instance = None`; `_get_ctx()` with a
`global`; a `try/except` dual-import of `StudioPluginContext` from `studio_plugin_sdk` vs
`app.studio_plugin_sdk`) is duplicated in **9 modules** (xtts: `studio/bake.py`, `segments.py`,
`handler.py`, `voice_adapter.py`, `standard_handler.py`; voxtral: `studio/bake.py`, `segments.py`,
`handler.py`; mixed: `handler.py`). Only the engine-id string differs.

**Steps:**
- Resolve the dual-import once inside `app/studio_plugin_sdk/__init__.py` (or a `plugin_utils.py`).
- Expose a `get_plugin_ctx(engine_id) -> StudioPluginContext` factory there.
- Replace all 9 per-module singletons with a call to that factory; delete the module globals.

**Verify:** `plugins/*/tests` + app suite green. **Effort:** M · **Risk:** low. **Spec:**
`plugin-contract.md` if it documents context acquisition — add the factory to the SDK surface.

---

## PL-2 — Shared segment-marker output handler (kills 4 copies) + `_group_needs_render`

**Why:** four `on_output` closures parse the same `[SEGMENT_SAVED]`/`[START_SEGMENT]`/`[PROGRESS]`
markers with the same I17 cancel-guard (comment duplicated verbatim): xtts `studio/bake.py:160`,
voxtral `studio/bake.py:167`, xtts `studio/segments.py:130`, voxtral `studio/segments.py:127`. Only
the progress formula (linear vs weighted) differs. `_group_needs_render` is defined 3× (xtts
`bake.py:105` inline, voxtral `bake.py:90`, mixed `handler.py:238`) with near-identical logic.

**Steps:**
- Add a factory to the SDK:
  `make_segment_output_handler(*, on_output, cancel_check, path_to_group, update_seg, completed_groups, total_groups, update_job_fn, jid, progress_formula)`
  returning the closure. Plugins pass their own `progress_formula`.
- Add `StudioPluginContext.group_needs_render(segment)` (all three check the same segment-dict shape;
  this is validated-artifact-metadata logic, not file existence — keep it that way per
  `modular_architecture.md`). Replace the 3 local defs.

**Verify:** the marker-parsing + cancel-guard behavior is load-bearing (I17 lost-update guard,
warm-worker marker handling) — **revert-check** against the existing cancel/marker tests; confirm
each plugin's progress curve is unchanged (linear stays linear, weighted stays weighted).
**Effort:** M · **Risk:** med (touches the progress/cancel hot path). **Spec:**
`progress-presentation.md` / `queue-jobs.md` invariants (I17) must be preserved — verify, no change.

---

## PL-3 — Move app-adapter helpers + `run_test` boilerplate into `BaseVoiceEngine`

**Why:** `XttsVoiceEngine` (`studio/app_adapter.py:420-458`) and `VoxtralVoiceEngine`
(`studio/app_adapter.py:396-436`) each define four functionally-identical privates
(`_normalize_output_format`, `_resolve_output_path`, `_resolve_on_output`, `_resolve_cancel_check`),
an identical `_load_settings_schema()`, and byte-identical `INTENDED_*`/`FORBIDDEN_*` constants
(the latter handled by BE-2). `run_test()` in both `server/engine.py` files shares ~30 lines of
asset-resolution + synth-test boilerplate, differing only in candidate asset names and default text.

**Steps:**
- Move `_resolve_output_path`, `_resolve_on_output`, `_resolve_cancel_check` into
  `app/engines/voice/base.py` (`BaseVoiceEngine`) as concrete helpers.
- Move `_normalize_output_format` there as a classmethod taking an `engine_name` for error strings.
- Move `_load_settings_schema` into a `plugin_utils` function.
- Add a default `run_test(self, *, asset_search_order, default_text)` to the engine base; each
  plugin's `run_test` becomes a one-liner calling `super().run_test(asset_search_order=[...], ...)`.

**Verify:** `plugins/*/tests` (engine verification tests) green; error messages still name the right
engine. **Effort:** M · **Risk:** low. **Spec:** `plugin-contract.md` — `run_test`/request-adapter
helpers now part of the base contract; bump if it enumerates engine responsibilities.

---

## PL-4 — Extract the shared XTTS synthesis loop

**Why:** `plugins/tts_xtts/plugin/core/xtts_inference.py` implements the same synthesis loop twice —
`_run_serve_job()` (190-482, ~293 lines) and `main()` (485-834, ~350 lines): sentence splitting,
pause insertion (`SENTENCE_PAUSE_MS=180`, `PARAGRAPH_PAUSE_MS=650`, `PAUSE_CHAR_MS=400`), per-segment
marker emission, `_synthesize_one()` fallback. `_normalize_speaker_wav_paths()` is defined twice
(243, 549) with identical bodies.

**Steps:**
- Hoist `_normalize_speaker_wav_paths()` to module level (one definition).
- Extract `_run_synthesis_loop(script, tts, xtts_model, device, *, language, speed, temperature, repetition_penalty, task_id, out_path, on_emit)`; call it from both `_run_serve_job()` and `main()`.
- Keep the genuine differences as params (serve's inline md5 staleness vs main's
  `_profile_fingerprint()` → pass a `staleness_check` callable, or compute upstream).

**Verify:** this is the synthesis hot path — **revert-check** against the xtts timing/synthesis
tests; confirm warm-worker (serve) and one-shot (`main`) paths produce identical audio + markers.
Pay attention to the warm-worker stderr/marker handling that was recently fixed (commit `8b9ae90a`).
**Effort:** M · **Risk:** med-high (audio output correctness) — do it alone, test hard. **Spec:**
none (internal to the plugin).

---

## PL-5 — Remove unimplemented ABC stubs

**Why:** `validate_environment` and `build_voice_asset` raise `NotImplementedError` in both
`XttsVoiceEngine` (`app_adapter.py:187-189, 415-418`) and `VoxtralVoiceEngine`
(`app_adapter.py:156-158, 377-379`), with no callers.

**Steps:** check `BaseVoiceEngine` — if these are **not** `@abstractmethod`, delete the four stubs.
If they **are** abstract, give them inert default bodies in the base (or drop them from the ABC if
the voice-asset-build feature is genuinely future) and document the intent. Don't leave
caller-less `raise NotImplementedError` lying around.
**Verify:** `plugins/*/tests` + app suite green. **Effort:** S · **Risk:** low. **Spec:**
`plugin-contract.md` if it lists these as required methods.

---

## PL-6 — Investigate the legacy xtts dispatch adapter (verify-then-decide)

**⚠️ NOT a confirmed deletion.** The audit suggested `plugins/tts_xtts/plugin/studio/adapter.py`
(`xtts_dispatch_adapter`) + `voice_adapter.py` (`voice_job_dispatch_adapter`) are dead because
`app/orchestration/tasks/synthesis.py` routes xtts via `VoiceBridge` (`to_bridge_request`), not the
jobs registry. **Verification showed it is still wired:** `manifest.json:18` maps
`engine_handlers["xtts"]` → `interface:xtts_dispatch_adapter`, and `interface.py:12,19` imports/exports
it. `app/` has zero *direct* calls, but the registry handler path exists; only
`tests/engines/test_xtts_timing.py` exercises it directly.

**Task = prove the path is dead before removing anything:**
1. Trace every job-submission site: does anything submit an `engine="xtts"` job through the registry
   (`reg.get_handler` / `app.jobs`) rather than through `SynthesisTask`/`VoiceBridge`? Grep the
   orchestrator dispatch (`scheduler/orchestrator_helpers.py` `_dispatch`) for the registry-handler
   branch and confirm xtts never reaches it in production.
2. Check whether the manifest `engine_handlers` entry is *required* for plugin load/validation even
   if unused at runtime (`plugin_loader.py` / `plugin-contract.md`).

**If proven dead:** delete `adapter.py` + `voice_adapter.py`, remove from `interface.py __all__`,
remove the `engine_handlers["xtts"]` manifest entry, and rewrite `test_xtts_timing.py` to test
through the bridge path. **If not dead (or load-bearing for the manifest contract):** leave it,
document why in a code comment, and close the finding.

**Verify:** full suite incl. plugin suites; if removed, confirm xtts still synthesizes end-to-end
through the bridge. **Effort:** M · **Risk:** med. **Spec:** `plugin-contract.md` /
`engines-and-plugins.md` if the manifest `engine_handlers` contract changes.

---

### Phase 5 done-check
`plugins/*/tests` + full `pytest -q` green. Each plugin smaller; shared logic lives in the SDK with
no engine-ID branches in core. PL-6 resolved one way or the other with a recorded rationale. Specs
(`plugin-contract.md`) updated for the new SDK surface. Dated `wiki/Changelog.md` entry.
