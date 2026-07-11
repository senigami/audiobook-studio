# Task 011 — Designer agent: screenshot-verify bookmark discoverability + Library header copy

Status: pending

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

- [ ] A verdict recorded (in this file, appended below) for each of the two questions, each citing
      a specific principle (HIG section / WCAG criterion / heuristic), not just a preference.
- [ ] If a real, fixable defect is found (e.g. bookmark button contrast fails WCAG in dark mode),
      it's flagged as a NEW task appended to this plan's roadmap — do not silently fix it inside
      this verification task.
- [ ] Both light and dark mode checked.

## Findings

*(Fill in during execution.)*

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
