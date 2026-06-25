# 005 — Scope-agnostic live player

status: todo
workload: W1 — Spec 1.6.0 + scope-agnostic live player
blocked-by: 004
blocks: 006

## Goal

Two tightly-coupled changes that together make the live `PlayerBar` match `audio-player.md` 1.6.0:

**(a) Duration-driven representation.** Implement `fitsLegibly(durationSec, barWidthPx)` and replace `PlayerBar.tsx:121` — `const showWave = forceWave ?? (scope === 'segment')` — with `const showWave = forceWave ?? fitsLegibly(duration, measuredWidth)`. Measure the scrub container's width live via `ResizeObserver`.

**(b) Remove the scope toggle entirely.** Per spec §2.1/§2.2 (1.6.0), `altScope` and `switchScope` are retired. Delete the `altScope` field and `AltScope` type from `playerBus.ts`, remove `switchScope` from `playerBus.ts`, remove the `altScope` option from `LoadAndPlayOptions`, remove the `player-scope-toggle` / `player-scope-pill` / `player-scope-badge` UI block and `player-scope-*` CSS from `PlayerBar.tsx` and `components.css`, stop adapters registering `altScope`. Time display stays `position / duration` — no segment-relative special-casing (already the case; verify and document).

After both changes: no scope toggle renders anywhere; no `altScope`/`switchScope` exists in the bus; representation defaults by duration; vitest green; build + eslint clean.

## Why it matters

The spec (1.6.0) is already authoritative and was written clean. The live player still ships the older scope-driven predicate and the segment/chapter toggle. This task closes that spec-ahead-of-code gap for W1. It is the smallest shippable W1 slice and the prerequisite for every W2 task.

## Files

### Primary changes

- `frontend/src/store/playerBus.ts` — remove `AltScope` type, `altScope` field from `PlayerBusState`, `altScope` option from `LoadAndPlayOptions`, and the `switchScope()` function (currently at `:125`). Remove `switchScope` from all exports. `resetPlayerBusForTests` at `:210` stays.
- `frontend/src/app/layout/PlayerBar.tsx` — (a) replace line 121 predicate; add `ResizeObserver` + `measuredWidth` state; import `fitsLegibly`; (b) remove the `altScope` / `switchScope` destructure, remove the scope-toggle block (lines ~199–224), remove `player-scope-*` CSS classes from JSX; remove `switchScope` import.
- `frontend/src/app/layout/playerRepresentation.ts` (**new file**) — export `fitsLegibly`, `PX_PER_SEC_FLOOR`, `DURATION_BOOTSTRAP`. Keeps the predicate unit-testable in isolation (no React import required in tests).
- `frontend/src/theme/components.css` — delete the `.player-scope-toggle`, `.player-scope-pill`, `.player-scope-pill--active`, `.player-scope-badge` rules (currently in the player section, exact line range to confirm by grep before editing).

### Adapter cleanup (stop registering altScope)

Search for `altScope` in `frontend/src/` and remove from any `loadAndPlay(...)` call that passes it. The callers currently passing `altScope` are the Studio VCR adapter and the chapter inline player. Simply omit the field — each adapter loads its own audio directly; no behavioral regression.

### Test files

- `frontend/tests/unit/layout/playerRepresentation.test.ts` (**new file**) — pure-function vitest tests for `fitsLegibly` (see Steps). No React setup, no component mount.

### No other files

Do not touch `WaveformStrip.tsx`, any spec, or any backend file. This task is pure frontend.

## Target shape / contract

### `playerRepresentation.ts`

```typescript
/** Minimum pixels-per-second required for the inline waveform to read legibly. */
export const PX_PER_SEC_FLOOR = 3; // px/sec

/**
 * Bootstrap duration threshold used before the bar's measured width is known
 * (e.g. on first render). Below this threshold the waveform is shown; at or
 * above it the bar is shown until a real width measurement arrives.
 */
export const DURATION_BOOTSTRAP = 120; // seconds

/**
 * Returns true when the whole audio clip renders at or above the legibility floor
 * at the given bar width. When barWidthPx is 0 or not yet measured, falls back
 * to a duration-only bootstrap comparison.
 *
 * Duration-driven and scope-blind: does not inspect playerBus `scope`.
 * A 90-second chapter clip and a 90-second segment clip produce the same result.
 */
export function fitsLegibly(durationSec: number, barWidthPx: number): boolean {
  if (durationSec <= 0) return true;          // zero/unknown duration → show waveform
  if (barWidthPx <= 0) {                      // width not yet measured → bootstrap
    return durationSec <= DURATION_BOOTSTRAP;
  }
  return (barWidthPx / durationSec) >= PX_PER_SEC_FLOOR;
}
```

All three names (`fitsLegibly`, `PX_PER_SEC_FLOOR`, `DURATION_BOOTSTRAP`) must be exported so tests import them directly.

### `playerBus.ts` — state shape after removal

Remove from `PlayerBusState`:
```typescript
// DELETE:
altScope?: AltScope;
```

