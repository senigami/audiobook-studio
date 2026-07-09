# Task 002 — Remove the duplicate chapter rail; dock Annotations

Status: pending

## Goal

`ReviewStage.tsx` (now reached via the "Follow Along" mode from Task 001) has its own vertical chapter-picker (`review-chapter-rail`) that duplicates `ChapterWorkspaceHeader`'s switcher, and a fixed Annotations side drawer. Remove the rail; convert Annotations into a dockable panel matching the existing `WorkspacePanel` pattern.

## Exact files

- `frontend/src/pages/Book/stages/ReviewStage.tsx` — the `review-chapter-rail` aside (~lines 141-175) and the fixed `AnnotationsPanel` rendering (~lines 231-238).
- `frontend/src/pages/Book/BookLayout.tsx` — the existing `WorkspacePanel` component (~lines 131-197) built for Lexicon; copy its exact shape, don't reinvent.
- `frontend/src/theme/components.css` — `.review-chapter-rail*` rules become dead once the JSX is removed; delete them in this task (don't leave orphaned CSS, per this session's own established practice of cleaning up dead rules when the JSX that used them is removed in the same change).

## Target contract

**1. Remove the rail entirely** from `ReviewStage.tsx` — the component's return should start directly with the "Main area" content (today's `review-main` div), no `<aside className="review-chapter-rail">` sibling. `handleChapterSelect` (the rail's click handler) can be deleted if nothing else calls it — grep to confirm before deleting.

**2. Dock Annotations.** Currently `AnnotationsPanel` renders inline as a conditional sibling inside `review-main__body` (`showAnnotations && <AnnotationsPanel .../>`). Change this to use `BookLayout.tsx`'s `WorkspacePanel` pattern instead — read `BookLayout.tsx`'s existing Lexicon docking code (the `lexiconOpen` state + `<WorkspacePanel title="Lexicon" onClose={...}><LexiconPanel .../></WorkspacePanel>` shape) and replicate the identical mechanism for Annotations, but scoped to where "Follow Along" mode is active (the toggle button that currently lives in `ReviewStage.tsx`'s topbar, near `MessageSquare`/"Annotations" text, should keep triggering the same open/close, just backed by the `WorkspacePanel` primitive instead of an inline conditional). Decide during implementation whether the panel-open state (`showAnnotations`) should live in `ReviewStage.tsx` itself or be lifted to `BookLayout.tsx`'s `ChapterWorkspace` (matching where `lexiconOpen` lives) — prefer lifting it to `ChapterWorkspace` for consistency with the existing Lexicon precedent, since `WorkspacePanel` is rendered as a sibling of the stage content in that pattern, not from inside the stage itself.

## Steps

- [ ] Remove `review-chapter-rail` JSX and its now-unused handler(s) from `ReviewStage.tsx`.
- [ ] Lift Annotations' open/closed state to `ChapterWorkspace` in `BookLayout.tsx`, rendering `<WorkspacePanel title="Annotations" onClose={...}><AnnotationsPanel .../></WorkspacePanel>` as a sibling of the Follow Along mode content, matching the Lexicon precedent exactly.
- [ ] Update the toggle button (`MessageSquare` / "Annotations") to control this lifted state instead of a local `showAnnotations`.
- [ ] Remove `.review-chapter-rail*` CSS rules from `components.css` (grep first to confirm no other consumer references them — should be none, this class was only ever used in the removed JSX).
- [ ] Update tests: search `frontend/tests/unit/pages/Book/stages/ReviewStage.test.tsx` and any `BookLayout`/`ChapterWorkspace` test for assertions on the rail or the old inline-Annotations rendering; update to match the new docked-panel structure.

## Acceptance criteria

- [ ] No chapter-picker exists anywhere except `ChapterWorkspaceHeader`.
- [ ] Annotations opens/closes as a docked panel, matching Lexicon's visual/interaction pattern.
- [ ] `.review-chapter-rail*` no longer exists in `components.css`.
- [ ] `npx tsc -b --force` clean; updated tests pass.
- [ ] Append a `docs/code-map/queue/` entry.

## Dependencies

Task 001 (the mode switcher must exist so "Follow Along" mode is a real, reachable target).

## Map links

- Part: `ReviewStage remnants (Follow Along mode)`, `AnnotationsPanel`, `WorkspacePanel` — `01-map.md`, "The parts"
- Invariant: INV-1 (only one chapter switcher)
- Risk: `multi-file` (state lifted across `BookLayout.tsx`/`ReviewStage.tsx`)

## Out of scope

- Edit Text mode (Task 003).
- Any change to `FollowAlongPanel`'s own content/toolbar beyond what's needed to remove the rail.
