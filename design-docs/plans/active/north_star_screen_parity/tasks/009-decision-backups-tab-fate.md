# Task 009 — DECISION + implement: Backups tab fate

Status: pending — decision recorded, ready for Step 2b

Risk: quality-sensitive

## The fork (must be resolved before implementation)

The live app's standalone `Backups` book-level tab (`BackupsStage.tsx:1-47`) is an explicit
placeholder: "Backup management coming in Phase 2. Use the Publish tab for audiobook assembly and
export." Meanwhile the REAL backup functionality (save/delete/update-metadata, restore) currently
lives and works inside the `Publish` tab (`ProjectBackupsPanel` in `PublishStage.tsx:111-117`). The
demo, by contrast, has a fully-functional standalone `Backups` tab (`BackupsPane`,
`panes/book.tsx:1499-1592`) and no backup UI at all in its `Publish` pane
(`panes/publish.tsx` has zero references to backups).

**Correction to this task's original framing (owner-supplied, verified via `git log`):** this
plan initially described Option B as "give the tab real functionality" as if building something
new. That undersold what actually happened historically. The owner had a genuinely working Backups
tab before the site redesign — it's the legacy `frontend/src/pages/ProjectDetail/ProjectDetailPage.tsx`
(still in the codebase, not yet retired; its removal is a separately-tracked, deferred item,
"R6-T10 dead-code retirement," in `master_agnostic_tasks.md` — **do not retire it as part of this
task**, it's still the reference implementation until this task lands). It renders
`ProjectBackupsPanel` directly as its own tab (`ProjectDetailPage.tsx:407-414`):

```tsx
) : currentTab === 'backups' ? (
  <ProjectBackupsPanel
    projectId={effectiveProjectId}
    onSaveBackup={handleSaveBackup}
    onDeleteBackup={handleDeleteBackup}
    onUpdateMetadata={handleUpdateBackupMetadata}
    submitting={submitting}
  />
```

When the 2026-06-21 IA port (`ab87ed90`, "IA port Phase 1... two-level Book/Chapter shell") built
the new Book pipeline shell, it created `BackupsStage.tsx` as a fresh stub instead of porting this
existing, working wiring over — and pointed `ProjectBackupsPanel` at `PublishStage.tsx` instead,
which **already has the exact same handler shape available** via its `actions` object
(`PublishStage.tsx:111-117`: `actions.handleSaveBackup`, `actions.handleDeleteBackup`,
`actions.handleUpdateBackupMetadata`, `actions.submitting` — same prop names, just accessed through
a shared actions hook rather than local page state). **This means Option B is not new
development — it's relocating an already-correctly-wired JSX block from one file to a sibling file
in the same pipeline, reusing the same `actions` object `BackupsStage.tsx` already has access to.**
This downgrades the actual implementation risk significantly from how it was originally described
below (still worth an adversarial review pass given it touches a primary surface, but this is a
cut-paste-relocate job, not a rebuild).

**Option A — Remove the standalone `Backups` tab.** Live already effectively decided backups belong
in Publish. Delete `BackupsStage.tsx`, remove `backups` from `pages/Book/lib/stages.ts`'s tab list,
update any routing/redirects for the old `/book/:id/backups` URL (redirect to `/book/:id/publish`
per this repo's "old routes keep working" convention, `00_execution_contract.md` R-G). Lowest
implementation cost; matches live's actual current behavior; means live now has 5 tabs like the
demo (though not the *same* 5 — Lexicon still makes live's count 5 vs demo's Backups-inclusive 5).

**Option B — Give the standalone `Backups` tab real functionality, matching the demo, and slim
`Publish` back to assembly-only.** Higher implementation cost (moves `ProjectBackupsPanel` and
re-tests both tabs) but matches the demo's tab-for-tab structure exactly, and arguably a cleaner
information architecture (Publish = "ship it", Backups = "safety net", not conflated).

## Step 1 — Record the decision here

*(This section starts empty. Whoever executes this task presents both options to the owner —
directly, or via the `design-critique`/`designer` agent profile for a structured recommendation —
and records the answer here, with the date and who decided, before touching any code.)*

**Decision:** Option B — build out the real `Backups` tab and slim `Publish` back to assembly-only.
Decided by the owner, 2026-07-10 (in this planning session), on the original (as it turns out,
overstated) framing that this was the higher-cost option. Corrected understanding (same session,
after the owner pointed out they'd previously had a working Backups tab): this is a low-cost
relocation of an already-built, already-correctly-wired component
(`ProjectDetailPage.tsx:407-414`'s pattern, currently duplicated into `PublishStage.tsx`) back to
its own tab — not new development. The decision stands, now on firmer, cheaper footing. Execute
Step 2b when this task is picked up.

## Step 2a — If Option A (remove the stub tab)

1. Delete `frontend/src/pages/Book/stages/BackupsStage.tsx`.
2. Remove `backups` from the tab list in `frontend/src/pages/Book/lib/stages.ts` and from
   `BookLayout.tsx`'s tab-content switch.
3. Add a redirect from the old `/book/:id/backups` route to `/book/:id/publish` (check how other
   retired routes in this app handle redirects — likely `App.tsx`'s route table — reuse that
   pattern).
4. Confirm `ProjectBackupsPanel` inside `PublishStage.tsx` is unaffected (it should be — nothing
   about it changes in this option).

## Step 2b — Option B, corrected: relocate the working block (not a rebuild)

1. Cut the `<ProjectBackupsPanel ... />` JSX block (`PublishStage.tsx:111-117`) out of
   `PublishStage.tsx`, including its import (`PublishStage.tsx:7`) if `PublishStage.tsx` uses
   nothing else from that import.
2. Paste it into `BackupsStage.tsx`, replacing the stub placeholder content entirely. Confirm
   `BackupsStage.tsx` has access to the same `actions` object `PublishStage.tsx` used (it's the
   same Book-pipeline hook shared across stage components — check how `BackupsStage.tsx` currently
   gets its props/context and whether `actions` is already threaded in or needs one extra prop/hook
   call to reach it).
3. Confirm `PublishStage.tsx` still renders correctly with just assembly content
   (`AssemblyProgress`, `AssemblyPanel`/`AssemblyChapterPicker`) after the block is removed — no
   leftover empty space, dangling layout, or unused imports.
4. Re-test both tabs' full functionality (save/delete/restore/update-metadata/include-audio-toggle)
   end to end — this is a relocation, not a rebuild, but INV-1 still requires proving nothing broke
   in the move.
5. Adversarial review pass on the diff is still mandatory per this task's risk flag (it touches a
   primary, frequently-used surface), but expect and verify a SMALL diff — if the diff looks large
   or reimplements logic that already existed in the cut block, that's a signal something went
   wrong in the port, not that the task is inherently big.

## Acceptance criteria

- [ ] Decision recorded in Step 1, with date and decider, before any code changed.
- [ ] Whichever option chosen: no backup capability (save/delete/restore/update-metadata/
      include-audio-toggle) is lost anywhere (INV-1).
- [ ] Old `/book/:id/backups` route (if removed per Option A) redirects rather than 404s (R-G
      convention).
- [ ] `npm -C frontend run test -- --run`, lint, build clean.
- [ ] Adversarial review pass on the diff (mandatory per this task's risk flag, regardless of which
      option or how small the resulting diff looks).

## Map links

Part: "Book-level tabs" in `01-map.md`. Decision #1 in `00-overview.md`.

## Dependencies

None on other tasks, but blocks nothing else either — can execute any time after the decision is
recorded.

## Out of scope

Do not touch the Contents tab (task 010) — even though both are book-level tab structure changes,
resolve them independently; they don't share files in a way that requires sequencing.
