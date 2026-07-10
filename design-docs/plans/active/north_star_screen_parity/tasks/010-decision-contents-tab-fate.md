# Task 010 — DECISION + implement: Contents tab fate

Status: pending — BLOCKED on owner decision

Risk: quality-sensitive

## The fork (must be resolved before implementation)

The live `Contents` tab is a chapter table with an inline `ChapterTextPanel` editor next to it
(`ContentsStage.tsx:103-189`, editor at `:178`) — no bookmark panel. The demo's *wired* `Contents`
tab (`ContentsPane`, `panes/book.tsx:266-495`) is a slimmer "chapter board": StatusOrb + chapter
number + title + words + render% + an "Open" button (no inline text editor), plus a cross-book
`GlobalBookmarkPanel` (`panes/book.tsx:71-191`) live has no equivalent of anywhere.

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

**Also decide, regardless of A/B:** should live's `Contents` tab gain a cross-book bookmark
overview panel (matching `GlobalBookmarkPanel`)? Live currently only has *per-chapter* bookmarks
(via `ChapterWorkspaceHeader`, task 008's area) with no book-wide view of all bookmarks across
chapters. This is a smaller, additive, lower-risk sub-decision independent of A/B.

## Step 1 — Record the decision here

*(Empty until executed. Recommend running the `design-critique` skill or the `designer` agent
profile on both live's actual Contents tab and the demo's two candidate panes — `ContentsPane` and
the orphaned `ManuscriptPane` — for an independent structural read before presenting this to the
owner, since "which one is actually better" is a genuine design judgment call, not just a parity
question.)*

**Decision (A or B):** _pending_
**Cross-book bookmark panel wanted:** _pending_

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

## Step 3 — Cross-book bookmark panel (independent of A/B)

If wanted: add a `GlobalBookmarkPanel`-equivalent to live's `Contents` tab, reusing the existing
`store/bookmarks.ts` (already used per-chapter in `ChapterWorkspaceHeader.tsx`) rather than building
a second bookmark store — this should be a read-across-all-chapters view over the same data, not a
new data model.

## Acceptance criteria

- [ ] Decision recorded (A/B + bookmark-panel yes/no) before any implementation step runs.
- [ ] Whichever path: no capability lost without being re-homed (INV-1) — especially watch for this
      in Option B's editor removal.
- [ ] If a cross-book bookmark panel is added: reuses `store/bookmarks.ts`, no second data model.
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
