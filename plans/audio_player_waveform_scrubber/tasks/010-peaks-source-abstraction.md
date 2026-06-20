# 010 — Peaks-source abstraction (frontend)

status: todo
workload: W3 — Peaks sidecar (backend) — later
blocked-by: 009
blocks: 012

## Goal

Generalize `usePeaks(audioUrl)` — introduced in W2 task 006 as a browser-decode provider for `WaveformTape` — so the tape renders from a **supplied sidecar peak array** if one is provided for that URL, else falls back to browser decode. One seam; no UI change.

## Why it matters

The roadmap calls for "browser-first, server sidecar later — source-swap behind one seam, not a rebuild" (spec §5.4). The seam lives entirely inside `usePeaks`: the hook already owns the responsibility of producing a `number[]` peak array for a given audio URL. Extending it to accept an externally-supplied array means the `WaveformTape` custom renderer is peaks-source-agnostic — the caller decides. Without this seam, task 012 would require re-architecting the tape.

`usePeaks` is the right boundary because the tape's custom renderer (ported from `MockWaveTape` in W2) draws from a peak array, not from wavesurfer's internal decode. The seam is therefore on the array supply side — not on wavesurfer's `ws.load()` API. The inline `WaveformStrip` (wavesurfer) is unchanged: short clips under the duration cap continue to browser-decode exactly as they do today.

## Files

- `frontend/src/hooks/usePeaks.ts` (or wherever W2 placed the hook — added in Task 006) — extend to accept an optional `suppliedPeaks?: number[]` argument; if present and non-empty, return it directly; else browser-decode as before
- `frontend/src/components/WaveformTape.tsx` — update the call site of `usePeaks` to thread through `suppliedPeaks` when a caller provides them (new optional prop)
- `frontend/tests/unit/hooks/usePeaks.test.ts` — new/extended vitest cases for the supplied-peaks path
- `frontend/tests/unit/components/WaveformTape.test.tsx` — verify that when `suppliedPeaks` is passed, `usePeaks` is not asked to browser-decode

## Target shape / contract

### `usePeaks` hook extension

```ts
// Before (W2):
function usePeaks(audioUrl: string): { peaks: number[]; loading: boolean; error: Error | null }

// After (W3 seam):
function usePeaks(
  audioUrl: string,
  suppliedPeaks?: number[],   // NEW — sidecar injection; omit to browser-decode
): { peaks: number[]; loading: boolean; error: Error | null }
```

When `suppliedPeaks` is provided and non-empty:
- Return `{ peaks: suppliedPeaks, loading: false, error: null }` immediately.
- Do not initiate a Web Audio decode (no `AudioContext`, no network fetch of the WAV).

When `suppliedPeaks` is absent or empty (existing behavior):
- Browser-decode as before: fetch the WAV, decode via Web Audio API, downsample to a peak array.

### `WaveformTape` prop extension

```ts
interface WaveformTapeProps {
  audioEl: HTMLAudioElement;
  audioUrl: string;
  // NEW — W3 sidecar injection; omit to use browser-decode path
  suppliedPeaks?: number[];
  // ... existing props (zoom, motion, etc.)
}
```

Inside `WaveformTape`, pass `suppliedPeaks` through to `usePeaks`:

```ts
const { peaks, loading } = usePeaks(audioUrl, props.suppliedPeaks);
```

No other rendering logic changes — the fixed-grid sampling (§5.3) and all tape interaction is identical regardless of where the peak array came from.

### Single-owner invariant

The `<audio>` element binding is unchanged — `usePeaks` in browser-decode mode uses the Web Audio API's `decodeAudioData` on a fetched buffer, not a second `<audio>` element. The conversion-complete grep (`<audio` / `new Audio(` only in `PlayerBar.tsx` + capture) must still pass.

### Re-render behavior

If `suppliedPeaks` changes (e.g. a sidecar arrives asynchronously after mount), `usePeaks` must return the new array. The hook's dependency on `suppliedPeaks` ensures React re-renders the tape with the correct data. In the browser-decode path, a change to `audioUrl` continues to trigger a fresh decode as before.

## Steps

1. Extend `usePeaks` to accept `suppliedPeaks?: number[]`. Add a fast-path: if `suppliedPeaks?.length`, return it immediately without decoding.
2. Add `suppliedPeaks?: number[]` to `WaveformTape`'s props interface. Pass it into the `usePeaks` call.
3. Verify no existing callers of `usePeaks` or `WaveformTape` pass the new prop — they are all W2 callers using browser-decode. The new prop is additive; no existing behavior changes.
4. Write vitest for `usePeaks`: (a) no `suppliedPeaks` → browser-decode path called; (b) non-empty `suppliedPeaks` → returned immediately, no decode initiated; (c) empty array `suppliedPeaks=[]` → falls back to browser-decode (treat as absent).
5. Write vitest for `WaveformTape`: when `suppliedPeaks` is passed, confirm `usePeaks` receives it and that the tape renders without triggering a decode (mock `usePeaks` at the module boundary — the hook is outside `WaveformTape`, consistent with R2).
6. Run `npm -C frontend run lint` and `npm -C frontend run test -- --run` — both must pass.
7. Run `npm -C frontend run build` — clean.

## Acceptance criteria

- `usePeaks` accepts an optional `suppliedPeaks` argument; when non-empty, returns it directly without browser decode.
- `WaveformTape` accepts an optional `suppliedPeaks` prop and threads it through to `usePeaks`.
- No visible UI change: rendering, interactions, and layout are identical for existing callers.
- Single-owner invariant preserved: conversion-complete grep passes.
- Vitest for `usePeaks`: supplied path (no decode), fallback path (decode), empty-array fallback — all green.
- Vitest for `WaveformTape`: supplied peaks flow through to `usePeaks` — green.
- `npm -C frontend run lint` + `npm -C frontend run test -- --run` + `npm -C frontend run build` all pass.

## Out of scope

- Fetching or resolving the sidecar URL — that is 012.
- Any UI surface changes — the tape looks identical regardless of peaks source.
- The duration cap lift — that is 012.
- Virtualized rendering — that is 012.
- Backend sidecar emission — that is 011.
- `WaveformStrip` (the inline wavesurfer waveform for short clips) — unchanged; short clips always browser-decode via wavesurfer's own path.

## References

- Roadmap: `plans/audio_player_waveform_scrubber/01-roadmap.md` (W3, task 010)
- Spec §5.4 (peaks data — browser-first, server sidecar later; one seam): `docs/specs/audio-player.md`
- Spec §5.3 (fixed-grid rendering — binding): `docs/specs/audio-player.md`
- Audit Finding F4 (single-owner constraint): `00-audit-report.md §E`
- Task 006 (introduced `usePeaks` and `WaveformTape`): `plans/audio_player_waveform_scrubber/tasks/006-tape-renderer-browser-peaks.md`
- `frontend/src/store/playerBus.ts:17–30` — bus state (`audioUrl`, `requestId`)
