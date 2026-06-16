# 010 — Peaks-source abstraction (frontend)

status: todo
workload: W3 — Peaks sidecar (backend) — later
blocked-by: 009
blocks: 012

## Goal

Make `WaveformTape` and `WaveformStrip` accept **supplied `peaks` + `duration`** (wavesurfer's `peaks` option) OR fall back to browser decode — with no visible UI change. This is the single source-swap seam that makes W3 not a rebuild of the W2 UI: a one-line conditional at the data-injection boundary is all that changes in the rendering path.

## Why it matters

wavesurfer already supports both paths: when `peaks` (pre-computed array) and `duration` (seconds) are passed to `WaveSurfer.create()` or `ws.load()`, it skips browser decode entirely and renders from the supplied data. Without this seam, swapping from browser decode to sidecar in Task 012 would require re-architecting both components. With it, 012 is a pure caller-side concern.

The seam also documents the invariant explicitly in code: the components are peaks-source-agnostic; the caller decides what to hand them.

## Files

- `frontend/src/components/WaveformStrip.tsx` — add optional `peaks` + `duration` props; pass through to wavesurfer init
- `frontend/src/components/WaveformTape.tsx` — same additions (added in W2 Task 006)
- `frontend/tests/unit/components/WaveformStrip.test.tsx` — new/extended tests for supplied-peaks path
- `frontend/tests/unit/components/WaveformTape.test.tsx` — same

## Target shape / contract

### Props extension (both components)

```ts
interface WaveformStripProps {
  audioEl: HTMLAudioElement;
  audioUrl: string;
  // NEW — W3 sidecar injection; omit to browser-decode (existing behavior)
  peaks?: number[];        // pre-computed downsampled amplitude array
  peaksDuration?: number;  // clip duration in seconds (required when peaks is set)
}
```

### wavesurfer init logic

Current `WaveformStrip.tsx:48–87` calls `WaveSurfer.create({ media: audioEl, ... })` then `ws.load(audioUrl)` for browser decode.

New behavior:

```ts
if (props.peaks && props.peaksDuration) {
  ws.load(audioUrl, props.peaks, props.peaksDuration);   // sidecar path — skips decode
} else {
  ws.load(audioUrl);                                      // existing path — browser decode
}
```

`ws.load(url, peaks, duration)` is the standard wavesurfer 7.x pre-peaks API. No custom branching inside wavesurfer; both paths share the same instance lifecycle (create → load → destroy-on-cleanup).

### Single-owner invariant

The `media: audioEl` binding in `WaveSurfer.create` is unchanged; both paths use the same `<audio>` element. The conversion-complete grep (`<audio` / `new Audio(` only in `PlayerBar.tsx` + capture) must still pass.

### Re-init behavior

The existing `useEffect([audioUrl, audioEl])` dependency array is preserved. If `peaks`/`peaksDuration` are also props, add them to the dep array so a sidecar arriving after mount (e.g. async fetch) triggers a clean re-init.

## Steps

1. Extend `WaveformStrip` props interface with `peaks?: number[]` and `peaksDuration?: number`. Default both to `undefined` (no change to existing callers).
2. In the wavesurfer init effect, branch on `peaks && peaksDuration` to call the pre-peaks overload of `ws.load()`; else call the existing single-arg form. Add both to the `useEffect` dep array.
3. Apply the identical change to `WaveformTape` (Task 006 component).
4. Verify `PlayerBar.tsx` passes neither prop at this stage (existing callers are untouched). 012 will be the first caller to supply them.
5. Write vitest for `WaveformStrip`: (a) neither prop supplied → `ws.load(url)` called (existing behavior); (b) both supplied → `ws.load(url, peaks, duration)` called; (c) only `peaks` supplied (no `peaksDuration`) → falls back to browser decode, no error.
6. Write the same vitest for `WaveformTape`.
7. Run `npm -C frontend run lint` and `npm -C frontend run test -- --run` — both must pass.
8. Run `npm -C frontend run build` — clean.

## Acceptance criteria

- `WaveformStrip` and `WaveformTape` accept `peaks` + `peaksDuration` props; both default to `undefined`.
- When both are supplied, wavesurfer is initialized via the pre-peaks `ws.load(url, peaks, duration)` form; browser decode is not triggered.
- When either is absent, initialization falls back to the existing single-arg `ws.load(url)` form; no error is thrown.
- No visible UI change: rendering, interactions, and layout are identical for existing callers.
- Single-owner invariant preserved: `media: audioEl` binding unchanged; conversion-complete grep passes.
- Vitest for both components: three cases each (supplied, fallback, partial-supplied-no-duration), green.
- `npm -C frontend run lint` + `npm -C frontend run test -- --run` + `npm -C frontend run build` all pass.

## Out of scope

- Fetching or resolving the sidecar URL — that is 012.
- Any UI surface changes — the tape and strip look identical regardless of peaks source.
- The duration cap lift — that is 012.
- Virtualized rendering — that is 012.
- Backend sidecar emission — that is 011.

## References

- Roadmap: `plans/audio_player_waveform_scrubber/01-roadmap.md` (W3, task 010)
- Proposal §7: peaks data — browser-first now, server sidecar later
- Audit Finding F4 (single-owner constraint): `00-audit-report.md §E`
- Current `WaveformStrip` binding: `frontend/src/components/WaveformStrip.tsx:48–87`
- wavesurfer 7.x `ws.load(url, peaks, duration)` API: https://wavesurfer.xyz/docs/classes/wavesurfer.WaveSurfer#load
