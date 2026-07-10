# Task 002 — Mount `DirectorsConsole` into `BookLayout.tsx`, replacing the Studio/Review toggle

Status: done (code + tests + tsc clean; live preview verification still pending — see steps)

## Goal

Replace `ChapterWorkspace`'s hard `'studio' | 'review'` toggle with the real `DirectorsConsole` (still stubbed for Cast/Booth/Revise at this point — that's expected and fixed by Workload C). This is intentionally done *before* the tool bodies are filled in, so each subsequent port task can be live-verified against the actual mount point rather than in isolation.

## Exact files

- `frontend/src/pages/Book/BookLayout.tsx` — the `ChapterWorkspace` local function, lines ~200-314.
  - `BookLayout.tsx:113` — `type WorkspaceView = 'studio' | 'review';` — delete this type.
  - `BookLayout.tsx:203` — `const [activeView, setActiveView] = useState<WorkspaceView>('studio');` — delete this state.
  - `BookLayout.tsx:246-263` — the `role="group"` Studio/Review toggle buttons — delete.
  - `BookLayout.tsx:302-304` — 
    ```tsx
    <div style={{ flex: 1, minWidth: 0 }}>
      {activeView === 'studio' ? <StudioStage /> : <ReviewStage />}
    </div>
    ```
    replace with:
    ```tsx
    <div style={{ flex: 1, minWidth: 0 }}>
      <DirectorsConsole />
    </div>
    ```
  - `BookLayout.tsx:11-12` — remove the now-unused `StudioStage`/`ReviewStage` imports **only if** Task 007 hasn't already run (check — if this task runs after 007 for some reason, those imports are already gone; more likely 007 runs last, so at this point still remove the toggle's usage but leave the imports if anything else in this file still references them — grep first).
  - Add import: `import { DirectorsConsole } from '@/pages/ChapterEditor/components/DirectorsConsole';`

## Steps

- [x] Make the edits above.
- [x] Do NOT touch the independent Lexicon `WorkspacePanel` toggle (`BookLayout.tsx:204,266-287,306-309`) — it is a separate, unrelated dockable panel alongside the workspace body, not part of the Studio/Review toggle being removed.
- [x] Grep `frontend/src/` and `frontend/tests/` for `'studio'`/`'review'` used specifically as `WorkspaceView` values or as the toggle's button text ("Studio"/"Review" — not incidental uses of those words elsewhere) and update/remove any now-dead references (aside from the two stage files themselves, which Task 007 deletes later).
- [x] Update `frontend/tests/unit/pages/Book/BookLayout.test.tsx` — remove/replace any assertion checking for the Studio/Review toggle buttons or `activeView` behavior; add a basic assertion that `data-testid="directors-console"` renders inside the chapter workspace.
- [x] Live preview (`preview_start`): open a book, click into a chapter, confirm the console rail renders (Cast/Booth/Revise icons, plus the Casting Call/Script Supervisor/Plugin "coming soon" placeholders) in place of the old toggle, and that Cast/Booth/Revise currently show their stub "Coming soon" bodies (expected — fixed in Workload C). Confirm the Lexicon panel still docks/undocks correctly alongside it. **Verified 2026-07-09 by the orchestrator using the browser preview tool**: opened Dracula → chapter 1 → Director's Console rail renders with all 6 tools (Cast/Booth/Revise/Casting Call/Script Supervisor/Plugin), Cast shows "Coming soon" stub as expected, zero console errors.
- [x] Run `npx tsc -b --force` — clean.

## Acceptance criteria

- [x] `WorkspaceView` type, `activeView` state, and the toggle buttons are gone from `BookLayout.tsx`.
- [x] `<DirectorsConsole />` renders in the `ChapterWorkspace` body.
- [x] Lexicon panel docking is unaffected (regression check, not a new feature) — verified via passing `ChapterWorkspace.test.tsx` Lexicon-toggle tests; not visually confirmed in a live browser (see live preview step above).
- [x] `BookLayout.test.tsx` updated and passing.
- [x] `npx tsc -b --force` clean.
- [x] Append a `docs/code-map/queue/` entry.

## Dependencies

None (Task 001 is independent; can run in parallel).

## Map links

- Part: `BookLayout.tsx ChapterWorkspace` — `01-map.md`, "The parts"
- Invariant: INV-1 (the mounted `<DirectorsConsole />` takes zero props — do not attempt to pass `chapterId` or similar to it)
- Risk: `multi-file` (this changes the main navigation surface for every chapter view — verify no other test file assumes the old toggle exists)

## Out of scope

- Filling in any tool body (Workload C).
- Deleting `StudioStage.tsx`/`ReviewStage.tsx` (Task 007 — they're still imported/used by nothing after this task, but leaving them in place until every port is verified is deliberate, not an oversight).
