# Task 004 — SSML/directive-capability manifest field: confirm & extend the sibling plan's mechanism

Status: done (2026-07-16, W-PERF safe-foundation PR)

Risk: quality-sensitive (new plugin-SDK contract surface, shared with a sibling plan)

## What shipped

Added the **export-layer** capability fields only — optional, additive sub-fields of the existing
manifest `behavior` block, validated (type/enum-checked when present, absent is fine) in
`app/tts_server/plugin_loader.py`:

- `export_format`: one of `ssml_w3c` / `ssml_azure` / `elevenlabs_text` / `ssml_polly` / `plain_text`
- `supports_per_span_voice`, `supports_emotion_style`, `supports_prosody`, `supports_break` (booleans,
  default `false`)

Consumed via a new `app.engines.behavior.export_capabilities_for()` helper. **No manifest version
bump** — resolved `01-map.md`'s R-C: these fields are the same class of change as prior
`behavior.features` additions (`segment_orchestration`, `cps_eta`), not part of the hard-pinned
version-gated wire contract (`studio_tts_manifest`/`contract_version`/etc.). No real plugin manifest
(`tts_xtts`, `tts_voxtral`, `tts_mixed`) declares these fields — no engine implements a cloud SSML
export path today. Full rationale and changelog row: `design-docs/specs/plugin-contract.md`
(1.6.0 row, confirmed present).

**Explicitly NOT built here** (remains entirely the sibling `chapter_editor_catalog_completion`
plan's task 006, which had not landed as of this PR): the render-pipeline gate —
`has_behavior(engine_id, "ssml_directives")` and its call-site wiring into
`_render_segment`/`build_script_entry_for_group`. Do not conflate the two; this task's fields are
consumed only by the export layer (task 010/011), not the live render path.

## Map links

Part F in `01-map.md`. INV-5 (one shared capability-flag mechanism). Resolves R-C.

## Dependencies

Reads (does not modify) the sibling plan's task 006 mechanism once it lands — this task's fields
build on the same `behavior` block, not a parallel one.

## Out of scope (still true, downstream work)

The render-pipeline gate itself (sibling task 006), the 5 exporters (task 011), the
capability-matrix/degradation engine (task 010), declaring these fields on any real plugin.
