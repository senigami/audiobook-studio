Status: complete — 2026-07-10

# 002 — Tape CSS + PlayerBar tests

Workload: A · Risk: `multi-file` · Blocked-by: 001 · Blocks: none (Workload A done after this)

## Goal

(1) Add the expanded-tape CSS to `frontend/src/theme/components/player.css`. (2) Add the two genuinely-new tests (tape open/close, duration-cap guard) to the existing `frontend/tests/unit/app/layout/PlayerBar.test.tsx`.

**This task replaces** `design-docs/plans/active/audio_player_waveform_scrubber/tasks/009-tape-css-and-tests.md` — that draft guessed wrong class names and proposed a new test directory/file that would duplicate existing coverage. Do not read it as a spec.

## Why it matters

The CSS makes the bar actually grow upward when the tape opens. The two new tests are the only genuinely-missing coverage — task 001's behavior (toggle → tape open/close, cap guard) has no test today because the state/markup didn't exist until 001.

## Map links

See `../01-map.md` — Parts: `player.css`. Invariants: INV-7 (token-only styling, light+dark parity).

## Files

### Edit

- `frontend/src/theme/components/player.css` — the file the styling-separation split moved all player CSS into (the old monolithic `components.css` no longer exists — do not reference it or grep for it).
- `frontend/tests/unit/app/layout/PlayerBar.test.tsx` — already has a wavesurfer mock and `AudioLines`/`showWave` coverage; add 2 new test cases here, not a new file.

### Do NOT create

- `frontend/tests/unit/player/` — wrong location. This repo's test-location convention mirrors source (`frontend/tests/unit/app/layout/` mirrors `frontend/src/app/layout/`).
- A new `PlayerBarTape.test.tsx` or `WaveformTape.test.tsx` under `frontend/tests/unit/player/` — 4 of the originally-envisioned 6 tests for this workload **already exist and pass**:
  - `frontend/tests/unit/app/layout/WaveformTape.test.tsx` already covers reduced-motion-forces-paged and fixed-grid-sampling-stability.
  - `frontend/tests/unit/app/layout/WaveformTapeZoom.test.tsx` and `WaveformTapeMinimap.test.tsx` each already have a single-owner-invariant DOM-based test.
  Do not recreate any of these.

## Target shape / contract

### CSS additions (`player.css`)

Confirm no name collision first: `grep -n 'tape-\|ns-size\|player-tape' frontend/src/theme/components/player.css` (expect zero hits today). Append after the existing player rules.

