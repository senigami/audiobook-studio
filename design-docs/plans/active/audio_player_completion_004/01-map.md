# Implementation map

## Big picture

Three largely-independent workloads touch three different corners of the same player subsystem:

```
Workload A (PlayerBar wiring)         Workload B (segment nav fix)        Workload C (peaks sidecar)
  frontend/src/app/layout/              frontend/src/hooks/                  app/api/routers/chapters_assets.py
  PlayerBar.tsx  ───┐                   useChapterPlayback.ts                app/engines/audio_ops.py
  player.css        │                     (queue normalization,              app/utils/subprocess_utils.py
                     │                      Prev/Next fix, label)              │
                     │                                                        │
                     └── consumes ──── WaveformTape.tsx (already shipped,      │
                          (no changes    self-composes Zoom+Minimap,           │
                           needed here)  calls usePeaks internally) ──────────┘
                                              extended with a 3rd optional
                                              `suppliedPeaks` param (task 008)
```

Workload A and B touch disjoint files — no collision, parallel-safe. Workload C's frontend half (008) edits `WaveformTape.tsx`'s `usePeaks` and `PlayerBar.tsx` — the `PlayerBar.tsx` edit must land **after** task 001 (needs `TAPE_DURATION_CAP_SEC` to exist). Workload C's backend half (006–007) is fully independent.

## Parts

| Part | Responsibility | Touched by |
|---|---|---|
| `frontend/src/app/layout/PlayerBar.tsx` (262 lines today) | Global transport bar: play/pause/skip, scrub representation (`forceWave`/`showWave`/`fitsLegibly`, already shipped), renders `WaveformStrip` or (after this plan) the tape | Tasks 001, 008 |
| `frontend/src/app/layout/WaveformTape.tsx` (502 lines, already shipped) | Self-contained tape renderer: fixed-grid sampling, click/drag scrub, composes `WaveformTapeZoom` + `WaveformTapeMinimap` internally, owns its own `usePeaks` decode | Task 008 only (adds optional param) |
| `frontend/src/theme/components/player.css` | All player/tape CSS (post styling-separation split; the old monolithic `components.css` no longer exists) | Task 002 |
| `frontend/src/store/playerBus.ts` | Generic scope-agnostic playback bus: `loadAndPlay`, `seek`, `hasPrev`/`hasNext`, `notifyPrev`/`notifyNext` | **Not touched by this plan** — every workload reuses it as-is |
| `frontend/src/hooks/useChapterPlayback.ts` (~276 lines) | The ONLY live segment-playback driver: builds a playback queue, calls `loadAndPlay({scope:'segment', ...})` per segment/block | Tasks 003, 004, 005 |
| `frontend/src/pages/Book/studio/useStudioChapter.ts` (~915 lines) | Computes `playbackQueue`, `playbackBlockStartIds`, `currentPlaybackBlockIndex`, `activePlaybackLabel` one layer above `useChapterPlayback`; re-exports them (INV-4) | Read-only for this plan — nothing here changes |
| `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` | The only live call site of `useStudioChapter`/segment playback (`onPlaySpan` → `playSegment`) | Read-only; task 003's integration test exercises this path without modifying it |
| `app/api/routers/chapters_assets.py` | Contained chapter-asset serving route (`/assets/{asset_type}`) | Task 007 (adds `"peaks"` to the `Literal`) |
| `app/engines/audio_ops.py` | Audio processing helpers (assembly/stitching today) | Task 006 (adds `compute_peaks_sidecar`) |
| `app/utils/subprocess_utils.py` | ffprobe/ffmpeg subprocess wrappers (`probe_audio_duration` today) | Task 006 (adds `probe_audio_stream_info`) |
| `design-docs/specs/audio-player.md` (1.6.0) | Binding player spec | Tasks 005, 009 |
| `design-docs/specs/data-model.md` (1.9.0) | Binding data/artifact spec | Task 009 |

## Connections (the part no single task file sees on its own)

