# Task 010 — DECISION + implement: Contents tab fate

Status: Gate 1 (Option B, ContentsStage simplification) and Gate 2 (bookmark panels, both
surfaces) both landed 2026-07-11. See "Gate 2 — what was actually built" below.

Risk: quality-sensitive

## The fork (must be resolved before implementation)

The live `Contents` tab is a chapter table with an inline `ChapterTextPanel` editor next to it
(`ContentsStage.tsx:103-189`, editor at `:178`) — no bookmark panel. The demo's *wired* `Contents`
tab (`ContentsPane`, `panes/book.tsx:266-495`) is a slimmer "chapter board": StatusOrb + chapter
number + title + words + render% + an "Open" button (no inline text editor), plus a
`GlobalBookmarkPanel` (`panes/book.tsx:71-191`) live has no equivalent of anywhere.

**Naming correction (caught in adversarial review, before anyone builds the wrong thing):** this
plan previously called this a "cross-book" bookmark panel throughout. That's almost certainly wrong
and needs re-verifying, not assuming, before implementation. The Contents tab is itself a
**book-scoped** tab (Book → Contents → Cast → Lexicon → Publish → Backups all belong to one book) —
a panel showing bookmarks from *other, unrelated books* embedded inside one book's Contents tab
would be structurally nonsensical and a real data-scoping confusion (does a user viewing Book A's
Contents tab really see Book B's bookmarks? Almost certainly not what's intended). "Global" in the
demo's own naming much more plausibly means "book-wide" — every bookmark across every *chapter in
this one book*, not just the chapter you're currently viewing — i.e. this should read
**"cross-chapter" (within the current book), not "cross-book."** Step 1 below requires confirming
this against the demo file directly before Step 3 implements anything, since the owner's "yes, add
it" sign-off was given on the ambiguous wording.

The twist: the demo file also contains an **orphaned, unused** `ManuscriptPane` export
(`panes/book.tsx:610-1196`, confirmed not imported anywhere in `siteMockupStage.tsx`) that closely
resembles the live `Contents` tab's actual design — chapter table, inline rich-text editor, focus
mode, lock-on-produced-chapter warning, row-actions menu. This strongly suggests the live app's
design is the *settled, intended* one (`ManuscriptPane` reads like the source the live tab was
built from), and the demo's currently-wired `ContentsPane` simply never received the equivalent
upgrade — i.e., **this may be the demo that's stale, not the live app.**

**Option A — Live is correct; update the demo.** Treat this as evidence the live app is ahead, not
behind. No live-app code change in this task at all — instead, wire the demo's existing (but
orphaned) `ManuscriptPane` into `siteMockupStage.tsx` in place of the current `ContentsPane` (or
merge whatever's still uniquely valuable from `ContentsPane`, like the render-percent-per-chapter
board view, into it), so the demo stops being misleading to future comparisons. This is a
demo-only change — fold it into task 012 rather than duplicating it here once decided.

**Option B — Demo's slim board is the intended target; simplify live's Contents tab.** Remove the
inline `ChapterTextPanel` editor from `ContentsStage.tsx`, leaving a pure chapter-board view; the
editor would need to live somewhere else if this option is chosen (the Chapter Workspace's Write
mode already provides full-text editing per-chapter — check whether that makes the Contents-tab
inline editor genuinely redundant, or whether removing it loses a real, used capability first,
per INV-1 — this is exactly the kind of judgment call that should not be made without checking
actual usage/necessity).

