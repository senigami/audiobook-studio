# Task 003 — VoiceLab page sweep

Status: pending

## Goal

`pages/VoiceLab/` has zero `data-testid` coverage across all 6 files. Add coverage to its primary interactive surface.

## Exact files

- All files under `frontend/src/pages/VoiceLab/` — read the directory listing first (research found 6 `.tsx` files; get the current exact list, don't assume it hasn't changed). At minimum, expect: `VoiceLabPage.tsx`, `components/TestSection.tsx`, and others discovered by listing the directory.

## Steps

- [ ] List `frontend/src/pages/VoiceLab/` and its `components/` subfolder to get the exact current file set.
- [ ] For the voice-selector/switcher (if `VoiceLabPage.tsx` renders a list of voices to choose from), add `data-testid={`voicelab-voice-${voiceId}`}` per the same convention as Task 002.
- [ ] For `TestSection.tsx`'s "Generate test"/play/pause controls, add `data-testid` (static is fine if only one instance renders at a time per active profile — check whether multiple `TestSection` instances can render simultaneously first; if yes, key by profile name/id).
- [ ] For any `<ActionMenu>` usage found in this directory (check via `grep -rl "<ActionMenu" frontend/src/pages/VoiceLab/`), pass `entityLabel` per Task 001's new prop.
- [ ] Run `npx tsc -b --force` and the relevant `frontend/tests/unit/pages/VoiceLab/` suite (if one exists — check) — confirm no regression.

## Acceptance criteria

- [ ] Primary interactive elements in `pages/VoiceLab/` have `data-testid` where the convention calls for it (per-entity for repeated items, static for singleton drawer/panel controls).
- [ ] Any `ActionMenu` usage passes `entityLabel`.
- [ ] `npx tsc -b --force` clean; existing tests pass unchanged.
- [ ] Append a `design-docs/code-map/queue/` entry.

## Dependencies

Task 001 (`entityLabel` prop must exist).

## Map links

- Part: "VoiceLab page components" — `01-map.md`, "The parts"
- Invariant: INV-2, INV-3
- Risk: `none`

## Out of scope

- Any behavioral change to VoiceLab's actual test/build/preview flows — attributes only.
