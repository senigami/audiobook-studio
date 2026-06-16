# 012 — Frontend source-swap, cap lift, and virtualized rendering

status: todo
workload: W3 — Peaks sidecar (backend) — later
blocked-by: 011
blocks: none

## Goal

Wire `PlayerBar` and `WaveformTape` to the backend peaks sidecar when one exists for the loaded audio URL, lifting the duration cap for sidecared clips. Add windowed/virtualized rendering to `WaveformTape` so the hour-long case remains performant. The W2 UI is unchanged — this is a peaks-source swap and a performance layer, not a visual rebuild.

## Why it matters

Tasks 010 and 011 together create the seam (frontend accepts supplied peaks; backend emits them). This task closes the loop: the frontend fetches the sidecar when available, passes it through the 010 seam, and lifts the cap. Without it, W3 never ships end-to-end.

Virtualized rendering is required for the hour case: a 3600-second clip at 1000 peaks/sec would be 3.6 million DOM operations without windowing. Drawing only the visible page ± one buffer page keeps the tape smooth at any zoom level.

## Files

### Sidecar fetch
- `frontend/src/api/` — add `fetchPeaksSidecar(audioUrl: string): Promise<PeaksData | null>` (maps audio URL to the `/api/artifacts/peaks` route; returns null on 404)
- `frontend/src/api/contracts/` — add `PeaksData` type matching the sidecar JSON shape from 011

### PlayerBar wiring
- `frontend/src/app/layout/PlayerBar.tsx` — fetch sidecar on new source (`requestId` effect); pass `peaks`/`peaksDuration` to `WaveformTape` and `WaveformStrip`; lift cap for clips that have a sidecar

### WaveformTape windowing
- `frontend/src/components/WaveformTape.tsx` — add windowed/virtualized rendering: compute the visible peak slice for the current zoom page ± one buffer page; hand only that slice to wavesurfer for rendering

### Tests
- `frontend/tests/unit/api/fetchPeaksSidecar.test.ts` — 200 with valid JSON; 404 returns null; non-JSON response returns null
- `frontend/tests/unit/layout/PlayerBar.peaks.test.tsx` — (a) sidecar present: peaks + duration props flow to `WaveformTape`; cap guard lifted; (b) sidecar absent: props are undefined, cap guard active; (c) new source (`requestId` bump) cancels in-flight fetch and resets peaks state
- `frontend/tests/unit/components/WaveformTape.virtualization.test.tsx` — rendered peak slice matches expected window ± buffer at several zoom levels; no peaks outside the visible + buffer range are passed to wavesurfer
- `tests/api/test_peaks_route.py` (already written in 011) — integration: round-trip from assembly → sidecar on disk → route returns JSON

## Target shape / contract

### `PeaksData` type

```ts
// frontend/src/api/contracts/peaksData.ts
export interface PeaksData {
  peaks: number[];       // float32 [-1, 1]
  duration: number;      // seconds
  sample_rate: number;
  channels: number;
  num_peaks: number;
}
```

### Sidecar fetch

```ts
// frontend/src/api/fetchPeaksSidecar.ts
export async function fetchPeaksSidecar(audioUrl: string): Promise<PeaksData | null>
```

Maps `audioUrl` (the WAV URL already in the player bus) to the peaks route. The mapping must be defensive: if `audioUrl` does not contain the expected project/chapter/segment path structure, return null immediately (no request). On a 404 or any network error, return null — browser decode is the fallback.

### `PlayerBar` sidecar effect

```ts
// inside PlayerBar.tsx — new effect keyed on requestId
useEffect(() => {
  let cancelled = false;
  setPeaksData(null);                       // reset on new source
  if (!audioUrl) return;
  fetchPeaksSidecar(audioUrl).then(data => {
    if (!cancelled) setPeaksData(data);
  });
  return () => { cancelled = true; };
}, [requestId, audioUrl]);
```

`peaksData` is local state (`useState<PeaksData | null>(null)`). It is reset to `null` whenever `requestId` changes (new source), so a stale sidecar from a previous clip never leaks to the next.

### Duration cap logic (in `PlayerBar`)

Current W2 cap (Task 008): `duration > TAPE_CAP_SEC → do not offer tape`.

New W3 logic:

```ts
const hasSidecar = peaksData !== null;
const tapeAvailable = duration <= TAPE_CAP_SEC || hasSidecar;
```

`TAPE_CAP_SEC` constant unchanged from W2 — it still guards the browser-decode path. Clips with a sidecar bypass it. Clips without a sidecar and over the cap continue to behave as today (plain bar, no tape).

### Props flow

```tsx
<WaveformTape
  audioEl={audioEl}
  audioUrl={audioUrl}
  peaks={peaksData?.peaks}
  peaksDuration={peaksData?.duration}
  // ... existing props
/>
```

`WaveformStrip` (inline waveform path) receives the same props for completeness, even though short clips under cap rarely have a sidecar — ensures correctness if the threshold is lowered later.

### Windowed/virtualized rendering in `WaveformTape`

Current approach (W2): wavesurfer renders peaks for the current zoom page only because the peaks array is sized to that page. After W3, `peaksData.peaks` may be 1000 values covering the entire hour.

