# Task 002 — Canonical `performance_data` JSON schema + validation

Status: done (2026-07-16, W-PERF safe-foundation PR)

Risk: multi-file — shared contract consumed by the AI pipeline (tasks 005-009) and the sibling
plan's manual Cue Editor.

## What shipped

`app/domain/chapters/performance_schema.py` — Pydantic models mirroring
`proposals/performance_script_model/01-canonical-json-format.md` exactly: `SegmentKind` (12-value
enum), `RenderingMode` (5 modes), `RenderingValue` (8 values), `Emphasis`, `EmotionAnnotation`,
`DeliveryAnnotation`, `PerformanceAnnotation`, `InferredState`, `ReviewAnnotation`, and the
top-level `PerformanceData` model (all `extra="forbid"` via a shared `_StrictModel` base), plus
`validate_performance_data(raw: dict) -> PerformanceData` (`PerformanceDataValidationError` on
malformed input). Confirmed present via `grep -n "class \|def " app/domain/chapters/performance_schema.py`.

**Review sub-object decision (doc 01 §10):** kept `speaker_reviewed`/`performance_reviewed`/
`review_notes` inside `performance_data` as a `ReviewAnnotation` sub-object holding only the
non-promoted fields — `needs_review`/`locked` stay the row-level columns' job, not duplicated in
JSON (per task 000's ratified provenance model).

Spec: `design-docs/specs/performance-script-format.md`. Consumers (task 007's AI pipeline, the
sibling plan's Cue Editor) must strip promoted-column fields before validating against this schema.

## Map links

Part B-schema in `01-map.md` / `02-roadmap.md`'s Workload 2. Prerequisite for task 003
(rendering-mode translation) and INV-2.

## Dependencies

Task 001 (columns must exist) and task 000 (reconciled shape).

## Out of scope (still true, downstream work)

Rendering-mode resolution logic (task 003), wiring into the script-view API/UI (task 012, sibling
Cue Editor), the AI pipeline itself (tasks 005-009), the separate character-profile schema
(`aliases`/`source_profile`/`voice_guidance` — not covered by doc 01, not folded in here).
