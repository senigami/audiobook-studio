# Task 004 — SSML/directive-capability manifest field: confirm & extend the sibling plan's mechanism

Status: pending

Risk: quality-sensitive (new plugin-SDK contract surface; per this repo's binding directive every
contract/manifest/schema declares an explicit version validated at load time, so any manifest-shape
addition needs the same rigor as any other SDK change — and a duplicated or diverging
capability-flag mechanism between this plan and the sibling `chapter_editor_catalog_completion`
plan would silently fragment what "an engine can consume performance directives" means)

## Goal

This task is **not** a green-field design of a capability-flag mechanism. Its job is to:

1. Confirm that the sibling `chapter_editor_catalog_completion` plan's task 006
   (`tasks/006-stage-direction-render-pipeline.md`) already fully specifies the render-pipeline
   capability gate this plan also needs, and adopt its exact mechanism verbatim rather than invent
   a second one.
2. Extend the **same** plugin-manifest `behavior` block — never a parallel structure — with the
   additional, narrower set of fields this plan's export layer (task 011, five exporters: SSML,
   Polly, Azure, ElevenLabs, Google) needs that task 006's mechanism does not cover, per
   `proposals/performance_script_model/04-export-targets.md`'s "Engine Capability Declaration"
   section.
3. Resolve `01-map.md`'s R-C open question (does this new plugin-contract surface need a manifest
   version bump per this repo's binding versioned-contracts directive) with a concrete answer,
   grounded in how `app/tts_server/plugin_loader.py` actually validates manifests today — not left
   open for whoever implements this.
4. Record which task is authoritative for the shared mechanism, and land a one-line cross-reference
   note in both task files once either executes.

## Why this matters

`01-map.md`'s Connections section is explicit: *"F is shared plumbing with the sibling
`chapter_editor_catalog_completion` plan's task 006 ... Do not build two separate capability-flag
mechanisms — whichever plan lands first should define F once, and the other should consume it."*
Building a second, incompatible mechanism here would mean the same manifest declares engine
capability twice, in two different vocabularies, and this plan's and the sibling plan's render code
would silently disagree about what "this engine can consume SSML-ish directives" means for the same
plugin.

## Sibling task's mechanism (read in full, cited exactly)

`chapter_editor_catalog_completion/tasks/006-stage-direction-render-pipeline.md` (status: pending,
not yet executed as of 2026-07-10) specifies — this is the exact mechanism to reuse, not a summary
to reinterpret:

- A new manifest **feature string** `"ssml_directives"`, checked via
  **`has_behavior(engine_id, "ssml_directives")`** (`app/engines/behavior.py:97-106`), gating whether
  a per-segment `engine_directives` dict is threaded into a live synthesis call.
- `has_behavior` and its backing `normalize_behavior`/`behavior_for_engine`
  (`app/engines/behavior.py:43-94`, `164-172`) are **already fully generic** — membership in a
  `behavior.features` list read straight from each plugin's `manifest.json`. Task 006's own analysis
  states this requires **zero code changes** to `has_behavior` itself; only a new string convention
  used by callers.
