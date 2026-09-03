# Roadmap

## Tasks

- **001 — `ActionMenu.tsx` fix + convention doc.** Adds the optional `entityLabel` prop, documents the convention in `design-docs/engineering-rules/frontend-interactions.md`. No dependencies — do first, everything else benefits from it.
- **002 — Voices page sweep.** `VoiceCatalogCard.tsx`, `NarratorCard.tsx`, `ScriptEditor.tsx`, `VariantEditor.tsx`, `MetadataEditorModal.tsx`. Depends on 001 (needs `entityLabel` to exist).
- **003 — VoiceLab page sweep.** All 6 files under `pages/VoiceLab/`. Depends on 001.
- **004 — ProjectLibrary + ProjectDetail card sweep.** `ProjectListView.tsx`, `ProjectCard.tsx`. Depends on 001.
- **005 — Queue components sweep.** `QueueItem.tsx`, `ReorderableQueueItem.tsx`, `GlobalQueue.tsx`. Depends on 001.
- **006 — Green gate + verification.** Full typecheck/test/lint/build, a grep-based uniqueness check across all touched files, and a note on the natural e2e-spec-consolidation follow-on. Depends on 002-005.

## Dependency graph

```
001 (ActionMenu + convention doc)
  ├──> 002 (Voices)
  ├──> 003 (VoiceLab)
  ├──> 004 (ProjectLibrary)
  └──> 005 (Queue)
           │
           └──> 006 (green gate + verification, needs all of 002-005)
```

002-005 are file-independent of each other (different page directories) — safe to parallelize once 001 lands.

## Milestones

1. After 001: the highest-leverage shared-component fix is live; every subsequent task can just call it.
2. After 002-005: the four measured-worst-coverage areas are fixed.
3. After 006: plan complete → archive, `TASKS.md` updated.
