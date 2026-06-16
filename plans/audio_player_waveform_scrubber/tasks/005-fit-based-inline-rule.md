# 005 — Fit-based inline rule: fitsLegibly predicate + PlayerBar wiring

status: todo
workload: W1 — Spec rewrite + fit-based inline rule
blocked-by: 004
blocks: 006

## Goal

Implement the `fitsLegibly(durationSec, barWidthPx)` predicate and wire it into `PlayerBar.tsx` as the new representation decision, replacing the current `scope === 'segment'` branch. Measure the scrub track's available width via a `ResizeObserver` so the predicate updates live as the window resizes. Add vitest unit tests that cover the predicate boundaries and the resulting representation choice.

## Why it matters

This is the smallest shippable slice of the waveform redesign: a one-line logic change in the live app, backed by a measured container width, that makes the inline waveform appear for any short/wide clip regardless of scope and disappear for any long/narrow clip regardless of scope. It closes the gap between the rewritten spec (task 004) and the live code, and gates the full tape work (W2) on a clean, tested foundation.

## Files

### Primary changes

- `frontend/src/app/layout/PlayerBar.tsx` — replace line 121 predicate; add `ResizeObserver` measurement for bar width; import `fitsLegibly`.
- `frontend/src/app/layout/playerRepresentation.ts` (**new file**) — export `fitsLegibly`, `PX_PER_SEC_FLOOR`, `DURATION_BOOTSTRAP`. New file keeps the predicate unit-testable in isolation (no React import required in tests).

### Test files

- `frontend/tests/unit/layout/playerRepresentation.test.ts` (**new file**) — vitest unit tests for `fitsLegibly` and the representation choice (see Steps).

### No other files

Do not touch `WaveformStrip.tsx`, `playerBus.ts`, any CSS, any spec, or any backend file. This task is pure frontend, zero backend.

## Target shape / contract

### `playerRepresentation.ts`

```typescript
/** Minimum pixels-per-second required for the inline waveform to read legibly. */
export const PX_PER_SEC_FLOOR = 3; // px/sec

/**
 * Bootstrap duration threshold used before the bar's measured width is known
 * (e.g. on first render / SSR). Below this threshold the waveform is shown;
 * at or above it the bar is shown until a real width measurement arrives.
 */
export const DURATION_BOOTSTRAP = 120; // seconds

/**
 * Returns true when the whole audio clip renders at or above the legibility floor
 * at the given bar width. When barWidthPx is 0 or not yet measured, falls back
 * to a duration-only bootstrap comparison.
 *
 * This predicate is duration-driven and scope-blind: it does not inspect the
 * playerBus `scope` field. A 90-second chapter clip and a 90-second segment clip
 * produce the same result.
 */
export function fitsLegibly(durationSec: number, barWidthPx: number): boolean {
  if (durationSec <= 0) return true;          // zero/unknown duration → show waveform
  if (barWidthPx <= 0) {                      // width not yet measured → bootstrap
    return durationSec <= DURATION_BOOTSTRAP;
  }
  return (barWidthPx / durationSec) >= PX_PER_SEC_FLOOR;
}
```

The shape above is the contract. The implementation may inline constants differently but must export all three names (`fitsLegibly`, `PX_PER_SEC_FLOOR`, `DURATION_BOOTSTRAP`) so tests can import them directly.

### `PlayerBar.tsx` changes

**Line 121 (predicate):**

```typescript
// Before (1.5.0)
const showWave = forceWave ?? (scope === 'segment');

// After (1.6.0 target)
const showWave = forceWave ?? fitsLegibly(duration, measuredWidth);
```

`scope` is **not** read in the representation predicate. The existing `scope` destructure stays (it is used elsewhere for the scope toggle and badge).

**Width measurement — ResizeObserver on the scrub container:**

