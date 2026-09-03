Status: complete — 2026-07-10 (owner sign-off pending, see `../02-roadmap.md` Workload C)

# 008 — Frontend peaks source-swap seam

Workload: C · DONE.

Extended `WaveformTape.tsx`'s `usePeaks` with an optional `suppliedPeaks` param — when non-empty, skips the internal fetch+decode entirely (existing callers passing nothing are unaffected); threaded `WaveformTape`'s existing `peaks` prop through to it so a supplied array suppresses the decode, not just feeds the minimap. Added `frontend/src/api/contracts/peaksSidecar.ts` (`parsePeaksSidecar`, validates `version === 1` and `[0,1]`-range values) and `frontend/src/api/fetchPeaksSidecar.ts` (`derivePeaksUrl` + fetch, `null` on any non-chapter-asset URL shape or failure). Wired a `sidecarPeaks` state + fetch effect into `PlayerBar.tsx` (after task 001's state), gated to `duration > TAPE_DURATION_CAP_SEC`, with mid-flight `requestId`-bump cancellation; `tapeAvailable` now also allows the over-cap case when a sidecar is present. No windowing/virtualization added (verified false premise, per `00-overview.md`).

Remaining: owner visual sign-off (a real/fixture long chapter renders the tape from the sidecar, confirmed via network tab) — tracked in `../02-roadmap.md`, not here.

See `status.json` for commit `96d8313f`.
