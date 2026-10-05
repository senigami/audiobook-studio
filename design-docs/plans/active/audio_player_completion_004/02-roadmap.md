# Roadmap

## Dependency graph

```
Workload A                    Workload B                    Workload C
001 (PlayerBar wiring)         003 (characterize)             006 (compute fn)  ─┐ independent
  │                              │                              │               │ of A/B
  ▼                              ▼                              ▼               │
002 (CSS + tests) ──────┐      004 (queue fix, revert-checked)  007 (route)  ────┘
  │                     │        │                                │
  │ owner sign-off A    │        ▼                                │
  ▼                     │      005 (label + spec bump)             │
 (A done)                │        │ owner sign-off B                │
                          │        ▼                                ▼
                          │      (B done)                    008 (frontend seam) ◄── blocked-by 001
                          │                                        │
                          └────────────────────────────────────────┤
                                                                    ▼
                                                              009 (spec sync)
                                                                    │ owner sign-off C
                                                                    ▼
                                                                (C done)
```

- **Workload A** (001 → 002): serial, PlayerBar-only. Can start immediately.
- **Workload B** (003 → 004 → 005): serial, `useChapterPlayback.ts`-only. Can start immediately, fully parallel with Workload A (disjoint files).
- **Workload C backend** (006 → 007): serial, backend-only. Can start immediately, fully parallel with A and B.
- **Workload C frontend** (008): blocked on **001** (needs `TAPE_DURATION_CAP_SEC`) and on **006/007** (needs the sidecar contract + route to exist to test against, though it can be built against the documented contract and verified once 007 lands). Sequence 008 strictly after 001 lands on `PlayerBar.tsx` — do not run 002 and 008 concurrently either, since both touch `PlayerBar.tsx`/its tests; land 002 first, then 008.
- **009** (spec sync): after 006/007/008 are all accepted.

Practical execution order for `plan-run`: dispatch 001, 003, 006 in parallel (three disjoint files) → on 001 accept, dispatch 002 and continue 004 in parallel → on 004 accept dispatch 005 → on 002 accept and 006/007 accept, dispatch 008 → finally 009.

## Workload A — PlayerBar tape wiring

**Sign-off check:** `npm -C frontend run build`/`lint`/`test -- --run` all green. Owner visual sign-off in the running app:
- [ ] Open a chapter under 10 minutes; press `AudioLines` → tape opens (canvas, playhead, minimap, zoom dots, motion toggle) — matches the approved mock feel.
- [ ] Press motion toggle → paged ↔ moving; `prefers-reduced-motion` forces paged and disables the toggle.
- [ ] Drag the minimap window rect → tape jumps; step zoom presets → window resizes, ruler updates.
- [ ] Press `AudioLines` again → tape closes cleanly.
- [ ] Open a clip over 10 minutes → toggle does NOT open a tape (flips wave/bar as before), no crash.

- 001 — PlayerBar wiring (state, toggle, tape render block, motion toggle)
- 002 — Tape CSS + tests (`player.css`, `PlayerBar.test.tsx` additions)

## Workload B — RST-8 segment/block navigation fix

**Sign-off check:** full frontend suite green; task 004's fix verified R1 revert-checked (fails on pre-fix code, stash confirmed). Owner visual sign-off in the running app:
- [ ] Open a chapter with a multi-segment block (same rendered audio spanning 2+ segments) via the Cast tool; play a segment mid-block.
- [ ] Press global Next → advances to the START of the next distinct block (not a restart of the current clip).
- [ ] Press global Prev once → restarts the current block; press Prev again (from the block's start) → jumps to the previous block.
- [ ] The global bar shows a passive "Block N of M" label while segment audio plays.

- 003 — Characterization tests (pins current buggy behavior, no production changes)
- 004 — Block-queue normalization + Prev/Next fix (revert-checked against 003)
- 005 — Block-position label wiring + spec bump

## Workload C — Peaks sidecar (lazy compute-on-request)

**Sign-off check:** `./venv/bin/python -m pytest -q` and full frontend suite green. Owner visual sign-off in the running app:
- [ ] Open (or simulate, via a long test fixture) a chapter over 10 minutes with no existing sidecar → tape still renders; confirm via the network tab that `/assets/peaks` was requested (not a full-WAV browser decode) and that a `.peaks.json` sidecar file now exists next to the WAV.
- [ ] Reload the same chapter → sidecar served without recomputation (confirm via a response-time/log check, not a stopwatch).
- [ ] Re-render that chapter (produce a new WAV) → reopening it recomputes rather than serving the stale sidecar.

- 006 — Backend compute function + stream-info probe helper (pytest)
- 007 — Serving route: compute-on-miss, containment, versioning (pytest)
- 008 — Frontend source-swap seam (`usePeaks` + `PlayerBar.tsx`) — blocked-by 001
- 009 — Spec sync (`data-model.md`, `audio-player.md`)
