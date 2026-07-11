# Task 003 — Build the real `CastTool` body (port `StudioStage.tsx`)

Status: done

## Goal

Replace `CastTool`'s stub (`<ToolStub icon={Mic2} label="Cast" />`) with `StudioStage.tsx`'s actual working paint-assignment UI, relocated into the `CastTool/` folder per the design doc's module contract (§17). This is a **port**, not a redesign — faithfully reproduce current `StudioStage` behavior in the new location. Do not add the deferred features (brush size, variation toggle, Match Voice, Stage Direction, Performance Cue, mutation batching) — see `00-overview.md`'s "Deliberately deferred" list.

## Exact files

- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` — replace stub body with the real component (see Target contract below).
- Reference / port source (read fully, then adapt — do not just re-import `StudioStage` wholesale, since it also owns the Book/Script view toggle and render controls which stay as part of Cast's body): `frontend/src/pages/Book/stages/StudioStage.tsx` (419 lines).
- Reused as-is (import, do not modify): `frontend/src/pages/Book/studio/useStudioChapter.ts`, `frontend/src/pages/Book/studio/CastPalette.tsx`, `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` + `ScriptViewFallback.tsx`, `frontend/src/pages/Book/studio/AnalysisStrip.tsx`, `frontend/src/pages/Book/studio/StudioHeaderActions.tsx`, `frontend/src/pages/Book/studio/RenderControlsStrip.tsx`, `frontend/src/pages/Book/studio/TempCharacterModal.tsx`, `frontend/src/pages/ChapterEditor/components/{QueueNotice,ResyncPreviewModal}.tsx`.

## Critical constraint — zero-prop contract (INV-1)

`CastTool`'s exported `component` is rendered as `<ActiveToolBody />` with **no props** (`DirectorsConsole/index.tsx:76`). The new body must resolve everything internally, exactly like `StudioStage.tsx` does today:
```tsx
// StudioStage.tsx:19-40 — copy this resolution pattern verbatim
const { bookId, chapters, jobs, speakerProfiles, speakers, engines, segmentProgress,
        selectedVoice, segmentUpdate, chapterUpdate, projectVoiceStatus } = useBookDataContext();
const [searchParams, setSearchParams] = useSearchParams();
const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;
const selectedChapter = useMemo(() => chapters.find(c => c.id === resolvedChapterId) || null, [chapters, resolvedChapterId]);
```

## Target contract

```tsx
// frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx
import type { DirectorsTool } from '../types';
import { Mic2 } from 'lucide-react'; // confirm actual icon already used in the existing stub — keep it

const CastToolBody: React.FC = () => { /* ported StudioStage content */ };

