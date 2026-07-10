# Task 009 — DECISION + implement: Backups tab fate

Status: pending — BLOCKED on owner decision

Risk: quality-sensitive

## The fork (must be resolved before implementation)

The live app's standalone `Backups` book-level tab (`BackupsStage.tsx:1-47`) is an explicit
placeholder: "Backup management coming in Phase 2. Use the Publish tab for audiobook assembly and
export." Meanwhile the REAL backup functionality (save/delete/update-metadata, restore) already
lives and works inside the `Publish` tab (`ProjectBackupsPanel` in `PublishStage.tsx:111-117`). The
demo, by contrast, has a fully-functional standalone `Backups` tab (`BackupsPane`,
`panes/book.tsx:1499-1592`) and no backup UI at all in its `Publish` pane
(`panes/publish.tsx` has zero references to backups).

So today's live app already made a de facto decision (backups live in Publish) but never updated
the stub tab or the tab list to match — a user clicking "Backups" sees a dead end pointing them
back to a tab that already has what they want, which reads as a bug even though nothing is
technically broken.

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

**Decision:** _pending_

## Step 2a — If Option A (remove the stub tab)

1. Delete `frontend/src/pages/Book/stages/BackupsStage.tsx`.
2. Remove `backups` from the tab list in `frontend/src/pages/Book/lib/stages.ts` and from
   `BookLayout.tsx`'s tab-content switch.
3. Add a redirect from the old `/book/:id/backups` route to `/book/:id/publish` (check how other
   retired routes in this app handle redirects — likely `App.tsx`'s route table — reuse that
   pattern).
4. Confirm `ProjectBackupsPanel` inside `PublishStage.tsx` is unaffected (it should be — nothing
   about it changes in this option).

## Step 2b — If Option B (build out the real tab, slim Publish)

1. Move `ProjectBackupsPanel` and its wiring out of `PublishStage.tsx` into `BackupsStage.tsx`,
   replacing the stub content.
2. Remove backup UI from `PublishStage.tsx`, leaving assembly-only content (`AssemblyProgress`,
   `AssemblyPanel`/`AssemblyChapterPicker`).
3. Verify no capability is lost in the move (INV-1) — re-test both tabs' full functionality.
4. This is the larger, riskier option — mandatory adversarial review of the diff regardless of size
   (this task's `quality-sensitive` flag), since it touches a primary, frequently-used surface
   (Publish) and moves a feature between two locations.

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