Real class names to style — verified against the actual shipped components (not the superseded draft's guesses):

| Component | Real selector(s) |
|---|---|
| `WaveformTape.tsx` root | `.tape` |
| `WaveformTape.tsx` svg canvas | `.tape-canvas` |
| `WaveformTape.tsx` ruler / tick | `.tape-ruler` / `.tape-tick` |
| `WaveformTape.tsx` playhead line | *(no className today — styled via inline SVG attributes; if visual polish genuinely requires a class, adding one to the component is a small in-scope addition here — note it in this task's own changelog if you do)* |
| `WaveformTapeMinimap.tsx` root | `.nsp-minimap` |
| `WaveformTapeMinimap.tsx` bar/window/playhead | `.tape-minimap-bar`, `.tape-minimap-window`, `.tape-minimap-playhead` |
| `WaveformTapeZoom.tsx` root | `.ns-size-control` |
| `WaveformTapeZoom.tsx` buttons | `.ns-size-glyph.tape-zoom-glyph-hit` |
| `WaveformTapeZoom.tsx` slider parts | `.ns-size-slider-wrap`, `.ns-size-track`, `.ns-size-tick.tape-zoom-dot` (`--disabled`/`--active` modifiers), `.ns-size-slider.tape-zoom-slider-hit` |

Port the base `.ns-size-*` rules (track/slider/tick chrome) from `frontend/src/demo/stages/siteMockup/mockup.css` (confirmed real there, confirmed **not yet** in the live stylesheet — verify with `grep -n 'ns-size' frontend/src/theme/components/*.css` returning nothing before you start) into `player.css`. These are new to the live stylesheet, not a rename of something existing.

New, non-colliding classes to add (verified zero existing hits across the current 11-file component CSS split):
- `.player-tape-region` — the grow-upward flex child. `width: 100%; height: ~120px (min 96, max 180); overflow: hidden; display: flex; flex-direction: column; border-top: 1px solid var(--border); background: var(--surface);` with a short open animation (`@media (prefers-reduced-motion: reduce)` → `animation: none`).
- `.tape-footer` — flex row for minimap + zoom + motion toggle.
- `.tape-motion-toggle` — `min-width/min-height: 44px` (touch target), `:disabled` dimmed.

**INV-7 compliance:** every color/spacing value in the new rules must be `var(--token)` — e.g. borders use `var(--border)`, backgrounds use `var(--surface)`/`var(--surface-alt)`, accents use `var(--accent)` or `var(--color-wave-cursor, var(--accent))` (both tokens already exist in `frontend/src/theme/tokens.css` with light+dark values — verify, don't assume). No hardcoded hex/rgb.

### New tests (add to `frontend/tests/unit/app/layout/PlayerBar.test.tsx`)

Reuse the file's existing wavesurfer mock and render setup — do not add a fresh mock scaffold.

**Test A — Toggle opens/closes the tape (under cap):**
```
Render <PlayerBar />; drive the bus to duration=300 (mock loadedmetadata).
Click the element with aria-label "Open tape view".
Assert document.querySelector('.player-tape-region') is not null.
Click again (aria-label now "Close tape view").
Assert document.querySelector('.player-tape-region') is null.
```

**Test B — Duration cap guard (over cap → tape never offered):**
```
Render <PlayerBar />; drive the bus to duration=900 (> TAPE_DURATION_CAP_SEC).
Click the AudioLines toggle.
Assert document.querySelector('.player-tape-region') is null.
Assert the toggle's aria-label is NOT "Open tape view" (it's the representation-flip label).
Import TAPE_DURATION_CAP_SEC from '../../../../src/app/layout/PlayerBar' (or wherever it's
exported) to avoid hardcoding 600 in the test.
```

Per `design-docs/specs/testing-standards.md`: R2 (mock only outside the unit — the wavesurfer mock is legitimate, `window.matchMedia`/`HTMLAudioElement` mocks are legitimate, do not mock `playerBus` internals — drive it via `loadAndPlay`/`resetPlayerBusForTests`), R4 (no sleep-based timing — use `waitFor`/fake timers).

## Steps

- [x] Grep for CSS name collisions (see above) — confirm none.
- [x] Add the CSS rules to `player.css`, INV-7-compliant.
- [x] Add Test A and Test B to `PlayerBar.test.tsx`.
- [x] Run `npm -C frontend run test -- --run frontend/tests/unit/app/layout/PlayerBar.test.tsx` — confirm both new tests pass and no existing test regressed.
- [x] `npm -C frontend run build` — confirm no CSS parse errors.
- [x] `npm -C frontend run lint`.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] `.player-tape-region` renders at the specified height, above `.player-bar-content` (bar grows upward).
- [x] Every new CSS rule uses `var(--token)` — no hardcoded color/spacing literal (INV-7). Confirmed every token referenced (`--border`, `--surface`, `--surface-alt`, `--accent`, `--text-muted`, `--shadow-sm`, `--dur-fast`, `--ease-standard`, `--type-caption`) exists in `tokens.css` with both light and dark values; did not spot-check the running app visually (no dev server available in this session) — flagged for owner visual sign-off below.
- [x] No existing class name in `frontend/src/theme/components/*.css` is collided or overwritten (confirmed via grep before editing; verified no duplicate rule blocks after).
- [x] Both new tests pass; full `PlayerBar.test.tsx` suite stays green (19/19); no test was added under `frontend/tests/unit/player/`.
- [x] `npm -C frontend run build`/`lint`/`test -- --run` all green for the touched scope. NOTE: the full untargeted `npm -C frontend run test -- --run` has pre-existing failures unrelated to this task (see changelog-queue entry / implementer report) — window.matchMedia is unmocked in several other test files (App.test.tsx, Layout.test.tsx, Navigation.test.tsx, BookIdentityLine.test.tsx) that mount PlayerBar, a regression from task 001 landing that predates this task and lives outside this task's allowed file scope; and `useChapterPlayback`/CastTool test failures belong to a separate concurrently-in-progress task (004/005) lane. Confirmed via `git stash` that both failure classes exist identically on the pre-task-002 tree.
- [ ] **Owner sign-off** (recorded in `../02-roadmap.md`'s Workload A checklist): visual feel matches the approved mock in both light and dark themes. — pending, needs a human/visual pass.
