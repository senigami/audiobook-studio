# Overview — North Star Screen Parity

## The task

Bring the live app's layout/IA back in line with the North Star reference demo
(`frontend/src/demo/stages/siteMockup/`), starting from the owner's explicit examples (Home
screen, Book view's chapter list) and extending to every other primary screen this plan's research
covered. Per this repo's `site_redesign_rollout/00_execution_contract.md` convention: **the mock is
layout truth, not code truth** — rebuild with real components/data/tokens, never copy mock code
verbatim; and capabilities never vanish (a fix that removes a control must re-home it, not delete
it).

## Why now

The owner is actively noticing drift while using the app day to day. Meanwhile a separate session
is executing unrelated work on a different area of the frontend (the `styling_separation_execution`
CSS-token-conversion lane) — this plan's tasks are scoped to layout/structure, not CSS tokens, to
avoid file-level collision, but see `01-map.md` "Coupling risk" for the handful of files where both
efforts touch the same component.

## Scope

**In scope:** structural/layout parity between the live app and the North Star demo mock, across:
Welcome/splash, Library (home), the Book-level tab bar (Book/Contents/Cast/Lexicon/Publish/Backups),
the Chapter Workspace (Director's Console + header), and a light regression check of
Engines/Voices/Activity/Settings. Also in scope: fixing the `TASKS.md` doc-drift this research
uncovered (a phantom, already-superseded plan entry).

**Out of scope:** color/token/visual-styling differences (that's the concurrent styling-separation
lane's job); implementing genuinely new product features that neither app has yet (AI casting
auto-assignment, HF voice publish, plugin GitHub-store browsing); a full re-audit of areas this
plan's research already spot-checked clean (Activity, Voices, Voice Lab, Settings — see `01-map.md`
§Regression spot-check).

## Success criteria

For each screen this plan touches: the live app's layout/section structure matches its resolved
North Star reference (see `01-map.md` for which file is the *current* reference where two
candidates disagreed), OR a decision is recorded explaining why the live app's structure is the
one that should stand and the demo should be updated instead (some of live's differences are
improvements, not regressions — this plan does not assume the demo is always right). No existing
capability is removed without being re-homed. `TASKS.md` no longer contains a broken link to a
plan folder that doesn't exist.

## Decisions (recorded 2026-07-10, owner input)

These were real forks found during research — the owner has now decided both.

1. **Backups tab: stub or real, and where? DECIDED — build out the real tab.** The demo's
   `Backups` tab is a fully working feature (list/restore/create). The live app's standalone
   `Backups` tab (`BackupsStage.tsx`) was an explicit placeholder ("coming in Phase 2 — use Publish
   tab") while the *real* backup functionality already lived inside the live `Publish` tab
   (`ProjectBackupsPanel` in `PublishStage.tsx`). **Decision:** move real backup functionality into
   its own `Backups` tab to match the demo, and slim `Publish` back down to assembly-only — higher
   implementation/re-test cost than removing the stub, accepted deliberately for the cleaner IA
   (ship-it vs. safety-net separation). See task `009`, now unblocked for its Step 2b.
2. **Contents tab: chapter board, or chapter table + inline editor? DECIDED — match the demo's
   board.** The demo's wired `Contents` tab is a slim chapter board with no inline text editor
   (plus a cross-book bookmark panel the live app doesn't have at all). The live `Contents` tab is
   a chapter table with an inline `ChapterTextPanel` editor next to it. Research found the demo's
   *own* file has an orphaned, unused `ManuscriptPane` export that actually matches the live design
   closely (editor + lock logic + row actions) — suggesting the live design may have been the
   settled, intended one and the demo's wired `ContentsPane` just never got the equivalent upgrade.
   **Decision:** treat the demo's slimmer board as the intended target anyway; remove the inline
   editor from live's Contents tab. **Conditional, not absolute** — task `010`'s Step 2b requires
   confirming first that the Chapter Workspace's Write mode fully covers whatever the Contents-tab
   editor does today; if it doesn't, the task stops and re-escalates rather than silently dropping a
   capability (INV-1). **Also decided: yes**, add a cross-book bookmark overview panel to Contents,
   reusing the existing bookmark store. See task `010`.
3. **Should Library's "Continue" section and per-project status exist, and where does the data
   come from?** The demo shows an always-current-user info section (a "Continue" row with
   progress/ETA/status per book) that live has no visual equivalent for, and no persisted field
   for on the `Project` type. Research (task `005`/`006`) must first determine whether this is
   *derivable* from existing chapter/render data before any schema change is proposed — this plan
   does not authorize a schema/API change on its own; if derivation isn't possible, the task stops
   and surfaces that back to the owner rather than improvising a persisted field.

## Non-goals worth naming explicitly

- Not touching `frontend/src/demo/` mock files as a primary target — several findings suggest the
  *demo* is what's stale (Engines page's new Module Settings tab, Contents tab, orphaned
  `ManuscriptPane`), and updating the demo to reflect settled live decisions is real but
  lower-priority work, called out in task `012` rather than folded into the higher-priority tasks.
- Not re-verifying the R1-R18 owner-validation checklist items from
  `reference/site_redesign_rollout/99_progress_log.md` line 323 onward — those are a separate,
  already-existing gate. This plan's task `013` only refreshes that checklist's *wording* (it still
  says "Manuscript"/"Casting"/"Studio"/"Review" — terminology retired by the IA changes since), so
  the owner isn't confused walking through it later.