- **A → C (ordering, same file):** task 001 introduces `export const TAPE_DURATION_CAP_SEC = 600` in `PlayerBar.tsx`. Task 008 (Workload C) imports this exact constant to decide when to fetch the peaks sidecar. Task 008 must not run until task 001 is `complete`.
- **B is entirely self-contained inside one file's contract:** `useChapterPlayback.ts` is called only by `useStudioChapter.ts` (which is called only by `CastTool`). Fixing `onPrev`/`onNext`/the queue shape inside `useChapterPlayback.ts` changes no exported type `useStudioChapter.ts` re-exports (`playSegment`'s signature is unchanged: `(segmentId, fullQueue) => Promise<void>`), so INV-4 holds by construction — verify this is still true when task 004 is done (its own acceptance criteria say so explicitly).
- **C's backend and frontend halves share one contract, not one file:** the sidecar JSON shape (`{version, peaks, duration_sec, sample_rate, channels, peaks_per_sec, source}`) is defined once in task 006 and consumed once in task 008 — task 008 must parse exactly that shape (validate `version === 1`), not invent its own.
- **`WaveformTape.tsx` is shared infrastructure task 008 must not disturb.** It already has a `peaks?: number[] | null` prop that today only feeds `WaveformTapeMinimap` while `usePeaks` still separately, unconditionally decodes. Task 008 threads a `suppliedPeaks` param through `usePeaks` itself so a supplied array suppresses the internal decode too — this is an **additive, backward-compatible** change (existing callers passing nothing keep decoding as today).
- **Task 001 (Workload A) and the existing `WaveformStrip` usage are the pattern to imitate**, not the stale draft. `PlayerBar.tsx:228` already does `{showWave && audioEl ? (<WaveformStrip audioEl={audioEl} audioUrl={audioUrl} .../>) : ...}` — inline null-check, no assertion needed on `audioUrl` (already narrowed by an earlier `if (!audioUrl) return null`). Task 001's tape block must follow the identical pattern.
- **Route pattern to imitate (task 007):** the existing `"audio"` branch of `resolve_chapter_asset_path` (`app/storage/manager.py:118-125`) resolves a WAV by `filename` via `_find_file` (enumerate-and-match, existing-file-only). Task 007 reuses this exact call (`asset_type="audio"`) to locate the WAV, then derives the sidecar's sibling path itself — **no change to `resolve_chapter_asset_path`/`storage/manager.py` is needed**, because the sidecar path is always a deterministic sibling of an already-resolved, already-contained WAV path.

## Invariants (must hold across every workload)

- **INV-4 — preserve segment-playback logic.** `useStudioChapter.ts`'s exports listed above must not be stripped or change signature. *(Workload B: verify explicitly in task 004's acceptance criteria.)*
- **INV-7 — token-only styling, light+dark parity.** Every new CSS rule (task 002) references `var(--token)`; every token used has a dark-mode value in `frontend/src/theme/tokens.css`. No hardcoded hex/rgb/px-that-should-be-a-space-token.
- **Single-`<audio>`-owner (ADR-0010).** No new file may create an `<audio>` element or call `new Audio(...)`. The acceptance grep (task 001) must exclude `//`-comment matches — a naive `grep -rn '<audio\|new Audio('` today false-fails against ADR-0010 doc-comments in `WaveformTape.tsx`/`WaveformTapeZoom.tsx`/`WaveformTapeMinimap.tsx`/`WaveformStrip.tsx` themselves.
- **Versioned contracts.** The peaks sidecar JSON (task 006) carries `"version": 1`; the serving route (task 007) rejects/treats-as-absent anything with a mismatched or missing version.
- **Contained file serving.** Any new backend path resolution (task 007) must go through the existing containment pattern (`_find_file` / explicit `relative_to(projects_dir)` check) — never trust a request-supplied filename directly.
- **No import-time side effects.** Task 006/007's work runs inside an HTTP request handler (task 007) — a sanctioned side-effect pathway. No new module-level side effects, no new background thread/listener.

## Risks & open questions

- **Risk (Workload C, `quality-sensitive`):** the compute-on-miss route does synchronous ffmpeg decode inside a request handler. Task 007 must guard against duplicate concurrent computation for the same WAV (a lock keyed on the resolved WAV path) and must never let a slow/failed compute take down the request — any exception degrades to 404, never a 500 that breaks the frontend's fallback path.
- **Risk (Workload C, `quality-sensitive`):** a WAV can be rewritten in place during a concurrent re-render. Task 006's compute function must stat-before/stat-after and discard the result on mismatch (a torn read must never produce a "valid-looking" wrong sidecar).
- **Open, not blocking:** whether a future producer-side *warm* computation (fire-and-forget after a render completes, purely as a latency optimization) is worth adding later. Explicitly **not** part of this plan — the compute-on-miss route is correct and complete without it.
- **Open, flagged to the owner separately (not part of this plan):** "Play book" library-chaining and synced text auto-scroll — see `00-overview.md` scope boundaries.
