# Task 003 — Match Voice eyedropper

Status: pending

Risk: none (self-contained — reads existing state, no new data model, no write path)

## Goal

Add an `Alt`/`Option`-modifier click on a script span that samples that span's existing `character_id`/`speaker_profile_name` into the active Cast brush (i.e. sets `selectedCharacterId`/`selectedProfileName`), so the user can "continue a voice from earlier in the chapter" without reopening the Cast palette. Add a visual affordance (eyedropper cursor) while `Alt` is held so the gesture is discoverable.

## Why this matters

Named explicitly in `design-docs/workflows/chapter-editor-modes.md` §4's terminology table (line: *"Eyedropper (copy voice) | **Match Voice** | —"*) and §5: *"**Match Voice** (`Alt`/`Option`): sample an existing span's speaker+variation into the active voice — continue a voice from earlier in the chapter."* `CastTool/index.tsx`'s doc comment (lines 29–31) lists "Match Voice" among items deliberately deferred. It genuinely does not exist anywhere: no code, and the demo mockup that otherwise prototypes most of the Cast catalog (`frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx`) has **no eyedropper at all** (R-E in `01-map.md`) — there is no reference implementation to copy, real or mocked.

## Exact files

- **MODIFY** `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` — `ScriptSpanItem`'s `onClick` (lines 149–156): add an `Alt`-key branch before the existing `activeCharacterId` branch. Add a module-level `Alt`-held tracking (keydown/keyup listeners) for cursor styling.
- **MODIFY** `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` — wire a new `onMatchVoice` prop on `<ScriptView>` (near the existing `onAssign`/`onAssignRange`/`onAssignToCharacter` wiring at lines 344–361) to call the already-destructured `setSelectedCharacterId`/`setSelectedProfileName` (destructured at lines 142–145, both come straight from `useStudioChapter`).
- **MODIFY** `frontend/src/pages/ChapterEditor/components/ScriptView.css` (imported at `ScriptView.tsx:25`) — add a cursor rule for the "matching voice" (Alt-held) state.

## Current shape (verified)

- **Nothing exists.** No eyedropper code, no `onMatchVoice` prop, no Alt-key handling anywhere in `ScriptView.tsx` or `CastTool/index.tsx` today (grepped; zero hits).
- **The data this task reads is already present, no new fields needed:**
  - `ScriptSpan` (`frontend/src/types/index.ts:102–114`) has `character_id: string | null` (line 107) and `speaker_profile_name: string | null` (line 108) directly on every span object already passed into `ScriptSpanItem` — `span.character_id`/`span.speaker_profile_name` are read straight off the `span` prop already in scope inside the `onClick` handler at `ScriptView.tsx:149–156`. No prop drilling of extra data is required.
- **The setters this task writes to already exist and are already exposed:**
  - `frontend/src/pages/Book/studio/useStudioChapter.ts:55–56` declares `const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);` and `const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);`.
  - Both are returned from the hook (`useStudioChapter.ts:951–954`) and already destructured into `CastTool/index.tsx`'s `CastToolBody` (lines 142–145) as `selectedCharacterId, setSelectedCharacterId, selectedProfileName, setSelectedProfileName`.
  - `CastPalette.tsx`'s existing character-row selection handler (`makeRowHandlers`, lines 441–459) demonstrates the exact same two-setter-call pattern this task needs: `onSelect: () => { setSelectedCharacterId(char.id); setSelectedProfileName(getDefault()); }`.
