# Task 001 — Add `'book'` scope to the player bus

Status: complete — 2026-07-09

## Goal

Add `'book'` as a valid `PlayerScope` value so a "Continue Listening" caller (Task 006) can load an assembled audiobook file into the existing global player bar, without inventing new player infrastructure.

## Why it matters

`frontend/src/store/playerBus.ts` already drives the persistent `PlayerBar` for chapter/segment/preview playback. It is scope-agnostic — nothing branches on the scope string — so this is a pure additive type change with zero runtime risk, and it's what makes Task 006 nearly free.

## Exact files

- `frontend/src/store/playerBus.ts` — the only file that needs a change.

## Target contract

Current (line 7):
```ts
export type PlayerScope = 'segment' | 'chapter' | 'preview';
```

Change to:
```ts
export type PlayerScope = 'segment' | 'chapter' | 'preview' | 'book';
```

No other change in this file. `LoadAndPlayOptions` (line 22) and every function signature already accept any `PlayerScope` value generically — nothing else needs editing here.

## Pattern to imitate

None needed — this is a one-line union-type extension, not new logic.

## Steps

- [x] Change the `PlayerScope` type union in `frontend/src/store/playerBus.ts:7` as shown above.
- [x] Re-run the grep from `01-map.md`'s INV-1 to confirm no scope-branching exists that this addition would need to touch: `grep -n "scope ===" frontend/src/app/layout/PlayerBar.tsx frontend/src/app/layout/playerRepresentation.ts` — expected: no output. If this now returns matches (code has changed since this plan was written), stop and re-scope this task — it means the bus is no longer scope-agnostic and this task needs to account for that branching.
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] `PlayerScope` includes `'book'`.
- [x] `npx tsc -p tsconfig.json --noEmit` (from `frontend/`) is clean.
- [x] `npm -C frontend run test -- --run` — no test regressions (there should be no existing test asserting the literal `PlayerScope` union is exhaustive of exactly 3 values; if one exists, update it in this same task).
- [x] The grep above returns no output, or the task has been stopped and re-scoped per the step above.

## Dependencies

None — foundation task, parallel-safe with 002 and 005.

## Map links

- Part: **Player bus** (`01-map.md` — The parts)
- Invariant: **INV-1** (no scope branching in shared components)
- Risk: `none`

## Out of scope

- Building the Continue Listening card itself (Task 006).
- Any change to `PlayerBar.tsx` or `playerRepresentation.ts` — this task should require zero edits to either file.
