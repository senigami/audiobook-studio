# Overview

## Task

Mount `frontend/src/pages/ChapterEditor/components/DirectorsConsole/` (currently built but unreferenced anywhere) into the Chapter Workspace, replacing `BookLayout.tsx`'s `WorkspaceView = 'studio' | 'review'` toggle. Fill in the three stubbed tools (`CastTool`, `BoothTool`, `ReviseTool`) with real functionality, and add a fourth (`WriteTool`, not yet scaffolded). Resolve a naming collision with an unrelated demo component of the same name. Remove the superseded `StudioStage`/`ReviewStage` surfaces once their functionality is confirmed ported.

## Why (design authority)

`design-docs/workflows/chapter-editor-modes.md` — read in full before touching any task in this plan, especially §4 (palette/terminology), §5 (Cast), §6 (Booth), §7 (Revise), §7b (Write), §13 (decisions table), §17 (module architecture contract). `design-docs/plans/TASKS.md:508-521` records the WL1 gate clearance and the scaffold's shipped-dark status.

## Success criteria

1. Opening a chapter in the Chapter Workspace shows the `DirectorsConsole` left rail (Cast / Booth / Revise / Write icons) in place of the old Studio/Review toggle — no functionality regression against what `StudioStage`/`ReviewStage` currently do.
2. **Cast** tool: character swatch selection, span click/drag assignment, cast sidebar (create/promote/delete temp characters) — all working identically to current `StudioStage` behavior.
3. **Booth** tool: karaoke-style active-segment highlight, click-to-seek, regenerate-segment, flag/notes via `AnnotationsPanel` — all working identically to current `ReviewStage` behavior.
4. **Revise** tool: click a paragraph → inline edit → commit updates that segment's `text_content` via the existing `PUT /api/segments/{id}` endpoint, resets `audio_status` to `unprocessed`, and triggers a re-render of only that segment. Segment-overflow handling follows the design doc's balanced-split algorithm (§7: nearest sentence boundary to midpoint, 80-char floor, no-split-if-no-clean-boundary).
5. **Write** tool (new): full chapter source edit, reusing `ChapterTextPanel`/`useChapterText` verbatim, with the same produced-chapter lock/warning/resync-preview behavior it has today in Contents.
6. No naming collision remains between the real `DirectorsConsole` and the demo's `DirectorsConsole` export.
7. `StudioStage.tsx`, `ReviewStage.tsx` (+ its folder), and the `WorkspaceView` toggle are deleted once their replacements are verified — no orphaned dead code left behind.
8. Full green gate (build, typecheck, lint, full frontend + backend test suites) and live verification of all four modes with no console errors.
9. `docs/code-map/queue/` entry appended for the touched files.

## Deliberately deferred (tracked, not dropped)

Real features from the design doc that `StudioStage`/`ReviewStage` don't have today either, so porting current behavior doesn't require building them now. Note each as a follow-on item in `design-docs/plans/TASKS.md` when this plan completes:
- Cast: Word/Sentence/Paragraph brush-size selector, variation 3-way toggle (Natural/Whisper/Urgent), Match Voice eyedropper, Stage Direction (`S`) and Performance Cue (`P`) system entries + Cue Editor + SSML payload, mutation-batching event-collector (§5's "hard requirement" — `StudioStage` doesn't currently batch either; note this as a real gap to close, not silently accept forever).
- Booth: annotation gutter glyphs (⊘/⚡/🏴/tick), speed 0.5–2× transport control if not already present, reduced-motion binary-off path (verify what already exists in the player bus before assuming absence).
- Global: `Casting Call` (AI detect speakers), `Script Supervisor`, plugin tool slots — these remain `demoPlaceholder: true` stubs, unchanged.
- Accessibility: roving-tabindex composite-widget pattern, `aria-live` mode/brush announcements — apply WCAG-AA infra already in the app where trivial, but a full audit is out of scope here.

## Scope

**In scope:**
- `frontend/src/pages/Book/BookLayout.tsx` (remove toggle, mount `DirectorsConsole`)
- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/{CastTool,BoothTool,ReviseTool}/` (fill in real bodies)
- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/WriteTool/` (new)
- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/registry.ts` (register `WriteTool`)
- `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx` + `siteMockupStage.tsx` (rename export only)
- `frontend/src/api/index.ts` (`updateSegment`'s TS type gains an optional `text_content` field — already accepted server-side, just untyped client-side)
- Deletion: `frontend/src/pages/Book/stages/StudioStage.tsx`, `frontend/src/pages/Book/stages/ReviewStage.tsx` + `ReviewStage/` folder (once ported), once Task 007 confirms no regression

**Out of scope:**
- `frontend/src/pages/ChapterEditor/ChapterEditorPage.tsx` (the legacy full-editor surface reached via `/project/:projectId/details`) — confirmed coexisting, unrelated route; not touched.
- `frontend/src/pages/Book/stages/ManuscriptStage.tsx` — confirmed orphaned dead code from the prior plan's research; flagged for the owner separately, not this plan's job.
- Everything in "Deliberately deferred" above.
- Backend changes — none needed (confirmed: `update_segment` + its route already support arbitrary field updates including `text_content`).