- Task 006 gates this at two call sites: the sequential render path
  (`plugins/tts_mixed/handler.py`'s `_render_segment`/`render_one_group`) and the parallel/per-child
  path (`app/domain/chunk_groups.py`'s `build_script_entry_for_group` plus whatever consumes it in
  `app/orchestration/tasks/segment_synthesis.py`).
- Task 006 **explicitly does not** add `"ssml_directives"` to any real plugin's `manifest.json`
  (`tts_xtts`, `tts_voxtral`, `tts_mixed`) — none of them consume it today. It ships the gate/skip/
  merge logic as tested infrastructure only, verified with a synthetic engine fixture or a
  monkeypatched `has_behavior`.

**Verified independently in this session** (not just taking the task file's word for it): read
`app/engines/behavior.py` in full — `has_behavior` (97-106) is exactly as described, and
`normalize_behavior` (43-94) treats `behavior.features` as a free-form list of strings with no
enum/allow-list restricting which strings are legal. Adding `"ssml_directives"` to a manifest's
`features` array is mechanically identical to how `"segment_orchestration"` and `"cps_eta"` were
added to `plugins/tts_xtts/manifest.json:27-38` at some point in this repo's history — an ordinary
vocabulary addition to an already-open list, not a new code path.

## What task 006's mechanism does *not* cover (this task's actual incremental work)

Task 006's `"ssml_directives"` flag answers one narrow, boolean question: *"can this in-process
render-time engine (xtts, voxtral, mixed — the only engines that exist today) accept an
`engine_directives` dict during a live synthesis call at all?"*

`proposals/performance_script_model/04-export-targets.md:105-125` ("Engine Capability Declaration")
asks a different, richer question at a different layer: *"for an export TARGET (a generated W3C
SSML document, Amazon Polly SSML, Azure Cognitive Services SSML, ElevenLabs plain-text+API-settings,
Google Cloud TTS SSML), which SSML dialect and which specific sub-capabilities does it support?"*
The proposal doc's own suggested manifest shape is:

```json
{
  "behavior": {
    "export_format": "ssml_w3c" | "ssml_azure" | "elevenlabs_text" | "ssml_polly" | "plain_text",
    "supports_per_span_voice": true,
    "supports_emotion_style": true,
    "supports_prosody": true,
    "supports_break": true
  }
}
```
and the doc says plainly: *"This is not yet defined in the plugin contract — adding it is a task for
this plan's implementation phase."* That sentence is this task's actual scope. A single boolean
membership flag cannot carry an `export_format` enum or four independent sub-capability booleans —
these need genuinely different fields, not a repurposing of `"ssml_directives"`. Confirmed no plugin
declares any of these fields today: `grep -rl "polly\|azure\|elevenlabs\|google"
plugins/*/manifest.json` returns nothing, and no `plugins/tts_polly`/`tts_azure`/`tts_elevenlabs`/
`tts_google` folder exists — these export targets are not Studio TTS Server plugins today at all
(task 011's exporters will be new application code reading these fields wherever they end up
declared, not existing engine plugins being extended).

## Exact files (verified)

- `app/engines/behavior.py:97-106` — `has_behavior()`. Generic; zero changes needed.
- `app/engines/behavior.py:43-94` — `normalize_behavior()`. `features` is a free-form `list[str]`,
  no restriction on legal values.
- `app/engines/behavior.py:164-172` — `behavior_for_engine()`. Resolves + caches manifest behavior.
- `plugins/tts_xtts/manifest.json:26-60` — the full `behavior` block as it exists today: `features`
  (10 strings, none SSML-related), `required_settings`, `setting_aliases`, `synthesis_settings`,
  `max_concurrent_workers`, `text_chunk_limit`, `text_split_target`, `sanitize_categories`,
  `progress_pattern`, `timing_markers`. `plugins/tts_voxtral/manifest.json` and
  `plugins/tts_mixed/manifest.json` follow the same shape (read-only reference, not touched by this
  task).
- `app/tts_server/plugin_loader.py:60-65` — `_SUPPORTED_VERSION_FIELDS` (`contract_version`,
  `sdk_version`, `settings_schema_version`, `event_envelope_version`, each hard-pinned to the single
  allowed value `{"1.0"}`) and `:72` — `SUPPORTED_MANIFEST_VERSION = "1.0"` (the `studio_tts_manifest`
  field's only accepted value).
- `app/tts_server/plugin_loader.py:543-650` — `_validate_manifest()`. Required-field check (553-558,
  does **not** include anything under `behavior`), manifest-version hard-equality check (560-566),
  the four version-field hard-equality checks (614-633), and the only `behavior.*` sub-field
  validation that exists today — `behavior.max_concurrent_workers`'s type, starting line 635. Nothing
  validates `behavior.features`'s contents or any other optional `behavior` sub-field's presence.
- `design-docs/plans/active/chapter_editor_catalog_completion/tasks/006-stage-direction-render-pipeline.md`
  — the sibling task specifying the mechanism this task reuses (read in full above).
- `design-docs/plans/proposals/performance_script_model/04-export-targets.md:105-125` — the export
  capability declaration this task's incremental work is scoped to.

## Version-bump decision (resolves R-C)

**Decision: no manifest version bump for either the `"ssml_directives"` feature string or the new
`export_format`/`supports_*` fields.**

Rationale, grounded in the actual validation code (`app/tts_server/plugin_loader.py:543-650`), not
assumption:

- The manifest's version fields (`studio_tts_manifest`, `contract_version`, `sdk_version`,
  `settings_schema_version`, `event_envelope_version`) each gate the **structural wire contract** —
  required top-level fields, callable-string formats, engine/kind handler dispatch shape. Every one
  of them is validated by hard equality against a single supported value (`"1.0"`); declaring any
  other value today raises `PluginLoadError` for every plugin. Bumping any of them would be a
  deliberate, coordinated, repo-wide change (updating `_SUPPORTED_VERSION_FIELDS`/
  `SUPPORTED_MANIFEST_VERSION` and every existing plugin's manifest in lockstep) — far bigger than
  adding an optional capability field, and not warranted by this addition.
- `behavior.features` and the other `behavior` sub-fields (`sanitize_categories`, `timing_markers`,
  `max_concurrent_workers`) are **not** part of that gated set. They are free-form, additive,
  optional, and read with safe defaults when absent (`normalize_behavior`'s empty-list/None
  fallbacks). This is exactly the shape of change this task makes: a new optional string in an
  already-open list (`"ssml_directives"`), and new optional sub-fields under the same `behavior`
  object (`export_format`, `supports_per_span_voice`, `supports_emotion_style`, `supports_prosody`,
  `supports_break`) that default to absent/false when a plugin doesn't declare them.
- This repo's binding directive ("every contract/manifest/schema declares an explicit version
  validated at load time") is satisfied by the manifest **already having** an explicit,
  load-time-validated version (`studio_tts_manifest: "1.0"`, `contract_version: "1.0"`) — it does not
  require re-bumping that version every time an optional, backward-compatible vocabulary entry is
  added to an already-versioned schema, any more than every prior `behavior.features` addition
  (`segment_orchestration`, `cps_eta`, etc.) triggered a version bump. No plugin that omits these new
  fields breaks; no existing plugin's behavior changes.
- **If** a future need arises to make any of these fields *required* (not opt-in), or to change what
  an existing field means, that would be the point to bump `contract_version` to `"1.1"` and update
  `_SUPPORTED_VERSION_FIELDS` — flag that explicitly if it comes up, but it is out of scope here.

This directly resolves `01-map.md`'s R-C, which flagged the question as open but did not verify it
against the loader's actual code — the verification in this task file supersedes that open question.

## Target shape

1. **Render-pipeline gate (Part F, shared with sibling task 006):** adopt
   `has_behavior(engine_id, "ssml_directives")` verbatim wherever this plan's own code needs to ask
   "can the live render path forward `performance_data` to this engine" (e.g. Part C's performance
   annotation pass, task 007, if it ever needs to check this at generation time). Do **not** invent
   a second feature string or a second gating function for this question.
2. **Export-layer capability fields (this task's actual new ground, consumed by task 011/010):** add,
   as optional additive sub-fields of the existing `behavior` manifest block —
   - `export_format`: one of `"ssml_w3c" | "ssml_azure" | "elevenlabs_text" | "ssml_polly" |
     "plain_text"` (string, optional; absent = no export capability declared for this engine).
   - `supports_per_span_voice`, `supports_emotion_style`, `supports_prosody`, `supports_break`:
     booleans, optional, default `false` when absent.
   These live alongside `sanitize_categories`/`timing_markers` in the same `behavior` object —
   structurally the same kind of value-carrying optional field, not a boolean-membership list entry,
   because `export_format` needs a value and the four `supports_*` flags are per-attribute (not a
   single yes/no).
3. **No code changes to `has_behavior`, `normalize_behavior`, or `_validate_manifest`'s required-field
   checks.** If a reader helper is added for the new export fields (e.g. `export_capabilities_for
   (engine_id)` mirroring `behavior_for_engine`'s pattern), it belongs in `app/engines/behavior.py`
   alongside the existing helpers — not a new module, not a parallel capability-resolution path.
4. **No manifest version bump** — see decision above.
5. **Cross-reference note:** whichever of {sibling task 006, this task} executes first in real
   wall-clock order gets a one-line note added to the *other* task's file once it lands, pointing at
   the landed mechanism (e.g. "see chapter_editor_catalog_completion/tasks/006 for the render-pipeline
   `ssml_directives` gate this task reuses" / "see performance_script_model_execution/tasks/004 for
   the export-layer capability fields built on top of this task's flag"). Per this plan's `01-map.md`:
   *"whichever plan lands first should define F once, and the other should consume it."* Today
   (2026-07-10) neither has executed; this task file and 006's task file already cross-reference each
   other, so the only remaining action is updating whichever lands second once execution actually
   happens.

## Steps

1. Before writing anything: check whether `chapter_editor_catalog_completion/tasks/006` has already
   landed. If yes, read its actual diff (not this task file's description of it) to confirm the
   `"ssml_directives"` feature string and gate placement match what's documented above; if the
   shipped implementation diverged, treat the shipped code as ground truth and update this task's
   plan to match it, not the other way around.
2. If task 006 has **not** yet landed: do not implement the render-pipeline gate here — that remains
   entirely 006's scope. This task proceeds only with step 3 below (export-layer fields), and defers
   consuming the render-time flag until 006 exists.
3. Add the `export_format`/`supports_per_span_voice`/`supports_emotion_style`/`supports_prosody`/
   `supports_break` fields to the documented `behavior` manifest shape. Update whichever spec doc
   covers the plugin manifest contract (check `design-docs/specs/README.md`'s router index for the
   right doc) with a changelog row: new optional export-capability fields, their types/defaults, and
   that they are consumed only by this plan's task 011 exporters — not by the render pipeline.
4. Do **not** add any of these fields to a real plugin's `manifest.json`
   (`plugins/tts_xtts`, `plugins/tts_voxtral`, `plugins/tts_mixed`) in this task — no engine
   implements a cloud SSML export path today. If a reader helper is written, verify it with a
   synthetic/fixture manifest, not a real one, mirroring task 006's own verification approach.
5. Add the one-line cross-reference note (see Target shape point 5) to whichever of the two task
   files can already be edited at the time this task executes.
6. Leave a forward note for this plan's task 011 (exporters, not yet written as a task file at the
   time of this task) to consume these two fields (the reused `ssml_directives` flag for
   render-time gating, and the new `export_format`/`supports_*` fields for export-target capability
   detection) — do not write task 011 itself here.

## Acceptance criteria

- [ ] No second `has_behavior`-style mechanism or second feature-string convention is introduced for
      the render-time "can this engine consume directives" question — `has_behavior(engine_id,
      "ssml_directives")` from sibling task 006 is reused verbatim.
- [ ] The export-layer's additional fields (`export_format`, `supports_per_span_voice`,
      `supports_emotion_style`, `supports_prosody`, `supports_break`) are added as optional, additive
      sub-fields of the existing `behavior` manifest block — no new top-level manifest section, no
      new manifest version.
- [ ] No real plugin manifest (`plugins/tts_xtts`, `plugins/tts_voxtral`, `plugins/tts_mixed`) is
      changed by this task.
- [ ] No manifest version field (`studio_tts_manifest`, `contract_version`, `sdk_version`,
      `settings_schema_version`, `event_envelope_version`) is bumped by this task.
- [ ] The plugin-manifest spec doc is updated with a changelog row documenting both: the reused
      `ssml_directives` feature-string convention (cross-referenced to sibling task 006, not
      redefined) and the new optional export-capability fields this task adds.
- [ ] A cross-reference note exists in both this task's file and
      `chapter_editor_catalog_completion/tasks/006-stage-direction-render-pipeline.md` once either
      has executed, pointing at the other.
- [ ] `./venv/bin/python -m pytest -q` passes with no regressions (relevant if any reader-helper code
      is added for the new export fields).

## Map links

Part F in `01-map.md`. Invariant INV-5 ("one shared capability-flag mechanism, not two"). Invariant
INV-4 (engines lacking a declared capability silently no-op, mirrored from the sibling plan's INV-2).
Risk R-C (version-bump question — resolved above, not left open).

## Dependencies

Roadmap (`02-roadmap.md`) lists `depends: 001` for this task, reflecting workload sequencing — in
practice this task's actual work (manifest/behavior-block fields) reads and writes no DB column, so
it has no technical data dependency on task 001. The real gating dependency is
`chapter_editor_catalog_completion`'s task 006: this task must read its landed shape (or, if not yet
landed, its current task-file spec) before adding anything, so the export-layer fields build on top
of the same mechanism rather than a guessed one. Task 011 (five exporters) depends on this task per
`02-roadmap.md`'s dependency graph (`004 ──► 011`, alongside `010 ──► 011`).

## Out of scope

- Implementing the render-pipeline gate itself (the `render == 0` skip/merge logic in
  `build_chunk_groups`, threading `engine_directives` through `_render_segment`/
  `build_script_entry_for_group`/the parallel path) — entirely sibling task 006's scope; do not
  duplicate any part of it here.
- Building the five actual exporters (task 011) or the capability-matrix/degradation-rules engine
  (task 010) — this task only prepares the manifest field shape those tasks will read.
- Declaring any export-capability field for a real engine's manifest — no engine plugin implements a
  cloud SSML export path today; this task ships the schema/reader plumbing only, same posture as
  task 006 shipping the gate without flipping it on for a real engine.
- Deciding whether this plan's AI-extraction pipeline (Part C) proceeds at all — gated separately by
  R-B, see `02-roadmap.md`'s "Gate before Workload 4."
- Reconciling the `performance_data`/`engine_directives` DB column overlap between this plan and the
  sibling plan (R-A) — that is task 000's job, not this one's.
