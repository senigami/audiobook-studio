# Roadmap — Chapter Editor Catalog Completion

## Workload order

```
Workload 1 (Cast foundation — build FIRST, see 01-map.md Connections)
  └─ 001 Mutation-batching collector queue                          [A]

Workload 2 (Cast palette additions — sequence after 001, or design against its interface from day one)
  ├─ 002 Brush size selector (Word/Sentence/Paragraph)               [B] depends: 001
  ├─ 003 Match Voice eyedropper                                      [C] independent of 001 (doesn't write assignments itself, just sets brush state)
  └─ 004 Variation 3-way toggle                                      [D] depends: 001

Workload 3 (Stage Direction / Performance Cue — large, its own workload)
  ├─ 005 Data model + schema (segment render:false, engine_directives) [E-schema]
  ├─ 006 Render-pipeline skip + SSML consumption                     [E-pipeline] depends: 005
  ├─ 007 Shared gutter component (used by Cast AND Booth)             [F-component] depends: 005
  └─ 008 Cue Editor popover UI                                        [F-ui] depends: 007

Workload 4 (Booth additions)
  ├─ 009 Booth annotation glyphs (reuses 007's gutter)                [G-glyphs] depends: 007
  ├─ 010 Playback speed control (playerBus field, zero prior art)     [G-speed] independent
  └─ 011 Session-only margin pins                                     [G-pins] independent

Workload 5 (Revise: two-way split)
  ├─ 012 Backend split endpoint (generalize _split_segment_at_offset) [H] independent
  └─ 013 Frontend wiring (call 012's endpoint)                        [I] depends: 012

Workload 6 (Console-shell cross-cutting)
  ├─ 014 Render-on-mode-exit state tracking                          [J] independent
  └─ 015 Ambient On Air indicator                                    [K] depends: 014

Workload 7 (A11y keyboard model)
  ├─ 016 Shared roving-tabindex composite hook                        [L-hook] independent
  ├─ 017 Apply to ScriptView (Cast mode)                              [L-cast] depends: 016
  └─ 018 Migrate Booth/Revise off per-item tabIndex                  [L-booth-revise] depends: 016

Workload 8 (Cleanup — do last)
  └─ 019 Retire legacy Script/Source-Text tab pair + per-span dropdown [M] depends: reachability
        confirmation (see task file); soft dependency on 002 (word-brush
        needs the dropdown's replacement UX settled first)
```

## Dependency graph

```
001 ──► 002, 004        003 ──► (independent, parallel-safe with 001)

005 ──► 006
005 ──► 007 ──► 008
007 ──► 009

010, 011 ──► (independent, parallel-safe with everything)

012 ──► 013

014 ──► 015

016 ──► 017, 018

019 ──► (last; soft dependency on 002 settling word-level selection UX)
```

## Milestones

- **M1 — Cast foundation:** 001 done. All subsequent Cast-mode assignment work has a stable batching interface to target.
- **M2 — Cast palette complete:** 002-004 done. Brush size, Match Voice, variation all live.
- **M3 — Stage Direction / Performance Cue complete:** 005-008 done. The largest single workload; gates nothing else, but do not start it expecting a small task — budget it as its own multi-week slice.
- **M4 — Booth complete:** 009-011 done. Booth's gutter reuses M3's shared component (009 blocks on 007, not all of M3).
- **M5 — Revise split complete:** 012-013 done. The "running long" passive-only badge becomes a real two-way split.
- **M6 — Console-shell complete:** 014-015 done. Render-on-mode-exit + Ambient On Air both live.
- **M7 — A11y complete:** 016-018 done. Roving-tabindex on Cast's prose, Booth, and Revise; per-item tab-stop anti-pattern fully retired.
- **M8 — Cleanup complete:** 019 done. Legacy Script/Source-Text tab pair and per-span dropdown gone.

## Risk-flag summary

| Task | Risk flags | Why |
|---|---|---|
| 001 | quality-sensitive | Fixes a known 409-conflict bug class (B2); foundational for 002/004 |
| 002 | multi-file | Touches `CastTool/index.tsx` + `ScriptView.tsx` selection/hover logic |
| 003 | none | Self-contained, reads existing state, no new data model |
| 004 | multi-file | Data model exists (`variant_name`) but needs a naming-convention decision + Booth propagation |
| 005 | quality-sensitive, multi-file | Backend schema + type changes touching the render pipeline |
| 006 | quality-sensitive | Render-pipeline behavior change; must not break existing engines (INV-2) |
| 007 | multi-file | Shared component consumed by two modes — get the contract right once |
| 008 | none | UI-only, built on 007 |
| 009 | none | Reuses 007, Booth-side wiring only |
| 010 | multi-file | New shared player-bus field touches the global player |
| 011 | none | Self-contained to Booth |
| 012 | quality-sensitive | New backend endpoint touching segment DB rows (insert/reorder/audio-invalidation) |
| 013 | none | Small, calls 012's endpoint |
| 014 | quality-sensitive | Console-shell architecture change; must not regress mode-switching |
| 015 | multi-file | Needs render-progress state lifted out of Cast mode |
| 016 | quality-sensitive | Shared a11y hook — a bug here affects three surfaces at once |
| 017 | multi-file | Applied to the shared `ScriptView.tsx` (also used by legacy `ChapterEditor`, see 019) |
| 018 | multi-file, quality-sensitive | Replaces existing, shipped Booth/Revise keyboard behavior — real regression risk (R-B) |
| 019 | quality-sensitive | Deleting a still-live route; reachability must be confirmed live, not just by code read (R-D) |

## Coverage note

Not built from a findings list — built from fresh research against an already-agreed design doc (four parallel scouts, see `01-map.md`). Every task traces to a specific TASKS.md catalog bullet.

## Cross-references

- Map: [01-map.md](01-map.md).
- Master checklist: `design-docs/plans/TASKS.md`, "Chapter editor art-program" section.