Required change: before passing peaks to wavesurfer, compute the slice corresponding to the **visible page ± one buffer page**:

```ts
function peaksWindow(allPeaks: number[], duration: number, windowStartSec: number, windowDurationSec: number, bufferSec: number): number[] {
  const samplesPerSec = allPeaks.length / duration;
  const startIdx = Math.max(0, Math.floor((windowStartSec - bufferSec) * samplesPerSec));
  const endIdx = Math.min(allPeaks.length, Math.ceil((windowStartSec + windowDurationSec + bufferSec) * samplesPerSec));
  return allPeaks.slice(startIdx, endIdx);
}
```

Pass only the slice to wavesurfer on each page advance. When the tape pages, recompute the slice for the new window center. This keeps the rendered peaks array small (~dozens of values at typical zoom levels) regardless of clip length.

The `duration` passed to wavesurfer remains the **full clip duration** (not the window duration) so the wavesurfer instance stays correctly calibrated for seek/time math. The peaks slice is resampled to match the wavesurfer container width as wavesurfer already handles this.

## Steps

1. Add `PeaksData` type to `frontend/src/api/contracts/peaksData.ts`.
2. Implement `fetchPeaksSidecar` in `frontend/src/api/fetchPeaksSidecar.ts`. Derive the peaks route URL from `audioUrl` — map WAV URL path components to query parameters for the route added in 011.
3. In `PlayerBar.tsx`, add `peaksData` state and the `requestId`-keyed fetch effect. Wire `peaks` and `peaksDuration` props down to `WaveformTape` and `WaveformStrip`.
4. Update the tape-availability guard in `PlayerBar.tsx`: `tapeAvailable = duration <= TAPE_CAP_SEC || peaksData !== null`.
5. Add the `peaksWindow` helper to `WaveformTape.tsx`; call it on initial mount and on each page advance, passing only the window slice to wavesurfer.
6. Confirm the single-owner invariant still holds (`<audio` / `new Audio(` grep passes).
7. Write frontend tests (see Files section). Each test must use types from `frontend/src/api/contracts/liveEvents.ts` where relevant per R3; socket frames via `publishStudioSocketMessage` per R3. Tests must use `waitFor` / vitest fake timers per R4 — no `setTimeout` sleeps.
8. Run `npm -C frontend run lint`, `npm -C frontend run test -- --run`, `npm -C frontend run build` — all must pass.
9. Run `./venv/bin/python -m pytest -q` — green (route test from 011 covers the backend side).
10. Verify in the running app: open a chapter with a sidecar on disk, open the tape — it renders from the sidecar without the WAV download; a chapter without a sidecar and over cap shows the plain bar; a chapter without a sidecar and under cap browser-decodes as in W2.

## Acceptance criteria

- `PlayerBar` fetches the peaks sidecar on each new source; `peaksData` resets to null on `requestId` change; in-flight fetch is cancelled on source change.
- When a sidecar is present, `peaks` and `peaksDuration` props flow to `WaveformTape`/`WaveformStrip`; wavesurfer uses the pre-peaks path (no WAV download/decode).
- Duration cap is lifted for clips that have a sidecar; clips without a sidecar and over cap still show the plain bar (no regression).
- `WaveformTape` renders only the visible page ± one buffer page of peaks at any time; the full peaks array is not passed wholesale to wavesurfer.
- Single-owner invariant preserved; conversion-complete grep passes.
- `fetchPeaksSidecar` returns null on 404 or network error (browser decode fallback); no uncaught exceptions.
- `PeaksData` type matches the sidecar JSON contract from task 011.
- vitest for `fetchPeaksSidecar`, `PlayerBar` peaks wiring, and `WaveformTape` windowing — all green, no sleep-based timing (R4).
- `npm -C frontend run lint` + `npm -C frontend run test -- --run` + `npm -C frontend run build` all pass.
- `./venv/bin/python -m pytest -q` green.
- `docs/specs/data-model.md` updated with peaks field (confirmed from 011 — verify it landed).

## Out of scope

- Any W2 UI changes — this task only swaps the peaks source and adds windowing.
- Annotation / edit-marking — post-V2.
- Sidecar for voice sample previews.
- Continuous-scroll mode.
- Persisting zoom level or sidecar fetch result across sessions.

## References

- Roadmap: `plans/audio_player_waveform_scrubber/01-roadmap.md` (W3, task 012)
- Proposal §7 (source-swap seam, cap lift, virtualized rendering)
- Audit Finding F1 (browser decode cost ceiling): `00-audit-report.md §E`
- Audit Finding F4 (single-owner constraint): `00-audit-report.md §E`
- Task 010: `plans/audio_player_waveform_scrubber/tasks/010-peaks-source-abstraction.md`
- Task 011: `plans/audio_player_waveform_scrubber/tasks/011-backend-peaks-sidecar-emission.md`
- `frontend/src/store/playerBus.ts:17–30` — bus state (audioUrl, requestId)
- `frontend/src/app/layout/PlayerBar.tsx:46–47` — `forceWave` / `requestId` reset pattern to follow
- `docs/specs/testing-standards.md` — R1 revert-check, R3 contract-shaped frames, R4 no sleep
