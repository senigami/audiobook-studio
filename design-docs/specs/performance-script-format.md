# Performance Script Format

```
spec_version: 1.0.0
status: active
updated: 2026-07-16
sources:
  - app/domain/chapters/performance_schema.py
  - app/domain/chapters/rendering.py
  - frontend/src/types/performanceScript.ts
```

> **TL;DR:** `chapter_segments.performance_data` holds a validated, versioned JSON blob — the "Audiobook Performance Script" canonical format — carrying sparse performance annotation (emotion/delivery), per-mode rendering overrides, and kind-specific extension fields for a segment. Everything else about a segment's speaker/review state lives on dedicated `chapter_segments` columns (W-PERF task 001), not in this blob.

## Changelog

| Version | Date       | Change |
|---------|------------|--------|
| 1.0.0   | 2026-07-16 | Initial spec. Defines `PerformanceData` (Pydantic, `app/domain/chapters/performance_schema.py`) and its mirrored TypeScript type (`frontend/src/types/performanceScript.ts`), plus `resolve_rendering()` (`app/domain/chapters/rendering.py`), the single translation layer for the 5 rendering modes × 8 rendering values × 13 segment kinds. Source design: `design-docs/plans/proposals/performance_script_model/01-canonical-json-format.md`. AI extraction pipeline (tasks 005-009) and export layer (tasks 010-011) are explicitly deferred per the 2026-07-10 owner decision — this spec covers the validated shape and resolution logic only; nothing writes or reads `performance_data` in production yet. |

---

## Scope

This spec governs the shape of the `performance_data` JSON column added to `chapter_segments` by W-PERF task 001 (see `data-model.md`), and the pure resolution logic (`resolve_rendering()`) that interprets it. It does **not** cover:

- The AI extraction pipeline that would populate this column (deferred).
- The multi-target export layer that would consume `RenderingDecision` objects to produce SSML/provider-specific output (deferred).
- The review-state UI (deferred).
- The plugin-manifest export-capability fields (`export_format`, `supports_*`) — see `plugin-contract.md` for those.

## `performance_data` shape

The blob holds everything doc-01's canonical segment object specifies that is **not** already promoted to a dedicated `chapter_segments` column. Promoted columns (task 001): `speaker_confidence`, `speaker_evidence`, `needs_review`, `locked`. Everything else lives here:

- `kind` — one of 13 `SegmentKind` values: `narration`, `dialogue`, `attribution`, `stage_direction`, `action_context`, `vocalization`, `sfx`, `music`, `ambience`, `silence`, `chapter_marker`, `scene_marker`, `production_note`.
- `performance` (optional) — `emotion` (primary/secondary/intensity/valence/arousal/confidence), `delivery` (pace/volume/pitch/range/pause_before_ms/pause_after_ms/emphasis), `acting_note`. Sparse: absent on most segments (§3 of doc 01 — only annotate when a line needs direction beyond defaults).
- `rendering` (optional) — a partial map of `RenderingMode` → `RenderingValue`, the segment's explicit per-mode overrides. This is *input* to `resolve_rendering()`, not itself a resolved decision.
- `review` (optional) — `speaker_reviewed`, `performance_reviewed`, `review_notes` only. `needs_human_review`/`locked` from doc-01 §10 are **not** duplicated here — they live on the promoted `needs_review`/`locked` columns, which are the source of truth.
- Kind-specific extension fields: `vocalization_type`/`spoken_text`/`export_strategy` (vocalization), `sfx_type`/`description`/`placement`/`enabled` (sfx), `duration_ms`/`purpose` (silence/sfx), `affects_next_segments`/`inferred_state` (action_context).

Validation: `validate_performance_data(raw: dict) -> PerformanceData` (`app/domain/chapters/performance_schema.py`) — raises `PerformanceDataValidationError` on malformed input. Every writer (future AI-pipeline parsing, future manual-edit API) must call this before persisting.

## Rendering-mode resolution

`resolve_rendering(segment, mode, defaults) -> RenderingDecision` (`app/domain/chapters/rendering.py`) resolves the `RenderingValue` for a `(segment, mode)` pair per doc-01 §9's precedence chain:

```
studio_override > explicit source fact > AI inference > character default >
scene default > chapter default > book default > engine default
```

- The segment's own `rendering` override (if present) is tiered by the segment's `locked`/`ai_suggested` columns: `locked` → `studio_override`, `ai_suggested` → `ai_inference`, neither → `explicit_source_fact`.
- Absent an override, resolution falls through `RenderingDefaults`' caller-supplied tiers (`character_default`, `scene_default`, `chapter_default`, `book_default`, `engine_default`), each optional. **No new DB tables back these tiers in this PR** (owner decision) — a tier the caller doesn't supply falls through to the next.
- The final fallback is a built-in kind × mode default matrix (65 cells, all 13 kinds × 5 modes), documented inline in `rendering.py`.

Two doc-01 inconsistencies resolved here (see `rendering.py` module docstring for full reasoning):

1. `convert_or_omit` (used in doc-01's action_context example) is not one of the 8 canonical `RenderingValue`s — it resolves to `use_as_context_only`.
2. Vocalization's `export_strategy` does not replace mode resolution — it's carried alongside the resolved `RenderingValue` on `RenderingDecision.export_strategy` as an additional hint for a future engine-capability layer.

## Invariant

**INV-2 (no ad-hoc reinterpretation):** any future exporter or consumer of `performance_data` MUST go through `resolve_rendering()` — never re-derive a mode/value decision from the raw JSON directly. This is the single translation layer the export layer (deferred) is required to build on.

## Cross-references

- `data-model.md` — `chapter_segments`/`characters` column definitions.
- `plugin-contract.md` — plugin-manifest export-capability fields consumed by the (deferred) export layer.
- `design-docs/plans/proposals/performance_script_model/01-canonical-json-format.md` — original design doc this spec formalizes.
- `design-docs/plans/proposals/performance_script_model/03-db-schema-changes.md` — DB schema proposal (corrected 2026-07-16 to remove the stale `span_start`/`span_end` premise).
