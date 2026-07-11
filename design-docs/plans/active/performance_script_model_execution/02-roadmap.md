# Roadmap — Performance Script Model Execution

## Workload order

```
Workload 0 (do FIRST, before any schema work — cross-plan reconciliation)
  └─ 000 Reconcile schema overlap with chapter_editor_catalog_completion  [R-A]
        NOT a build task — a decision/reconciliation step. See its task file.

Workload 1 (DB schema — safe, ready now regardless of AI-pipeline scheduling)
  └─ 001 Additive schema migration (chapter_segments + characters)        [A] depends: 000

Workload 2 (Canonical JSON format)
  ├─ 002 Canonical performance_data JSON schema + validation              [B-schema] depends: 001
  └─ 003 Rendering-mode translation layer (5 modes × 8 values)            [B-render] depends: 002

Workload 3 (Plugin contract — coordinate with sibling plan)
  └─ 004 SSML-capability manifest field (shared with chapter_editor_catalog_completion task 006) [F]
        depends: 001; COORDINATE, don't duplicate — see task file

Workload 4 (AI extraction pipeline — the largest, most uncertain workload; gate on R-B)
  ├─ 005 Character discovery pass                                        [C-1] depends: 001
  ├─ 006 Segmentation + speaker attribution pass                         [C-2] depends: 005
  ├─ 007 Performance annotation pass                                     [C-3] depends: 006, 002
  ├─ 008 Reconciliation + cross-chapter registry carry-forward            [C-4] depends: 005-007
  └─ 009 Review-queue backend API (surface AI suggestions for confirmation) [C-5] depends: 008

Workload 5 (Multi-target export layer)
  ├─ 010 Capability matrix + degradation-rules engine                    [D-1] depends: 003
  └─ 011 Five exporters (SSML, Polly, Azure, ElevenLabs, Google)          [D-2] depends: 010, 004

Workload 6 (Frontend review-state UI)
  └─ 012 AI-suggested vs. human-confirmed visual treatment                [E] depends: 009;
        coordinate with chapter_editor_catalog_completion's Cue Editor (that plan's task 008)
```

## Dependency graph

```
000 ──► 001 ──┬──► 002 ──► 003 ──► 010 ──► 011
              │                     ▲
              └──► 004 ─────────────┘
              │
              └──► 005 ──► 006 ──► 007 ──► 008 ──► 009 ──► 012
```

## Gate before Workload 4 (the AI pipeline)

**Do not start task 005 until the owner has reviewed
`research_character_brief_extraction_and_persona_casting.md`'s conclusions and explicitly greenlit
the AI-extraction approach** (R-B in `01-map.md`). Workloads 1-3 (schema, canonical format, plugin
contract) are safe and valuable regardless of this decision — they can proceed independently. If the
owner declines the AI pipeline, Workload 6 (review UI) still has value for **manually-entered**
performance data (via the sibling plan's Cue Editor) and should be re-scoped to that, not dropped
entirely.

## Milestones

- **M0 — Reconciled:** 000 done. Schema overlap with the sibling plan resolved, one shared shape.
- **M1 — Schema ready:** 001 done. Safe to build on regardless of what happens next.
- **M2 — Canonical format ready:** 002-003 done.
- **M3 — Plugin contract ready:** 004 done, coordinated with the sibling plan, not duplicated.
- **M4 — AI pipeline complete:** 005-009 done. This is the multi-week core of W-PERF; expect this milestone alone to take longer than every other milestone combined.
- **M5 — Export layer complete:** 010-011 done.
- **M6 — Review UI complete:** 012 done. W-PERF fully shipped.

## Risk-flag summary

| Task | Risk flags | Why |
|---|---|---|
| 000 | quality-sensitive | Cross-plan schema decision — gets this wrong and two plans silently diverge |
| 001 | none | Purely additive, matches existing migration pattern, no data migration |
| 002 | multi-file | Schema shape consumed by both the AI pipeline and the manual Cue Editor (sibling plan) |
| 003 | multi-file | Translation layer feeding 5 downstream exporters |
| 004 | quality-sensitive | Plugin-contract/SDK surface — needs version bump + validation per this repo's binding directive; shared with sibling plan |
| 005 | external-reference, quality-sensitive | LLM-pipeline reliability is a genuine open question (R-B); depends on facts (model behavior) not fully knowable at planning time |
| 006 | external-reference, quality-sensitive | Same — LLM pipeline stage |
| 007 | external-reference, quality-sensitive | Same |
| 008 | quality-sensitive | Cross-chapter state (registry) — an error compounds across every subsequent chapter |
| 009 | quality-sensitive | INV-3 (never auto-apply) is the load-bearing rule here — get this wrong and AI suggestions silently become confirmed data |
| 010 | none | Internal design/matrix, no live code risk yet |
| 011 | multi-file | 5 separate exporters, each with different capability assumptions |
| 012 | multi-file | Shared UI surface (`ScriptView.tsx`) with sub-sentence assignment and the sibling plan's Cast mode |

## Coverage note

Built from the existing proposal docs (design source) plus fresh verification research, not a
findings list — no `Covers:` table applies. Every task traces to a specific proposal doc section.

## Cross-references

- Map: [01-map.md](01-map.md).
- Sibling plan (schema overlap, R-A): [`chapter_editor_catalog_completion/`](../chapter_editor_catalog_completion/).
- Master checklist: `design-docs/plans/TASKS.md` (W-PERF entry).