Add a `measuredWidth` state (`number`, initially `0`) and a ref on the scrub container element. A `ResizeObserver` observes the container and calls `setMeasuredWidth(entry.contentRect.width)` on change. The observer is created and torn down in a `useEffect` keyed on the container ref node. When the element is null the effect is a no-op.

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

Attach `ref={scrubContainerRef}` to the `<div className={...player-scrub...}>` element (the existing wrapper at PlayerBar.tsx:231).

**`forceWave` reset on `requestId`** (PlayerBar.tsx:46–47): unchanged — keep exactly as-is.

**No other structural changes.** The `AudioLines` toggle `onClick` handler at PlayerBar.tsx:257 (`setForceWave(!showWave)`) also stays — in W1 it still only flips the inline representation. Its tape-open behavior is added in W2 task 008.

## Steps

1. Create `frontend/src/app/layout/playerRepresentation.ts` with `fitsLegibly`, `PX_PER_SEC_FLOOR`, and `DURATION_BOOTSTRAP` per the target shape.
2. In `PlayerBar.tsx`:
   a. Import `fitsLegibly` from `./playerRepresentation`.
   b. Add `measuredWidth` state and `scrubContainerRef`.
   c. Add the `ResizeObserver` effect.
   d. Replace line 121 (`const showWave = ...`) with the new predicate.
   e. Attach `ref={scrubContainerRef}` to the scrub wrapper div.
   f. Remove `scope` from the representation predicate (it remains destructured for other uses — do not remove the destructure itself).
3. Create `frontend/tests/unit/layout/playerRepresentation.test.ts` with the tests described below.
4. Run `npm -C frontend run test -- --run frontend/tests/unit/layout/playerRepresentation.test.ts` and confirm green.
5. Run `npm -C frontend run lint` on changed files; fix any findings.
6. Run `npm -C frontend run build` and confirm clean.
7. R1 revert-check: stash the `playerRepresentation.ts` implementation (keep the test), run the test — confirm it fails for the right reason (predicate not exported / wrong return value). Restore.

## Tests (`frontend/tests/unit/layout/playerRepresentation.test.ts`)

Tests assert **observable behavior** (what representation the predicate selects), not re-implemented math. They import `fitsLegibly`, `PX_PER_SEC_FLOOR`, and `DURATION_BOOTSTRAP` directly so there is no React setup required.

```
describe('fitsLegibly — predicate boundaries')

  short clip, wide bar → waveform
    fitsLegibly(10, 600) → true
    (60 px/sec >> 3 px/sec floor; a 10-second clip is always legible at normal width)

  long clip, wide bar → bar
    fitsLegibly(600, 600) → false
    (1 px/sec < 3 px/sec floor; a 10-minute clip does not fit legibly at 600 px)

  clip at exactly the floor → waveform (boundary: >= not >)
    fitsLegibly(200, 600) → true
    (600 / 200 === 3.0 === PX_PER_SEC_FLOOR; exactly at the floor is legible)

  clip just over the floor → bar
    fitsLegibly(201, 600) → false
    (600 / 201 ≈ 2.99 < 3; one second over the boundary collapses to bar)

  zero/unknown duration → waveform (defensive: unknown duration shows waveform)
    fitsLegibly(0, 600) → true

describe('fitsLegibly — bootstrap (unmeasured width)')

  short clip, no width → waveform (within bootstrap threshold)
    fitsLegibly(DURATION_BOOTSTRAP - 1, 0) → true

  clip at bootstrap threshold → waveform (boundary: <= not <)
    fitsLegibly(DURATION_BOOTSTRAP, 0) → true

  long clip, no width → bar (exceeds bootstrap threshold)
    fitsLegibly(DURATION_BOOTSTRAP + 1, 0) → false

describe('fitsLegibly — scope-blind property')

  same duration + width, scope irrelevant (predicate takes no scope arg)
    Both fitsLegibly(90, 600) calls return the same value regardless of
    what scope the bus happens to be in. Assert it returns true (270/600 > 3).
    (This is a documentation test: verifying the function signature has no scope
    parameter and returns consistently is sufficient.)

describe('representation choice — integration')

  // These tests simulate what PlayerBar does, verifying the integration contract
  // without mounting React. They use fitsLegibly directly.

  forceWave=true overrides regardless of fit
    // Even a long clip (fitsLegibly → false) should show waveform when forced
    const shows = true ?? fitsLegibly(600, 600);  // true
    expect(shows).toBe(true);

  forceWave=false overrides regardless of fit
    const shows = false ?? fitsLegibly(10, 600);  // false
    expect(shows).toBe(false);

  forceWave=null defers to predicate (short clip → waveform)
    const shows = null ?? fitsLegibly(10, 600);  // true
    expect(shows).toBe(true);

  forceWave=null defers to predicate (long clip → bar)
    const shows = null ?? fitsLegibly(600, 600);  // false
    expect(shows).toBe(false);
```