Remove entirely:
```typescript
// DELETE the AltScope interface (lines 9–15)
// DELETE switchScope() function (lines 125–146)
// DELETE altScope from LoadAndPlayOptions (line 37–38)
// DELETE altScope from setState call in loadAndPlay (line 108)
// DELETE altScope from IDLE_STATE (line 56)
```

`scope` stays in `PlayerBusState` — it is still informational (for adapters, titling, sequencing). It MUST NOT drive the representation predicate after this task.

### `PlayerBar.tsx` — predicate change (line 121)

```typescript
// Before (1.5.x)
const showWave = forceWave ?? (scope === 'segment');

// After (1.6.0 target)
const showWave = forceWave ?? fitsLegibly(duration, measuredWidth);
```

`scope` remains in the bus destructure (still informational) but is not read in the predicate.

### `PlayerBar.tsx` — ResizeObserver (new, near line 46)

```typescript
const [measuredWidth, setMeasuredWidth] = useState<number>(0);
const scrubContainerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = scrubContainerRef.current;
  if (!el) return;
  const ro = new ResizeObserver(entries => {
    const w = entries[0]?.contentRect.width ?? 0;
    setMeasuredWidth(w);
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []); // empty deps — ref node is stable after mount
```

Attach `ref={scrubContainerRef}` to the `<div className={...player-scrub...}>` element (currently at line 231).

### `PlayerBar.tsx` — scope-toggle removal (lines ~199–224)

Delete the entire block:
```tsx
{scope && altScope ? (
  <div className="player-scope-toggle" role="group" aria-label="Audio scope">
    <button ... onClick={switchScope} ...>{scope}</button>
    <button ... onClick={switchScope} ...>{altScope.scope}</button>
  </div>
) : (
  scope && <span className="player-scope-badge">{scope}</span>
)}
```

Replace with nothing (the title/subtitle area already carries a passive label when needed).

### `PlayerBar.tsx` — existing behavior preserved

- `forceWave` state and reset-on-`requestId` effect (lines 46–47): **unchanged**.
- `AudioLines` toggle `onClick` handler (line 257, `setForceWave(!showWave)`): stays in W1; tape-open behavior added in task 008.
- `position / duration` time display: already scope-agnostic — verify and leave as-is.

## Steps

1. Create `frontend/src/app/layout/playerRepresentation.ts` with `fitsLegibly`, `PX_PER_SEC_FLOOR`, and `DURATION_BOOTSTRAP` per the target shape.
2. In `playerBus.ts`:
   a. Delete the `AltScope` interface.
   b. Remove `altScope` from `PlayerBusState`, `LoadAndPlayOptions`, `IDLE_STATE`, and the `setState` call inside `loadAndPlay`.
   c. Delete the `switchScope()` function.
   d. Remove `switchScope` from all imports/exports.
3. In `PlayerBar.tsx`:
   a. Import `fitsLegibly` from `./playerRepresentation`.
   b. Remove `switchScope` and `altScope` from the import/destructure.
   c. Add `measuredWidth` state and `scrubContainerRef`.
   d. Add the `ResizeObserver` effect.
   e. Replace line 121 predicate.
   f. Attach `ref={scrubContainerRef}` to the scrub wrapper div.
   g. Delete the scope-toggle JSX block.
4. In `components.css`: grep for `.player-scope-` and delete all matching rule blocks.
5. Grep `frontend/src/` for `altScope` — remove from any remaining `loadAndPlay` call.
6. Create `frontend/tests/unit/layout/playerRepresentation.test.ts` with the tests below.
7. Run `npm -C frontend run test -- --run frontend/tests/unit/layout/playerRepresentation.test.ts` — confirm green.
8. Run `npm -C frontend run lint` on all changed files; fix any findings.
9. Run `npm -C frontend run build` — confirm clean TypeScript.
10. R1 revert-check: remove the implementation from `playerRepresentation.ts` (keep the test), run the test — confirm it fails for the right reason. Restore.
11. Verify in the running app: no scope toggle visible; short clip shows waveform; long clip shows bar; `AudioLines` toggle still flips bar/wave (tape-open behavior deferred to task 008).

## Tests (`frontend/tests/unit/layout/playerRepresentation.test.ts`)

Pure-function tests — no React setup. Import `fitsLegibly`, `PX_PER_SEC_FLOOR`, `DURATION_BOOTSTRAP` directly.

