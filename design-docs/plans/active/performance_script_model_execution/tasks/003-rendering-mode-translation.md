# Task 003 — Rendering-mode translation layer (5 modes × 8 values)

Status: done (2026-07-16, W-PERF safe-foundation PR)

Risk: multi-file — single translation layer every downstream exporter must go through (INV-2); no
exporter is allowed its own ad-hoc interpretation of raw `performance_data`.

## What shipped

`app/domain/chapters/rendering.py` — `resolve_rendering(segment: CanonicalSegment, mode:
RenderingMode, defaults: RenderingDefaults) -> RenderingDecision`, resolving which of the 8
`RenderingValue`s applies to a segment in a given mode, walking doc 01 §9's precedence chain
(`studio_override` > explicit source fact > AI inference > character/scene/chapter/book default >
engine default). Full 12-kind × 5-mode default matrix implemented, with the two doc-01
inconsistencies resolved and documented inline: `convert_or_omit` mapped onto the canonical 8-value
set, and vocalization's `export_strategy` composition with mode resolution. Confirmed present via
`grep -n "class \|def " app/domain/chapters/rendering.py`
(`CanonicalSegment`, `RenderingDefaults`, `RenderingDecision`, `resolve_rendering`,
`_export_strategy`, `_resolve_spoken_text`).

This produces `RenderingDecision` objects only — no engine-specific output (SSML/Polly JSON/etc.),
which remains task 011's job, gated behind task 010's capability/degradation matrix.

## Map links

Part B-render in `01-map.md` / `02-roadmap.md`'s Workload 2. Implements INV-2. Feeds tasks 010, 011,
and 012 (via the precedence-tier field on `RenderingDecision`).

## Dependencies

Task 002 (imports its `RenderingMode`/`RenderingValue`/`RenderingOverride`/`SegmentKind`/
`PerformanceAnnotation` types directly).

## Out of scope (still true, downstream work)

The capability matrix / degradation-rules engine (task 010), the 5 exporters (task 011), wiring
resolved decisions into the frontend script/review view (task 012), new scene/chapter/book
default-tier schema for §9's upper precedence tiers (documented as a gap, not built).
