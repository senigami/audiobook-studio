Status: complete — 2026-07-10 (owner sign-off pending, see `../02-roadmap.md` Workload A)

# 001 — Wire the tape into PlayerBar

Workload: A · DONE.

Wired `WaveformTape` into `frontend/src/app/layout/PlayerBar.tsx`: new `TAPE_DURATION_CAP_SEC = 600` export, `tapeOpen`/`windowSec`/`tapeMode` state, three-state toggle on the existing `AudioLines` button, a `.player-tape-region` render block (inline null-check pattern, no `peaks` prop passed — `WaveformTape` decodes internally), and a motion-toggle button disabled under `prefers-reduced-motion`. Build/lint clean; single-`<audio>`-owner invariant reverified with a corrected grep.

Deviation: `prefersReducedMotion` uses a `useState` lazy initializer instead of a bare `useRef(...).current` read in render (the spec's literal snippet trips this repo's `react-hooks/refs` lint rule) — same "compute once at mount" semantics.

Remaining: owner visual sign-off (tape open/close, zoom, minimap, motion toggle, reduced-motion) — tracked in `../02-roadmap.md`, not here.

See `status.json` for commit `2416bed6`.