```
describe('fitsLegibly — predicate boundaries')

  short clip, wide bar → waveform
    fitsLegibly(10, 600) → true
    (60 px/sec >> 3 px/sec floor)

  long clip, wide bar → bar
    fitsLegibly(600, 600) → false
    (1 px/sec < 3 px/sec floor)

  clip at exactly the floor → waveform (boundary: >= not >)
    fitsLegibly(200, 600) → true
    (600 / 200 === 3.0 === PX_PER_SEC_FLOOR; exactly at the floor is legible)

  clip just over the floor → bar
    fitsLegibly(201, 600) → false
    (600 / 201 ≈ 2.99 < 3)

  zero/unknown duration → waveform (defensive)
    fitsLegibly(0, 600) → true

describe('fitsLegibly — bootstrap (unmeasured width)')

  short clip, no width → waveform (within bootstrap threshold)
    fitsLegibly(DURATION_BOOTSTRAP - 1, 0) → true

  clip at bootstrap threshold → waveform (boundary: <=)
    fitsLegibly(DURATION_BOOTSTRAP, 0) → true

  long clip, no width → bar (exceeds bootstrap)
    fitsLegibly(DURATION_BOOTSTRAP + 1, 0) → false

describe('fitsLegibly — scope-blind property')

  same duration + width, no scope argument
    fitsLegibly(90, 600) → true (both calls return the same value; function
    signature has no scope parameter — this is a documentation assertion)

describe('representation choice — integration (forceWave override)')

  forceWave=true overrides regardless of fit
    true ?? fitsLegibly(600, 600) → true

  forceWave=false overrides regardless of fit
    false ?? fitsLegibly(10, 600) → false

  forceWave=null defers to predicate (short clip → waveform)
    null ?? fitsLegibly(10, 600) → true

  forceWave=null defers to predicate (long clip → bar)
    null ?? fitsLegibly(600, 600) → false

describe('scope toggle removal — bus contract')

  switchScope is not exported from playerBus.ts
    import * as bus from '@/store/playerBus';
    expect('switchScope' in bus).toBe(false);

  altScope is not present on the bus snapshot
    resetPlayerBusForTests(); loadAndPlay({ scope: 'chapter', ... });
    const snap = getSnapshot();
    expect('altScope' in snap).toBe(false);
```

R1 note: the feature tests must fail (import error or assertion failure) when `playerRepresentation.ts` is absent. Verify before merging.

## Acceptance criteria

- `frontend/src/app/layout/playerRepresentation.ts` exists and exports `fitsLegibly`, `PX_PER_SEC_FLOOR`, `DURATION_BOOTSTRAP`.
- `PlayerBar.tsx` line ~121: `const showWave = forceWave ?? fitsLegibly(duration, measuredWidth)` — no `scope` reference in this expression.
- `PlayerBar.tsx` has a `ResizeObserver` effect measuring the scrub container; `measuredWidth` state is initialized to `0`.
- `forceWave` state and reset-on-`requestId` effect (PlayerBar.tsx:46–47) are **unchanged**.
- `playerBus.ts`: `altScope` field, `AltScope` type, and `switchScope()` are **gone**. `scope` field remains informational.
- No `player-scope-toggle`, `player-scope-pill`, or `player-scope-badge` elements render in `PlayerBar.tsx`.
- No `.player-scope-*` rules remain in `components.css`.
- No `altScope` key passed in any `loadAndPlay` call across `frontend/src/`.
- `frontend/tests/unit/layout/playerRepresentation.test.ts` exists and all tests pass.
- R1 revert-check performed: tests fail when `playerRepresentation.ts` is absent/stubbed.
- `npm -C frontend run test -- --run frontend/tests/unit/layout/playerRepresentation.test.ts` exits 0.
- `npm -C frontend run lint` clean on all changed files.
- `npm -C frontend run build` exits 0 with no TypeScript errors.
- Single-owner grep (`grep -rn "<audio\|new Audio(" frontend/src`) still matches only `PlayerBar.tsx` and recording-capture components — no new audio owners introduced.

## Out of scope

- `WaveformTape` component — task 006.
- Tape open/close via `AudioLines` toggle — task 008.
- Duration cap guard — task 008.
- Zoom presets and minimap — tasks 007.
- Any CSS beyond removing `player-scope-*` rules.
- Any backend file.
- Any spec edit — that is task 004 (done).

## References

- `design-docs/specs/audio-player.md` 1.6.0 — §2.1 bus state (scope informational, altScope/switchScope retired), §2.2 bus API (switchScope removed), §3 (no scope toggle; duration-driven representation)
- `design-docs/plans/audio_player_waveform_scrubber/00-audit-report.md` — §A (verified line numbers: predicate at `PlayerBar.tsx:121`; `altScope` destructure at `:40`; scope toggle block at `:199–224`; toggle button at `:254–262`); Reconciliation update (altScope/switchScope retire in W1)
- `design-docs/plans/audio_player_waveform_scrubber/01-roadmap.md` — W1 task 005 description; sign-off check
- `frontend/src/store/playerBus.ts` — `switchScope` at `:125`; `AltScope` at `:9`; `altScope` in state at `:23`; `resetPlayerBusForTests` at `:210`
- `frontend/src/app/layout/PlayerBar.tsx` — 266 lines; predicate at `:121`; scope toggle block at `:199–224`; scrub wrapper at `:231`; toggle button at `:254–262`
- `design-docs/specs/testing-standards.md` — R1 (revert-check), R2 (mock only outside the unit), R4 (no sleep-based timing)
