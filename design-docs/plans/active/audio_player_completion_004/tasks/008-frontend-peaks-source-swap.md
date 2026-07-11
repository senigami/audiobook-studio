Status: complete — 2026-07-10 (pending owner sign-off, see last acceptance-criteria item)

# 008 — Frontend peaks source-swap seam

Workload: C · Risk: `multi-file` (touches `PlayerBar.tsx`, same file as task 001 — must land strictly after it) · Blocked-by: 001, 006, 007 · Blocks: 009

## Goal

Let long chapters (over `TAPE_DURATION_CAP_SEC`) get a tape UI fed by the server-computed peaks sidecar instead of the browser decode, with graceful fallback to a plain bar if no sidecar is available.

**This task replaces** `design-docs/plans/active/audio_player_waveform_scrubber/tasks/010-peaks-source-abstraction.md` and `012-frontend-source-swap-and-virtualization.md`. Do **not** implement any "virtualization" — verified false premise, see below.

## Why it matters

This closes the loop: task 001 introduces the cap, tasks 006/007 make peaks servable, this task is what actually lifts the practical cap for long chapters.

## Map links

See `../01-map.md` — Parts: `WaveformTape.tsx` (extended), `PlayerBar.tsx` (extended, after task 001). Connections: "A → C (ordering, same file)" — this task's `PlayerBar.tsx` edit must land after task 001's.

## Files

### Edit

- `frontend/src/app/layout/WaveformTape.tsx:63` — extend `usePeaks`'s signature.
- `frontend/src/app/layout/PlayerBar.tsx` — add the peaks-fetch effect (after task 001's tape-wiring changes are in place).

### Create

- `frontend/src/api/fetchPeaksSidecar.ts`
- `frontend/src/api/contracts/peaksSidecar.ts`

## Target shape / contract

### `usePeaks` extension (`WaveformTape.tsx:63`)

```typescript
export function usePeaks(
  audioUrl: string,
  audioEl: HTMLAudioElement,
  suppliedPeaks?: number[] | null,   // NEW, optional, backward-compatible
): number[] | null {
  // When suppliedPeaks is a non-empty array, return it directly and skip the
  // existing fetch+decode effect entirely (no network request, no AudioContext).
  // Existing callers passing nothing keep decoding exactly as today.
  ...
}
```

Thread `WaveformTape`'s existing (currently minimap-only) `peaks` prop into this `usePeaks` call too, so a supplied array suppresses the internal decode as well as feeding the minimap — check the current internal call site (`usePeaks(audioUrl, audioEl)` inside `WaveformTape`) and pass its own `peaks` prop through as the third argument.

### `frontend/src/api/contracts/peaksSidecar.ts`

```typescript
export interface PeaksSidecar {
  version: 1;
  peaks: number[];
  duration_sec: number;
  sample_rate: number;
  channels: number;
  peaks_per_sec: number;
  source: { filename: string; size_bytes: number; mtime_ns: number };
}

export function parsePeaksSidecar(json: unknown): number[] | null {
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.peaks)) return null;
  const peaks = obj.peaks;
  if (!peaks.every(p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)) {
    return null;
  }
  return peaks as number[];
}
```

### `frontend/src/api/fetchPeaksSidecar.ts`

```typescript
/**
 * Derives the peaks URL from a chapter audio URL by replacing the /assets/audio
 * path segment with /assets/peaks (same `filename` query param). Returns null
 * for URLs that don't match the chapter-asset shape (segment/preview/sample
 * URLs use a different route entirely) so callers never fire a request for them.
 */
export function derivePeaksUrl(audioUrl: string): string | null {
  if (!audioUrl.includes('/assets/audio')) return null;
  return audioUrl.replace('/assets/audio', '/assets/peaks');
}

export async function fetchPeaksSidecar(audioUrl: string): Promise<number[] | null> {
  const peaksUrl = derivePeaksUrl(audioUrl);
  if (!peaksUrl) return null;
  try {
    const res = await fetch(peaksUrl);
    if (!res.ok) return null;
    return parsePeaksSidecar(await res.json());
  } catch {
    return null;
  }
}
```

### `PlayerBar.tsx` wiring (after task 001's state exists)

```typescript
const [sidecarPeaks, setSidecarPeaks] = useState<number[] | null>(null);

useEffect(() => {
  setSidecarPeaks(null); // reset on new source
  if (duration <= TAPE_DURATION_CAP_SEC || !audioUrl) return;
  let cancelled = false;
  fetchPeaksSidecar(audioUrl).then(peaks => {
    if (!cancelled) setSidecarPeaks(peaks);
  });
  return () => { cancelled = true; };
}, [requestId, duration, audioUrl]);
```

Update `tapeAvailable` (task 001) to also allow the over-cap case when a sidecar is present:

```typescript
const tapeAvailable = (duration > 0 && duration <= TAPE_DURATION_CAP_SEC) || sidecarPeaks !== null;
```

Pass `peaks={sidecarPeaks}` into the `<WaveformTape>` call added in task 001.

**Explicitly do NOT implement:** any windowing/slicing of the peaks array ("virtualization"). Verified false premise: `WaveformTape.tsx`'s fixed-grid sampler does ~181 index lookups per frame via direct index math (not iteration over the whole array), and `WaveformTapeMinimap.tsx`'s sampler does 200 index lookups per render, both independent of total array length. A max ~28,800-element float array (hour clip at 8 peaks/sec) is ~230KB of JS heap — trivial, no windowing needed. Do not add any such logic even if it appears in an old draft.

## Steps

- [x] Confirm task 001 has landed (`TAPE_DURATION_CAP_SEC` exists in `PlayerBar.tsx`) before starting.
- [x] Extend `usePeaks` with the `suppliedPeaks` param; thread `WaveformTape`'s existing `peaks` prop through to it.
- [x] Add `peaksSidecar.ts` contract + `fetchPeaksSidecar.ts`.
- [x] Add the `sidecarPeaks` state + fetch effect + updated `tapeAvailable` + `peaks` prop wiring in `PlayerBar.tsx`.
- [x] Write vitest tests: URL derivation (including non-matching shapes returning `null`), 404/malformed-JSON → `null`, `usePeaks` skips fetch/decode when `suppliedPeaks` is non-empty, `PlayerBar` fetches only when `duration > TAPE_DURATION_CAP_SEC`, `requestId` bump mid-flight discards a stale in-flight result.
- [x] `npm -C frontend run build`/`lint`/`test -- --run` all green.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] `derivePeaksUrl` returns `null` for segment/preview/sample-shaped URLs (no `/assets/audio` substring) and the correct derived URL for chapter audio URLs.
- [x] Under-cap clips never issue a peaks fetch.
- [x] Over-cap clip + successful sidecar fetch → tape is offered, fed by the sidecar (no browser decode — verify `usePeaks`'s internal fetch/`AudioContext` path is not exercised when `suppliedPeaks` is supplied).
- [x] Over-cap clip + 404/failed fetch → tape stays unavailable, plain bar (no regression, no crash).
- [x] `requestId` bump mid-flight discards the stale in-flight result (no state update after cancellation).
- [x] No windowing/slicing logic added anywhere.
- [x] Full build/lint/test green.
- [ ] **Owner sign-off** (recorded in `../02-roadmap.md`'s Workload C checklist): a real or fixture long chapter renders the tape from the sidecar, confirmed via the network tab. (Not performed by this agent — requires the owner to verify against a real backend/network tab.)
