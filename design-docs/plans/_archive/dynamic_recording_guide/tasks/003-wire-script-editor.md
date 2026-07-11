# Task 003 — Wire the "Suggest from voice qualities" button into `ScriptEditor.tsx`

Status: complete

## Goal

Thread the voice's `VoiceMetadata.attributes` down to `ScriptEditor.tsx` (currently not available there at all — confirmed by reading its full prop list) and add the suggestion button.

## Exact files

- `frontend/src/pages/Voices/VoicesPage.tsx:225` — the `<VoicesModals ...>` call. `voiceMetadataMap` already exists in this component (lines 81-83) but isn't passed down. Add `voiceMetadataMap={voiceMetadataMap}` (or, if simpler given how `VoicesModals` resolves which profile is being edited, resolve the specific `VoiceMetadata` for `state.editingProfile` here and pass a single resolved object — check `VoicesModals.tsx`'s existing prop shape first to decide which is less invasive; both are valid, pick whichever requires touching fewer call sites).
- `frontend/src/components/VoicesModals.tsx:163` — the `<ScriptEditor ...>` call. Thread the new prop through to `ScriptEditor`. Use the **same id-first/name-fallback resolution** already established at `VoicesPage.tsx:118-119` (`voiceMetadataMap.get(id) ?? voiceMetadataList.find(m => m.name === name)`) if resolving here rather than in `VoicesPage.tsx` — do not invent a different lookup order.
- `frontend/src/pages/Voices/components/ScriptEditor.tsx`:
  - Add `attributes?: VoiceAttributes` to `ScriptEditorProps` (`ScriptEditor.tsx:7-24`).
  - Import `suggestRecordingPrompt` from `./metadata/recordingPromptSuggester`.
  - Add a button beside the existing "Reset to Default" (`ScriptEditor.tsx:182-189` — match its visual style/placement), labeled "Suggest from voice qualities," `onClick` calls `suggestRecordingPrompt(attributes)`; if the result is non-null, call `onTestTextChange(result.prompt)`; if null, the button should already be `disabled` (see next point) so this path shouldn't be reachable, but guard it anyway defensively.
  - Button is `disabled` when `!attributes` or `suggestRecordingPrompt(attributes) === null` — wrap in a `title`/tooltip explaining why (e.g. "Tag this voice's qualities first to get a suggested prompt" — link the wording to wherever the metadata editor is reachable from, check what that affordance is called in the UI before wording the tooltip).

## Steps

- [x] Read `VoicesModals.tsx`'s full current prop interface to decide the lowest-friction way to thread the data (single resolved `VoiceMetadata` vs. the whole map + an id).
- [x] Make the three-file edit.
- [x] Confirm `is_untagged`/empty-attributes voices show the button disabled with the tooltip (INV-4) — do not let a voice with zero attributes silently get a `composed` suggestion built entirely from undefined fields.
- [x] Add/extend a test in `frontend/tests/unit/pages/Voices/` (find the existing `ScriptEditor` test file if one exists, or `VoicesModals`'s test) covering: button present and enabled when attributes exist; disabled when absent; clicking calls `onTestTextChange` with the suggester's output (mock `suggestRecordingPrompt` at the module boundary per R2 — don't re-implement its logic in the test).
- [ ] Live preview (`preview_start`): open the Voices page, edit a tagged voice's script, click "Suggest from voice qualities," confirm the textarea fills; open an untagged voice's script, confirm the button is disabled with a visible tooltip. **Not run this session — no `preview_start` tool available in this execution context; covered instead by unit tests below. Owner should manually verify per this step before considering the feature fully done.**
- [x] Run `npx tsc -b --force` — clean.

## Acceptance criteria

- [x] Button works end-to-end for a tagged voice; disabled with explanation for an untagged one. (Verified via unit tests; live browser check still pending — see Steps.)
- [x] `voiceMetadataMap`'s existing resolution convention (id-first, name-fallback) is reused, not reinvented.
- [x] No regression to the existing "Reset to Default"/Save flow — both still work unchanged.
- [x] Tests pass; `npx tsc -b --force` clean.
- [x] Append a `docs/code-map/queue/` entry.

## Dependencies

Task 002 (`suggestRecordingPrompt` must exist to call).

## Map links

- Part: "Wiring — attribute threading," "UI — the button" — `01-map.md`, "The parts"
- Invariant: INV-1 (suggestion, not auto-save), INV-4 (disabled for untagged, not a generic fallback)
- Risk: `multi-file` (three files must agree on the new prop's shape end-to-end — verify the full chain compiles and the data actually reaches `ScriptEditor`, not just that each file typechecks in isolation)

## Out of scope

- `TestSection.tsx`'s separate test-text input (noted as a future follow-on in `00-overview.md`, not required here).