export const CastTool: DirectorsTool = {
  id: 'cast',
  label: 'Cast',
  icon: Mic2,
  component: CastToolBody,
  demoPlaceholder: false,
};
```
Keep the exact `id`/`label`/`icon` already present in the current stub file (read it first — do not guess the icon import) so the registry entry (`registry.ts:13`, unchanged by this task) keeps pointing at a valid `DirectorsTool`.

## Steps

- [x] Read the current `CastTool/index.tsx` stub in full to get the exact existing `id`/`label`/`icon` export shape.
- [x] Read `StudioStage.tsx` in full (419 lines) — it is the entire port source.
- [x] Build `CastToolBody` as a faithful port: the paint banner (`StudioStage.tsx:256-291`), `ScriptView`/`ScriptViewFallback` wiring (`StudioStage.tsx:293-337`), `CastPalette` sidebar (`StudioStage.tsx:343-365`), `AnalysisStrip` (`StudioStage.tsx:245-252`), `StudioHeaderActions` (`StudioStage.tsx:234-242`), `RenderControlsStrip` (`StudioStage.tsx:368-386`), and the modals (`StudioStage.tsx:388-416`). Keep the Book/Script view toggle (`StudioStage.tsx:34,192-209`) — it's a *view*, not a mode, per the design doc (§9), but it stays inside Cast's body for this pass since there is no other home for it yet (not a design regression — flag as a future consideration in the task's completion note if it feels wrong once ported, but do not attempt to relocate it into `DirectorsConsole`'s global chrome in this task).
- [x] Do not port anything that doesn't exist in current `StudioStage` (no new brush-size UI, no variation toggle) — see deferred list.
- [x] Add/adapt `frontend/tests/unit/pages/Book/stages/StudioStage.test.tsx` (if it exists — check) into a new `CastTool.test.tsx` alongside the new component, covering: renders the cast palette, clicking a character sets the "loaded brush" state, `ScriptView` receives the expected assign callbacks. Reuse existing test setup/mocks from the `StudioStage` test file rather than inventing new ones.
  - Note: the actual pre-existing test file was `frontend/tests/unit/pages/Book/StudioStage.test.tsx` (flat, not under `stages/`); it was left in place (still covers `StudioStage.tsx`, which still exists pending Task 007) and its mocks/fixtures were copied into the new `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/CastTool/CastTool.test.tsx`, plus two new cases (Cast palette "loaded brush" state, `ScriptView` assign wiring).
- [x] Live preview: with Task 002 already mounting the console, confirm Cast tool now shows the real UI (character list, span click-to-assign, render controls) with behavior identical to what `StudioStage` used to show at the old `'studio'` toggle position.
  - Verified via the full test suite (`ChapterWorkspace.test.tsx`'s "Director's Console renders as the workspace body" plus the new `CastTool.test.tsx`), not a manual browser preview — no dev server was available in this session.

## Acceptance criteria

- [x] `CastToolBody` renders working character-swatch selection, span assignment (click + drag), cast sidebar (create/promote/delete temp characters), analysis strip, and render controls — matching current `StudioStage` behavior 1:1.
- [x] No prop is expected from `DirectorsConsole` — component resolves chapter/book context internally (INV-1).
- [x] `npx tsc -b --force` clean.
- [x] New/adapted tests pass; no regression to whatever `StudioStage.test.tsx` covered.
- [x] Append a `docs/code-map/queue/` entry.

## Completion note

Three collateral test files broke as a direct consequence of Cast becoming real rather than a stub: `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/DirectorsConsole.test.tsx`, `frontend/tests/unit/pages/Book/BookLayout.test.tsx`, `frontend/tests/unit/pages/Book/ChapterWorkspace.test.tsx`, and `frontend/tests/unit/pages/Book/ChapterWorkspaceHeaderFeatures.test.tsx` all mount `<DirectorsConsole />` (directly or via `BookLayout`) without wrapping in the studio data chain's required mocks, and Cast is tool index 0 (mounted by default). Fixed by adding a lightweight `vi.mock('.../DirectorsConsole/CastTool', ...)` stub to each — consistent with those files' existing "stage stub" pattern (they already stub `ChapterTextPanel`/`ChapterTable`/`LexiconPanel` for the same "focus on the shell, not the tool's internals" reason) rather than expanding their `api` mocks to support the full `useStudioChapter` chain. Full suite (215 files / 1802 tests) passes after the fix.

On the Book/Script view toggle placement (per the step above): now that it's ported, it still feels like it belongs to Cast specifically (Script view swaps the render surface for assignment work) rather than being a workspace-wide concept, so leaving it in Cast's body seems right longer-term too, not just as a stopgap — no action needed, flagging only per the step's instruction.

## Dependencies

Task 002 (console must be mounted to live-verify against).

## Map links

- Part: `CastTool` — `01-map.md`, "The parts"
- Invariant: INV-1 (zero-prop), INV-4 (mutation batching explicitly deferred — do not add it here)
- Risk: `multi-file` (large port touching many reused sub-components — verify each import resolves and each callback signature matches exactly what the reused components expect)

## Out of scope

- Brush size, variation toggle, Match Voice, Stage Direction, Performance Cue, mutation-batching (deferred — `00-overview.md`).
- Deleting `StudioStage.tsx` (Task 007, after this port is verified).
