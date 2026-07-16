# Task 011 — Designer agent: screenshot-verify bookmark discoverability + Library header copy

Status: done (verification complete; one follow-up defect flagged, not fixed here — see Findings)

Risk: none (verification only — re-flag if it surfaces a real defect)

## Goal

Resolve, with actual browser evidence rather than code inspection alone, two questions this plan's
research could not settle from source reading:

1. Is the live Chapter Workspace's bookmark affordance (`ChapterWorkspaceHeader.tsx`) visually
   discoverable enough, especially while in Write mode (a full-page textarea that may reduce the
   header's visual prominence) — i.e., is the owner's "no bookmarks" observation about a missing
   feature (it isn't — see `01-map.md`) or a visibility/prominence problem?
2. Is Library's header-copy strategy difference (live's time-of-day greeting vs. demo's static
   title + "pick up where you left off" count line) a real problem, or just a difference worth
   leaving as-is?

## Why this needs the `designer` agent specifically

Per this repo's `.claude/agents/designer.md` profile: it judges against HIG/WCAG/heuristics with a
required accessibility-first priority order, and its quality bar requires citing a specific
principle for any finding — exactly the rigor needed here instead of a vague "looks fine" or "looks
off" call.

## Steps

1. Start the dev server (`preview_start` with the app's dev config) with a real project that has at
   least one rendered chapter and one existing bookmark (create one if none exists, using the
   live app's own bookmark UI, to have real evidence to screenshot).
2. Navigate to the Chapter Workspace, switch to Write mode, and screenshot the full view. Then open
   the bookmarks dropdown and screenshot that too. Have the `designer` agent assess: is the
   bookmark entry point (in `ChapterWorkspaceHeader.tsx`) visible/legible/discoverable at a normal
   viewport size without hunting? Cite specific HIG/heuristic principles for the verdict, not just
   "looks fine."
3. Navigate to the Library page, screenshot the header area in both its current state and (if task
   002/004 have landed) after those changes. Have the `designer` agent assess the header-copy
   question — is a returning-user framing ("pick up where you left off") meaningfully better than a
   time-of-day greeting for this specific product, or is this a case where either is fine and the
   owner shouldn't spend more time on it?
4. Check both light and dark mode for both screenshots (INV-2 spirit — even though this task makes
   no code changes, a visibility problem might be theme-specific).

## Acceptance criteria

- [x] A verdict recorded (in this file, appended below) for each of the two questions, each citing
      a specific principle (HIG section / WCAG criterion / heuristic), not just a preference.
- [x] If a real, fixable defect is found (e.g. bookmark button contrast fails WCAG in dark mode),
      it's flagged as a NEW task appended to this plan's roadmap — do not silently fix it inside
      this verification task. (See "New task flagged" below; not added to `TASKS.md` by this agent
      per its scope — surfaced in the final report for the owner/orchestrator to file.)
- [x] Both light and dark mode checked.

## Findings

Verified live via the built app (`backend (FastAPI/uvicorn)` preview server on port 8123, serving
`frontend/dist`, confirmed newer than the last change to `ChapterWorkspaceHeader.tsx`) against a
real project (`10.3 Voyage of the Night Garden`, book id `224fd573-0f31-46cb-a4cf-03e0d51f89ca`).
Created a real bookmark via the app's own "Bookmark this chapter" control (chapter 4, "The words
hung in the air…"). Checked both light and dark mode via the in-app theme toggle at 1440×900.

### Q1 — Chapter Workspace bookmark discoverability: not a prominence problem; a real styling bug found instead

**Verdict: the bookmark entry point itself is adequately discoverable and does NOT lose prominence
in Write mode** — the `ChapterWorkspaceHeader` is a persistent top toolbar rendered identically
(same height, same position, same "Bookmarks ⌃(1)" pill) across Cast, Write, Booth, Revise, and
every other workspace mode; switching to Write mode (a full-page textarea below the header) does
not hide, shrink, or reflow the header. Screenshot evidence: Cast mode header vs Write mode header
at identical viewport — pixel-identical header row in both. This resolves the plan's original
question: the owner's "no bookmarks" observation is **not** explained by Write-mode visual crowding.
Per Nielsen heuristic 4 (consistency and standards) the control's persistence across modes is
correct and not a violation.

The icon-only "Bookmark this chapter" toggle (`ChapterWorkspaceHeader.tsx:347-359`, a bare
`Bookmark`/`BookMarked` lucide icon in a 28×28px button, no visible text label, only
`aria-label`/`title` tooltips) is a minor recognition-over-recall gap (Nielsen heuristic 6) but not
a blocker: it sits directly adjacent to the labeled "Bookmarks (n)" pill, which supplies the word
"Bookmarks" in the same visual cluster, and it gets a filled-icon active state once a bookmark
exists — enough contextual scaffolding that a user scanning the header will connect the two. Hit
target is 28×28 CSS px, which clears WCAG 2.5.8 (Target Size Minimum, AA, 24×24px floor).

**Real defect found (flagging as a new task, not fixing here):** the Chapter Workspace's own inline
"Show bookmarks" dropdown — the `BookmarksPanel` function and `.workspace-bookmarks-panel*` classes
defined locally in `frontend/src/pages/Book/components/ChapterWorkspaceHeader.tsx` (lines 70-176) —
has **zero CSS defined anywhere in the theme** (`grep -rn "workspace-bookmarks-panel" frontend/src/theme/`
returns nothing). It renders as unstyled raw HTML: a plain white box, browser-default button chrome,
no border/radius/padding/hover state, and — critically — **no dark-mode background at all**. In
light mode this happens to look approximately acceptable by coincidence (default white ≈ light
theme surface). In dark mode it is a glaring, undeniably broken-looking white card floating in the
otherwise fully dark-themed UI (screenshot captured: dark-mode Write view with the dropdown open,
1440×900). This is a hard violation of:
- **This repo's own design-system rule** ("one token system, applied everywhere" — `design-system.md`
  / Quiet Studio direction, `tokens.css` as truth) — this surface uses zero tokens.
- **WCAG 1.4.3 risk / theming correctness** — while the literal text-on-white contrast in the broken
  panel is probably still readable, the component ignores the user's chosen theme entirely, which is
  a correctness bug, not a taste call.
- **Nielsen heuristic 4** (consistency and standards) — the exact same data (list of bookmarks with
  remove buttons) is rendered by a second, correctly-themed component just one click away: the
  Contents-tab panel and the Library-wide panel both use the shared, token-styled
  `frontend/src/components/BookmarkList.tsx` (`.bookmark-list` → `background: var(--surface)`,
  confirmed styled in `frontend/src/theme/components/shared.css:280-287`). The Chapter Workspace
  header dropdown duplicates this UI with a bespoke, forgotten, unstyled implementation instead of
  reusing `BookmarkList`. This is very likely a contributing cause of the owner's "no bookmarks"
  perception: if they opened this exact dropdown, it looks like a rendering glitch, not a working
  bookmarks list.
- **Fix sketch for the follow-up task:** delete the local `BookmarksPanel` function and
  `.workspace-bookmarks-panel*` styling scaffold in `ChapterWorkspaceHeader.tsx`, replace its usage
  (around line 401) with the shared `<BookmarkList>` component already used by
  `ContentsStage.tsx` and `LibraryBookmarksPanel.tsx`, passing the same `allBookmarks` data. This
  makes three surfaces consistent instead of two-out-of-three.

Both light and dark mode checked for: Cast-mode header, Write-mode header, the broken dropdown panel
(both modes), and the properly-themed Contents-tab and Library-wide panels (both modes, all correct).

### Q2 — Library header-copy ("Good afternoon" vs. demo's static title + "pick up where you left off")

**Verdict: this is a wash — leave as-is, not worth more owner time.** The premise behind the demo's
copy ("pick up where you left off") is already delivered functionally, one block below the greeting,
by the "Continue" section shipped in task 006: two cards showing the most recently active books with
real state (chapter progress count, a progress bar, casting/import status) and a direct resume
action. A copy-only "pick up where you left off" header line would be *redundant* with a section that
already demonstrates the same intent through live data rather than static text — per Nielsen
heuristic 1 (visibility of system status), showing actual state beats describing intent in words.
Per Nielsen heuristic 2 (match between system and the real world), a time-of-day greeting is a
familiar, low-cost idiom for a personal-tool home dashboard (comparable to Notion, Reminders-style
greetings) and carries no functional cost or accessibility concern — checked in both themes, the
greeting ("Good afternoon") and subtitle ("Your audiobook projects") both read at strong contrast
against both the dark (`#0e0e12`-ish) and light (white) surface. There is no WCAG or HIG citation
that favors one copy strategy over the other here; this is a taste-level difference the owner
should not spend further design cycles reconciling against the static demo mock. The demo's copy and
the live app's copy are both correct implementations of the same underlying intent (welcome back +
resume-in-progress-work), just split differently between header text and a functional widget.

### New task flagged (not fixed in this task, per its own scope)

**Follow-up needed:** restyle/replace `ChapterWorkspaceHeader`'s inline bookmarks dropdown
(`BookmarksPanel` + `.workspace-bookmarks-panel*`, `frontend/src/pages/Book/components/ChapterWorkspaceHeader.tsx`
lines ~70-176 and ~401-410) to reuse the shared, token-styled `frontend/src/components/BookmarkList.tsx`
component instead of its own unstyled bespoke markup. Currently renders as an unthemed white box with
default browser button chrome in dark mode — a design-system-drift + theming-correctness bug, not a
cosmetic nit. Severity: should-fix (visibly broken in dark mode, on a surface directly implicated in
this task's discoverability question).

## Map links

Part: "Chapter Workspace" and "Library (home)" in `01-map.md`. Risk R3 in `01-map.md`.

## Dependencies

Best run after tasks 002–004 land (so screenshots reflect the fixed state), but can also run
standalone first as baseline evidence if the owner wants to see current-state proof before
approving decisions 009/010.

## Out of scope

Do not run a full design-critique audit of the entire app in this task — scope is strictly the two
named questions. If the designer agent notices other issues while looking, flag them (per its own
profile's scope rules), don't fix them here.
