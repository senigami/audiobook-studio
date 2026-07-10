# Task 001 — Replace Studio/Review toggle with a Cast/Follow Along/Edit Text mode switcher

Status: pending

## Goal

Remove the hard `Studio | Review` toggle in `BookLayout.tsx`'s `ChapterWorkspace` and replace it with a 3-way mode switcher. Cast and Follow Along modes render today's existing content (moved, not rewritten); Edit Text is a stub for Task 003.

## Exact file

- `frontend/src/pages/Book/BookLayout.tsx` — read the full `ChapterWorkspace` function first (currently ~lines 200-314 per this plan's map; re-verify exact lines before editing, other work may have shifted them).

## Current state (context — re-read the live file before editing, don't trust this verbatim)

```tsx
type WorkspaceView = 'studio' | 'review';
// ...
const [activeView, setActiveView] = useState<WorkspaceView>('studio');
// ...
<div className="workspace-view-toggle" role="group" aria-label="Workspace view">
  <button ... onClick={() => setActiveView('studio')} aria-pressed={activeView === 'studio'}>Studio</button>
  <button ... onClick={() => setActiveView('review')} aria-pressed={activeView === 'review'}>Review</button>
</div>
// ...
{activeView === 'studio' ? <StudioStage /> : <ReviewStage />}
```

## Target contract

```tsx
type WorkspaceMode = 'cast' | 'follow-along' | 'edit-text';
// ...
const [activeMode, setActiveMode] = useState<WorkspaceMode>('cast');
// ...
<div className="workspace-view-toggle" role="group" aria-label="Workspace mode">
  <button type="button" className={...} onClick={() => setActiveMode('cast')} aria-pressed={activeMode === 'cast'}>Cast</button>
  <button type="button" className={...} onClick={() => setActiveMode('follow-along')} aria-pressed={activeMode === 'follow-along'}>Follow Along</button>
  <button type="button" className={...} onClick={() => setActiveMode('edit-text')} aria-pressed={activeMode === 'edit-text'}>Edit Text</button>
</div>
// ...
{activeMode === 'cast' && <StudioStage />}
{activeMode === 'follow-along' && <ReviewStage />}
{activeMode === 'edit-text' && <div className="chapter-text-panel__empty">Edit Text mode — coming in a follow-up task.</div>}
```

`StudioStage` and `ReviewStage` stay as their own components/files for this task — do not merge their internals yet, just change how they're selected. (`ReviewStage` still has its rail and fixed Annotations drawer at this point; Task 002 removes those.)

**Mode-state persistence (resolved default, per `01-map.md`'s open question):** reset `activeMode` to `'cast'` on every chapter switch (do not persist across chapters) — this is the simpler default; only deviate if you find a strong existing precedent forcing persistence (check how `activeView` currently resets, if at all, when `chapterId` changes — match that same reset behavior for `activeMode`).

## Steps

- [ ] Read the current `ChapterWorkspace` function in full (it may have shifted from the line numbers cited above).
- [ ] Rename the type/state/button-group per the target contract above (button labels: "Cast", "Follow Along", "Edit Text" — Title Case per `design-docs/specs/voice-tone.md` §2.1 button-labeling convention).
- [ ] Wire the three-way conditional render, with Edit Text as a plain stub for now.
- [ ] Preserve the existing `aria-pressed`/`role="group"` accessibility pattern already used for the two-button version.
- [ ] Update any test asserting the old `'Studio'`/`'Review'` toggle text/behavior (check `frontend/tests/unit/pages/Book/` broadly for tests exercising `ChapterWorkspace`, `workspace-view-toggle`, or the `Studio`/`Review` button labels).

## Acceptance criteria

- [ ] No `'studio' | 'review'` `WorkspaceView` type or `activeView` state remains in `BookLayout.tsx`.
- [ ] Three mode buttons render, Cast is the default/active mode on chapter entry.
- [ ] Clicking each button shows the correct content (Cast → StudioStage, Follow Along → ReviewStage, Edit Text → stub).
- [ ] `npx tsc -b --force` clean; relevant tests updated and passing.
- [ ] Append a `docs/code-map/queue/` entry.

## Dependencies

None — first task.

## Map links

- Part: `ChapterWorkspace` — `01-map.md`, "The parts"
- Risk: `multi-file` (touches the workspace shell every other task in this plan builds on), `quality-sensitive` (this is the core navigation shell for the entire chapter-editing surface — get it reviewed)

## Out of scope

- Removing the rail or docking Annotations (Task 002).
- Building the real Edit Text mode content (Task 003).