- **The existing span `onClick`'s guard structure to build on** (`ScriptView.tsx:149–156`):
  ```tsx
  onClick={(e) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    if (activeCharacterId) {
      e.stopPropagation();
      onAssign?.([span.id]);
    }
  }}
  ```
  The `!selection.isCollapsed` early-return (don't fight the drag-select-to-range-assign popover) must be preserved. The `activeCharacterId` gate must NOT apply to Match Voice — sampling a voice must work even when no brush is currently loaded (loading the brush from a sample IS the point of the gesture), so the Alt-branch must sit as an independent, earlier check, not nested inside `if (activeCharacterId)`.

## Target shape

```tsx
onClick={(e) => {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return;
  if (e.altKey) {
    e.stopPropagation();
    onMatchVoice?.(span.character_id, span.speaker_profile_name);
    return;
  }
  if (activeCharacterId) {
    e.stopPropagation();
    onAssign?.([span.id]);
  }
}}
```

Add `onMatchVoice?: (characterId: string | null, profileName: string | null) => void;` to `ScriptSpanItemProps` and `ScriptViewProps`, threaded through `renderSpan` exactly like `onAssign`/`onPlaySpan` already are.

In `CastTool/index.tsx`, wire it:
```tsx
onMatchVoice={(characterId, profileName) => {
  setSelectedCharacterId(characterId);
  setSelectedProfileName(profileName);
}}
```
A span with `character_id: null` (an unassigned/Narrator line) samples as "Narrator" — passing `null`/`null` straight through to the setters is correct and matches how Narrator selection already works elsewhere (e.g. `CastPalette.tsx`'s narrator button at lines 508–545 sets `selectedCharacterId(null)`).

**Alt-held cursor affordance**: add a small `useEffect` in `ScriptView.tsx` that listens for `keydown`/`keyup` on `window`, tracking a local `isAltHeld` state, and toggles a CSS class (e.g. `is-matching-voice`) on `containerRef.current` (the existing ref at line 285) while held. In `ScriptView.css`, add:
```css
.script-view-container.is-matching-voice .script-span.is-assigned,
.script-view-container.is-matching-voice .script-span {
  cursor: crosshair; /* or a custom eyedropper cursor via cursor: url(...), crosshair */
}
```
Keep this scoped to visual affordance only — do not change any click-handling logic based on this state (the `e.altKey` check on the actual click event is the source of truth, not the hover-tracked boolean, since the two can theoretically desync if focus leaves the window while Alt is held).

## Steps (ordered, concrete)

1. Add `onMatchVoice` to `ScriptViewProps`/`ScriptSpanItemProps` in `ScriptView.tsx`, thread through `renderSpan` (near line 518, alongside the existing `onAssign` prop pass-through).
2. Update `ScriptSpanItem`'s `onClick` per the target shape.
3. Add the `isAltHeld` tracking `useEffect` + CSS class toggle on `containerRef`.
4. Add the CSS rule to `ScriptView.css`.
5. Wire `onMatchVoice` in `CastTool/index.tsx`'s `<ScriptView>` invocation.
6. Add tests to `frontend/tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx`:
   - Alt+click on an assigned span calls `onMatchVoice` with that span's `character_id`/`speaker_profile_name`, and does NOT call `onAssign`.
   - Alt+click on an unassigned (Narrator) span calls `onMatchVoice(null, null)`.
   - Alt+click fires regardless of whether `activeCharacterId` is currently set or null (test both).
   - A plain (non-Alt) click with `activeCharacterId` set still calls `onAssign` as before (regression check).
7. `npm -C frontend run test -- --run ScriptView`, `npm -C frontend run lint`.
8. Append a code-map changelog entry.

## Acceptance criteria

- [ ] Alt/Option + click on any span samples that span's `character_id`/`speaker_profile_name` into `selectedCharacterId`/`selectedProfileName`, regardless of whether a brush is already loaded.
- [ ] Alt+click never triggers a normal assignment (`onAssign` is not called on the same click).
- [ ] A visible cursor change (or equivalent affordance) appears while Alt/Option is held over the script view.
- [ ] Plain click behavior (Sentence/Paragraph/Word brush assignment) is unaffected — verified by a regression test.
- [ ] `npm -C frontend run test -- --run` and `npm -C frontend run lint` clean.
- [ ] Code-map changelog entry added.

## Map links

Part C in `01-map.md`. No invariants triggered (no new data model — this task explicitly satisfies INV-1 by design, reusing `ScriptSpan.character_id`/`speaker_profile_name` and the existing `setSelectedCharacterId`/`setSelectedProfileName` setters). Risk R-E noted above (no demo/mock reference exists — build from real components/data per this repo's convention, not by copying anything).

## Dependencies

None. Independent of task 001 (doesn't write any assignment — it only reads a span's existing state and calls two local `useState` setters) and independent of task 002 (brush-size selection is orthogonal to which voice is loaded).

## Out of scope

- Do not add Match Voice as a *mode* or a persistent toggle button — it is a modifier-key gesture only, per the design doc's terminology table framing ("Alt/Option").
- Do not build any keyboard-only (non-mouse) equivalent — out of scope for this pass; the A11y keyboard model is its own later workload (016–018).
- Do not touch Booth-mode or Revise-mode rendering — Match Voice is Cast-mode only.
