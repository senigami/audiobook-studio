# Roadmap — North Star Screen Parity

## Workload order

Ordered by dependency and impact. Workloads 1–2 are independent of each other and can run in
parallel; Workload 3 (decision-gated) should not start implementation until the owner has answered
`00-overview.md`'s "Decisions needed"; Workload 4 is cleanup, lowest priority, do last or skip.

```
Workload 0 (foundation, do first, ~5 min)
  └─ 001 fix TASKS.md doc drift

Workload 1 (Home/Library — the owner's explicit "Home Screen" complaint)
  ├─ 002 WelcomePage CTA placement          [independent]
  ├─ 003 Library grid card: Open + hover-play [independent]
  ├─ 004 Library: All Books header + filters + cover-size slider  [independent]
  ├─ 005 Library: per-project status (research-gated)   [depends on: none, but may reveal new decision]
  ├─ 006 Library: Continue section (research-gated)      [depends on: 005's research findings — same data source]
  └─ 007 Library: fix dead unreachable empty-state branch  [independent, trivial]

Workload 2 (Book view / chapter list — the owner's explicit "Book view" complaint)
  ├─ 008 Chapter Workspace: status orb in ChapterDropdown  [independent]
  ├─ 009 DECISION + implement: Backups tab fate            [owner decision required first]
  └─ 010 DECISION + implement: Contents tab fate           [owner decision required first]

Workload 3 (visual verification — needs a live browser)
  └─ 011 Designer agent: screenshot-verify bookmark discoverability + Library header copy

Workload 4 (lower priority, demo-side + doc cleanup — do last or skip)
  ├─ 012 Update demo mock: Engines Module-Settings tab, orphaned ManuscriptPane, studio.tsx note
  └─ 013 Refresh terminology in the R1-18 owner-validation checklist
```

## Dependency graph

```
001 ──────────────────────────────────────────────────────────► (no dependents; do anytime, do first)

002, 003, 004, 007 ──► (fully independent, any order, any executor)

005 ──► 006  (006 reuses whatever data-derivation 005 establishes; if 005 stops at INV-4, so does 006)

008 ──► (independent)

009 ──► requires owner decision recorded ──► implementation
010 ──► requires owner decision recorded ──► implementation

011 ──► best run AFTER 002-004 land (so the screenshot comparison reflects the fixed state, not the
         pre-fix state) — but can also run standalone first as a baseline read if the owner wants
         to see current-state evidence before approving 009/010's decisions.

012, 013 ──► fully independent, no dependents, lowest priority
```

## Milestones

- **M1 (Workload 0 done):** `TASKS.md` no longer misleads future planning sessions.
- **M2 (Workload 1 done):** Library/Welcome match the demo's structure or have recorded, deliberate
  exceptions. This is the highest-visibility milestone — it's the first thing every session sees.
- **M3 (Workload 2 decisions recorded):** Owner has answered the Backups/Contents forks; 009/010
  unblocked.
- **M4 (Workload 2 done):** Book-level tabs and Chapter Workspace reconciled.
- **M5 (Workload 3 done):** Bookmarks/Library-copy questions resolved with actual visual evidence,
  not just code inspection.
- **M6 (Workload 4 done, optional):** Demo mock and validation checklist brought current — nice to
  have, not user-visible.

## Risk-flag summary (per task, mechanical gating — see plan-architect convention)

| Task | Risk flags | Why |
|---|---|---|
| 001 | none | Pure doc edit |
| 002 | none | Small JSX reorder, no logic change |
| 003 | multi-file | Touches `ProjectCard.tsx` + wherever `ActionMenu` is defined |
| 004 | multi-file | New section spans `ProjectLibraryPage.tsx` + `LibraryControls.tsx` |
| 005 | quality-sensitive | Risk of scope-creep into a schema change (INV-4) — review mandatory regardless of diff size |
| 006 | quality-sensitive | Same as 005, plus depends on 005's finding |
| 007 | none | Deleting genuinely-unreachable code, single file |
| 008 | none | Reuses existing `StatusOrb`, single file |
| 009 | quality-sensitive | Architecture-level tab decision; user-facing; hard to reverse cleanly once shipped |
| 010 | quality-sensitive | Same — removing/adding an inline editor on a primary workflow surface |
| 011 | none | Verification only, no code change (unless it finds something, in which case re-flag) |
| 012 | none | Demo-only files, zero live-app risk |
| 013 | none | Doc-only |

## Coverage note

This plan was not built from a pre-existing findings list (review-adversarial output, an audit,
etc.) — it was built from fresh side-by-side research (five parallel scouts, see `01-map.md`). No
`Covers:` coverage table applies; every task traces back to a specific finding documented in
`01-map.md`'s Parts table instead.
