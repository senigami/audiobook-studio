# Task 002 — Voices page sweep

Status: pending

## Goal

Fix the page that caused the live incident this plan originated from: zero `data-testid` coverage, and `ActionMenu`/`"Play preview"` labels identical across every voice card.

## Exact files

- `frontend/src/pages/Voices/components/VoiceCatalogCard.tsx` — root card, the "Play preview"/"Pause preview" button, the `<ActionMenu>` call.
- `frontend/src/pages/Voices/components/NarratorCard.tsx` — same class of gap.
- `frontend/src/pages/Voices/components/ScriptEditor.tsx` — the drawer that caused the actual confusion (Save/Reset/Suggest buttons, per `dynamic_recording_guide` plan's Task 003 which added the "Suggest from voice qualities" button here).
- `frontend/src/pages/Voices/components/VariantEditor.tsx` — variant rows/actions.
- `frontend/src/pages/Voices/components/MetadataEditorModal.tsx` — the taxonomy tag editor modal.

## Steps

- [ ] `VoiceCatalogCard.tsx`: add `data-testid={`voice-card-${speaker.id}`}` to the root `<div className="voice-catalog-card">`. Pass `entityLabel={speaker.name}` to its `<ActionMenu>` call. Consider whether the "Play preview" button's label should also incorporate the voice name (e.g. `aria-label={`Play preview for ${speaker.name}`}`) — check current label text first, don't guess; if it's per-profile already unique, leave it.
- [ ] `NarratorCard.tsx`: same treatment (identify its root entity id first — likely `speaker.id` or similar, check the props).
- [ ] `ScriptEditor.tsx`: add `data-testid` to the drawer root and to its Save/Reset/Suggest buttons (e.g. `data-testid="script-editor-save-btn"` — these are drawer-scoped, only one open at a time, so a static testid is fine here, not per-entity).
- [ ] `VariantEditor.tsx`: add `data-testid={`variant-row-${variant.name}`}` (or whatever the variant's stable identifier field actually is — check the component's props) to each rendered variant row.
- [ ] `MetadataEditorModal.tsx`: add `data-testid` to the Save/Cancel buttons at minimum (modal-scoped, static testid is fine).
- [ ] Grep-verify: after changes, confirm `grep -c "voice-card-" frontend/src/pages/Voices/components/VoiceCatalogCard.tsx` shows the interpolation is present (not a hardcoded string).
- [ ] Run `npx tsc -b --force` and the relevant `frontend/tests/unit/pages/Voices/` suite — confirm no regression.

## Acceptance criteria

- [ ] Every voice card has a `data-testid` keyed by the voice's real id.
- [ ] `ActionMenu` calls in this page pass `entityLabel`.
- [ ] `ScriptEditor`'s primary action buttons have `data-testid`.
- [ ] `npx tsc -b --force` clean; existing Voices tests pass unchanged.
- [ ] Append a `.agent/code-map/queue/` entry.

## Dependencies

Task 001 (`entityLabel` prop must exist on `ActionMenu`).

## Map links

- Part: `VoiceCatalogCard`, `NarratorCard`, `ScriptEditor`/`VariantEditor` — `01-map.md`, "The parts"
- Invariant: INV-2 (real entity id, not index), INV-3 (no visual change)
- Risk: `none` (attribute-only changes)

## Out of scope

- `pages/Voices/components/HuggingFaceDiscover.tsx` and other Discover-tab components (not part of the measured gap that motivated this plan — a future pass if needed).