No React Testing Library, no component mount — these are pure function tests. Use `describe` + `it`/`test` with `expect`.

**R1 note:** the tests above are feature tests (not bug-fix tests), so R1's "must fail pre-fix" requirement applies as: the test file must fail (import error or assertion failure) when `playerRepresentation.ts` does not exist or exports a stub. Verify this before merging.

## Acceptance criteria

- `frontend/src/app/layout/playerRepresentation.ts` exists and exports `fitsLegibly`, `PX_PER_SEC_FLOOR`, `DURATION_BOOTSTRAP`.
- `PlayerBar.tsx` line ~121: `const showWave = forceWave ?? fitsLegibly(duration, measuredWidth)` (no `scope` reference in this expression).
- `PlayerBar.tsx` has a `ResizeObserver` effect measuring the scrub container; `measuredWidth` state is initialized to `0`.
- `forceWave` state and reset-on-`requestId` effect (PlayerBar.tsx:46–47) are **unchanged**.
- `frontend/tests/unit/layout/playerRepresentation.test.ts` exists and all tests pass.
- R1 revert-check performed and documented: tests fail when `playerRepresentation.ts` is absent/stubbed.
- `npm -C frontend run test -- --run frontend/tests/unit/layout/playerRepresentation.test.ts` exits 0.
- `npm -C frontend run lint` clean on all changed files.
- `npm -C frontend run build` exits 0 with no TypeScript errors.
- The single-owner grep (`grep -rn "<audio\|new Audio(" frontend/src`) still matches only `PlayerBar.tsx` and recording-capture components — no new audio owners introduced.

## Out of scope

- The expanded tape (open/close via `AudioLines` toggle in bar mode) — W2 task 008.
- The duration cap guard on the tape offer — W2 task 008.
- The `WaveformTape` component — W2 task 006.
- Zoom presets and minimap — W2 task 007.
- Any CSS changes beyond what TypeScript needs (no new classNames in this task).
- Any change to `playerBus.ts`, `WaveformStrip.tsx`, or any backend file.
- Any spec edit — that is task 004.

## References

- `plans/audio_player_scrubbing_waveform_proposal.md` §§2, 6, 8 (state model and Phase 1 description)
- `plans/audio_player_waveform_scrubber/00-audit-report.md` §A (verified line numbers: predicate at PlayerBar.tsx:121, `forceWave` at :46–47, `duration` on bus at playerBus.ts:26)
- `plans/audio_player_waveform_scrubber/01-roadmap.md` — task 005 description
- `docs/specs/audio-player.md` 1.6.0 (target spec, authored in task 004)
- `frontend/src/app/layout/PlayerBar.tsx` — current source (266 lines; scrub wrapper at :231, toggle at :254–262)
- `frontend/src/store/playerBus.ts:26` — `duration: number` field (seconds) confirmed present
- `docs/specs/testing-standards.md` — R1 (revert-check), R2 (mock only outside the unit), R4 (no sleep-based timing)