**Also decide, regardless of A/B:** should live's `Contents` tab gain a book-wide bookmark overview
panel (matching `GlobalBookmarkPanel` — see naming correction above: this means every bookmark
across every chapter *in this book*, not other books)? Live currently only has *per-chapter*
bookmarks (via `ChapterWorkspaceHeader`, task 008's area) with no book-wide view of all bookmarks
across chapters. This is a smaller, additive sub-decision independent of A/B, but see Step 1's
research requirement before treating it as low-risk — whether `store/bookmarks.ts` actually
supports a cross-chapter query is unverified.

## Step 1 — Record the decision here

*(Empty until executed. Recommend running the `design-critique` skill or the `designer` agent
profile on both live's actual Contents tab and the demo's two candidate panes — `ContentsPane` and
the orphaned `ManuscriptPane` — for an independent structural read before presenting this to the
owner, since "which one is actually better" is a genuine design judgment call, not just a parity
question.)*

**Decision (A or B):** Option B — the demo's slim chapter-board is the intended target; simplify
live's `Contents` tab. Decided by the owner, 2026-07-10 (in this planning session). **Execute Step
2b's precondition check first and do not skip it**: this task file's own Step 2b explicitly
requires confirming the Chapter Workspace's Write mode fully covers every editing need the
Contents-tab inline `ChapterTextPanel` currently serves (e.g. bulk/multi-chapter editing) before
removing it — INV-1 (capabilities never vanish) applies here more than almost anywhere else in this
plan. If that check finds a capability that would be lost, stop and escalate back to the owner with
specifics rather than proceeding on this recorded decision as if it settles the implementation
risk too.

**Book-wide bookmark panel wanted:** Yes — add it. Decided by the owner, 2026-07-10, on the
original ("cross-book") wording. **Re-confirm with the owner if execution reveals this means
something meaningfully different from "every bookmark across every chapter in this one book"** —
the sign-off was given on ambiguous language (see naming correction above), so treat this as
provisionally approved, not a closed question, until Step 1's research below confirms the intended
scope matches what's buildable. Reuses the existing `store/bookmarks.ts` per Step 3 — do not build a
second bookmark data model, and do not build a literal multi-book panel without going back to the
owner first if that's what the demo actually turns out to show.

## Step 2a — If Option A (demo needs updating, live stays as-is)

No live-app implementation in this task. Hand off to task 012 (demo-side cleanup) with a note: wire
`ManuscriptPane` (or a reconciled merge of it with `ContentsPane`'s render-percent board) into
`siteMockupStage.tsx` in place of the current `ContentsPane` import.

## Step 2b — If Option B (simplify live's Contents tab)

1. First confirm the Chapter Workspace's Write mode genuinely covers every editing need the
   Contents-tab inline editor currently serves (check for any Contents-tab-specific editor behavior
   — e.g. bulk/multi-chapter editing — that Write mode, being per-chapter, might not replicate).
2. If confirmed redundant: remove `ChapterTextPanel` from `ContentsStage.tsx`, leaving the chapter
   table as a pure board (add StatusOrb/render-percent columns if not already shown, matching
   `ContentsPane`'s board style).
3. If NOT confirmed redundant (some capability would be lost): stop, this sub-option isn't viable as
   stated — escalate back to the owner with the specific capability that would be lost, per INV-1.

## Step 3 — Book-wide bookmark panel (independent of A/B)

**Research gate — do this before writing any UI code (do not skip, unlike this task's earlier
draft):**

1. Read `panes/book.tsx:71-191` (`GlobalBookmarkPanel`) directly to confirm what scope it actually
   demonstrates — every chapter in the current book, or something else. Resolve the naming ambiguity
   from actual evidence, not assumption.
2. Read `store/bookmarks.ts` fully to determine whether its data is already keyed in a way that
   supports "every bookmark across every chapter in this book" as a query over existing data (e.g.
   bookmarks already carry a `chapterId` that's itself book-scoped), or whether this requires a new
   access pattern (still the same underlying data, just a query shape that doesn't exist yet).
3. If a simple read-across-chapters view is confirmed feasible: proceed to implementation below.
4. If the store's shape makes this genuinely awkward (e.g. bookmarks aren't indexed in any way that
   lets you cheaply enumerate "all of them for book X" without iterating every chapter individually),
   that's still likely fine to build (a straightforward loop/aggregation, not a schema change) — but
   note the actual approach taken here so it's not confused with "a trivial existing view" if it
   wasn't one.

## Implement (once Step 3's research confirms scope and feasibility)

Add a `GlobalBookmarkPanel`-equivalent to live's `Contents` tab, reusing the existing
`store/bookmarks.ts` (already used per-chapter in `ChapterWorkspaceHeader.tsx`) rather than building
a second bookmark store — a read-across-all-chapters-in-this-book view over the same data, not a
new data model, and explicitly NOT spanning other books (see naming correction above).

## Acceptance criteria

- [ ] Decision recorded (A/B + bookmark-panel yes/no) before any implementation step runs.
- [ ] Whichever path: no capability lost without being re-homed (INV-1) — especially watch for this
      in Option B's editor removal.
- [ ] Step 3's research gate completed BEFORE any bookmark-panel UI code is written — scope
      confirmed as book-wide (this book's chapters only), not multi-book, against actual evidence
      from `panes/book.tsx:71-191` and `store/bookmarks.ts`, not assumption.
- [ ] If a book-wide bookmark panel is added: reuses `store/bookmarks.ts`, no second data model,
      and does not surface any other book's bookmarks.
- [ ] `npm -C frontend run test -- --run`, lint, build clean.
- [ ] Adversarial review pass mandatory regardless of which path (this task's risk flag).

## Map links

Part: "Book-level tabs" in `01-map.md`. Decision #2 in `00-overview.md`. Connection:
`store/bookmarks.ts` if Step 3 executes.

## Dependencies

None on other tasks in this plan.

## Out of scope

Do not touch the Backups tab (task 009) in this task, even though both are book-level tab
decisions — resolve independently.

## Gate 2 — what was actually built (2026-07-11)

Verified `panes/book.tsx:69-191` and `store/bookmarks.ts` directly (per Step 3's research gate)
before writing UI code. Finding: `store/bookmarks.ts`'s own header comment says
"Cross-book chapter bookmarks" and its `Bookmark` shape (`bookId`, `chapterId`, `label`,
`createdAt`) already supports both a per-book filter and an unfiltered cross-book query — it
already exports a `useBookBookmarks(bookId)` hook (pre-existing but unused) alongside the
existing `useBookmarks()` (all books, already used by `ChapterWorkspaceHeader.tsx` from task 008).
The demo's `GlobalBookmarkPanel` genuinely spans two different named books
(`bm.book === 'The Whispering Vale'` check inside its `handleJump`, with entries visibly from a
second book) — i.e. the demo's "global" really does mean cross-book, contradicting this task's
original "cross-chapter, not cross-book" naming correction. Brought back to the owner, who
resolved it by asking for **both** surfaces rather than picking one — see BACKGROUND in the
Gate 2 dispatch for the exact framing. Built:

1. **Book-scoped panel** — `ContentsBookmarksPanel` (local to
   `frontend/src/pages/Book/stages/ContentsStage.tsx`), using `useBookBookmarks(bookId)`. Shows
   only this book's bookmarks across all its chapters; never another book's.
2. **Library-wide panel** — `frontend/src/pages/ProjectLibrary/components/LibraryBookmarksPanel.tsx`,
   using `useBookmarks()` (unfiltered), rendered on `ProjectLibraryPage.tsx` between the greeting
   header and `LibraryControls`. Each row's secondary text is the owning book's title (looked up
   from the `projects` list already loaded by the page).

Both reuse a new shared presentational component, `frontend/src/components/BookmarkList.tsx`
(row = label + optional secondary + remove button), and `store/bookmarks.ts` as the single data
source — no second bookmark data model was created. New CSS: `.bookmarks-panel*` /
`.bookmark-list*` classes in `frontend/src/theme/components/shared.css` (the pre-existing
`ChapterWorkspaceHeader` bookmarks dropdown from task 008 turned out to have no CSS of its own —
left untouched, not folded into the new shared classes, to keep this change scoped).

Tests (TDD, all watched red before implementation): `frontend/tests/unit/components/BookmarkList.test.tsx`
(new), `frontend/tests/unit/store/bookmarks.test.ts` (added `useBookBookmarks` coverage — passed
immediately since the hook pre-existed; not a bug-fix, so no R1 revert-check applies),
`frontend/tests/unit/pages/Book/stages/ContentsStage.test.tsx` (+4),
`frontend/tests/unit/pages/ProjectLibrary/ProjectLibraryPage.test.tsx` (+3). Full suite: 223 files /
1872 tests passing; lint 0 errors (39 pre-existing warnings, none new); build clean.

**Judgment call flagged for the owner:** the library-wide panel is new scope beyond this task's
original text (task 010 only ever discussed the Contents tab). It has no task file of its own —
recommend either (a) a short retroactive entry in this file (done, above) plus a `TASKS.md` line
noting it shipped under task 010's umbrella, or (b) a new task number if the plan's convention is
one task per shipped surface. Did not edit `TASKS.md` per this dispatch's constraints — flagging
for the orchestrator to decide and record.
