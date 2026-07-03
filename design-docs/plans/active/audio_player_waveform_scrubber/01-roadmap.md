# 01 — Roadmap: workloads, sequence, sign-off checks

Four workloads. **W0 (mock) is DONE and owner-approved** — it is the *reference implementation* the live port copies from. **W1's spec rewrite is DONE** (`audio-player.md` 1.6.0). What remains is porting the mock into the live app (W1 code → W2 → W3).

```
W0  Mock prototype ............... DONE (reference impl: MockWaveTape + MockTapeControls)
        │  owner sign-off ✔
        ▼
W1  Spec 1.6.0 (DONE) + make the live player scope-agnostic
        ▼
W2  Port the tape to the live PlayerBar (browser-decoded peak array)
        ▼
W3  Peaks sidecar (backend) + source-swap + virtualization        [later]

post-V2:  Annotation / edit-marking   (excluded)
```

### Guiding principle for the port

**Port, don't re-derive.** The mock is the source of truth for behavior and feel. `frontend/src/demo/stages/siteMockup/shared.tsx` (`MockWaveTape`, `speechPeakAt`) and `MockTapeControls.tsx` (`ZoomPresetControl`, `TapeMinimapStrip`, `snapZoom`, the cover-slider zoom, the `m:ss` ruler, the fixed-grid sampling, paged/moving motion) already encode every decision. The live tape is the **same rendering/interaction logic** fed by a **real peak array** instead of `speechPeakAt`, wired to the `playerBus` instead of mock `activeTrack` state.

### Architecture clarified (since the mock landed)

- The live **tape is a custom renderer** (ported from `MockWaveTape`) that draws from a **peak array** (`number[]`). It is *not* wavesurfer's own renderer — wavesurfer can't do our paged/moving + zoom-preset + minimap + ruler design.
- The inline short-clip waveform keeps using the existing `WaveformStrip` (wavesurfer) — unchanged.
- The peak array comes from a **provider** keyed on duration: browser-decode (Web Audio → downsample) at/below the cap (W2), server **sidecar** above the cap (W3). Same UI either way (one seam).
- **Fixed-grid sampling is binding** (spec §5.3): sample peaks on an absolute-time grid and translate the row by the sub-bar remainder — never anchor samples to the moving window (causes the crawl/shimmer the mock hit and fixed).

### Dependency graph (tasks)

- 001–003 (mock) ✅ → owner sign-off ✅ → 004 (spec 1.6.0) ✅
- 005 (scope-agnostic live player) → 006 (tape renderer + browser peaks) → 007 (zoom slider + minimap + ruler) → 008 (PlayerBar integration: AudioLines-opens-tape, motion toggle, duration cap, play-book) → 009 (CSS + tests)
- 009 ⇒ W2 done ⇒ 010 (peak-source seam) → 011 (backend sidecar) → 012 (source-swap + cap-lift + virtualization)

No forward dependencies; each task depends only on earlier-numbered ones.

---

## Workload 0 — Mock prototype ✅ DONE

Reference implementation, owner-approved. Tasks 001–003 done. The mock demonstrates the full feel: duration-adaptive inline scrub, AudioLines-opens-tape, paged + **moving** motion, click/drag scrub, cover-slider **zoom presets**, **minimap**, **m:ss time ruler**, **fixed-grid** stable rendering, scope-agnostic player (no toggle), collapse-when-empty, play affordances everywhere.

## Workload 1 — Spec 1.6.0 (✅) + scope-agnostic live player

**Goal:** spec describes the final design (done), then strip scope-coupling out of the live player so representation is duration-driven.
**Sign-off check:** live `PlayerBar` shows no segment/chapter toggle; `playerBus` has no `altScope`/`switchScope`; representation defaults by duration; time is `position/duration`; vitest for the predicate green; build + eslint clean.

- **004 — Rewrite `audio-player.md`.** ✅ DONE — bumped to 1.6.0: scope-agnostic, the tape (§5), peaks strategy (§5.4), fixed-grid rendering (§5.3); README re-synced; design-system §9 + data-model cross-refs noted.
- **005 — Scope-agnostic live player.** ✅ DONE — `fitsLegibly(durationSec, barWidthPx)` implemented in the new `frontend/src/app/layout/playerRepresentation.ts`; `PlayerBar.tsx`'s predicate changed from `forceWave ?? (scope === 'segment')` to `forceWave ?? fitsLegibly(duration, measuredWidth)`, with a `ResizeObserver` measuring the scrub container. **Scope toggle removed**: `altScope`/`switchScope`/`AltScope` deleted from `playerBus.ts` (§2.1/§2.2), the scope-toggle UI + `player-scope-*` CSS deleted from `PlayerBar.tsx`/`components.css`, and the Review adapter (`useReviewPlayback.ts`, `ReviewStage.tsx`) stopped registering `altScope`. Time stays `position/duration` (already scope-agnostic; verified). New `playerRepresentation.test.ts` covers the predicate boundaries/bootstrap; `playerBus.test.ts` and `PlayerBar.test.tsx` updated for duration-driven representation and to assert no scope toggle renders.

## Workload 2 — Port the tape to the live PlayerBar (browser-decoded)

**Goal:** the W0-approved tape, running in the real bar against a browser-decoded peak array, with the duration safety cap. Zero backend.
**Sign-off check:** open a chapter (under cap) → `AudioLines` opens the tape (paged + moving toggle, scrub, cover-slider zoom, minimap, m:ss ruler), all matching the mock; a clip over the cap stays a plain bar; single-owner grep still passes; vitest + build + eslint clean; verified in the running app.

- **006 — `WaveformTape` renderer + browser peak provider.** Port `MockWaveTape`'s render/interaction (fixed-grid sampling §5.3, paged **and** moving motion, click+drag scrub) into a live component bound to the **single `<audio>`** via the bus (`seek` `:162`, `reportTime` `:171`; **no second audio owner**, single-owner grep must pass). Add a `usePeaks(audioUrl)` browser provider (Web Audio decode → downsampled `number[]`); the tape samples that array on the grid instead of `speechPeakAt`. Smooth playhead/scroll via rAF interpolation if `timeupdate` (~4 Hz) is too choppy for moving mode.
- **007 — Zoom slider + minimap + ruler (port `MockTapeControls`).** Port `ZoomPresetControl` (cover-slider style: track + tick dots + accent thumb, **no second-labels**, presets 8/15/30/60/120 s, pinch/wheel snap), `TapeMinimapStrip` (whole-clip strip + draggable window rect, sampled from the same peak array), and the **smart m:ss ruler** (zoom-adaptive interval). Zoom-in caps at peak resolution; zoom-out before blob.
- **008 — PlayerBar integration: tape open, motion, cap, play-book.** `AudioLines` opens/closes the tape in bar mode (grows the bar upward), flips wave↔bar in waveform mode. Add the **paged ↔ moving motion toggle** (moving forced to paged under `prefers-reduced-motion`). Add the **duration cap** (~10–15 min, tunable): above it the tape isn't offered (plain bar, today's behavior — no crash). Add the **"Play book"** whole-book affordance (Library/book level) that loads chapter-sequenced playback (`onEnded` advances). Tape/zoom/motion state resets on `requestId`.
- **009 — Tape CSS + tests.** Live CSS for the grow-upward region, footer (minimap + zoom + motion + ruler), tokens, glass contrast, reduced-motion. Vitest: tape open/close, duration-cap guard, reduced-motion forces paged, fixed-grid stability (bars stable as position advances within a page), single-owner invariant. Tests under `frontend/tests/`, observable behavior, no sleep-based timing.

## Workload 3 — Peaks sidecar (backend) + source-swap — later

**Goal:** lift the duration cap toward the full hour by computing peaks server-side at production time; swap the peak *source*; the W2 UI is unchanged.
**Sign-off check:** a long chapter (> cap) renders the tape from the sidecar without downloading the WAV; sidecar emitted at production for over-threshold artifacts (synthesis + assembly); immutability/containment honored; `data-model.md` updated; pytest + vitest + build green.

- **010 — Peak-source seam (frontend).** Generalize `usePeaks` so the tape renders from a **supplied sidecar peak array** if one exists for the URL, else browser-decodes. One seam; no UI change.
- **011 — Backend peaks sidecar.** Add a peaks reference to `ArtifactOutputModel`/manifest (`models.py:14–21`; update `data-model.md`); emit a downsampled sidecar **at production time** for any artifact over the duration threshold — synthesis (`tasks/synthesis.py`) for long segments, assembly (`tasks/assembly.py` → `audio_ops.py:stitch_segments`) for chapters; probe duration/sample_rate/channels (`subprocess_utils.py`); respect immutable cache; serve via a contained file route (`safe_join`/`secure_join_flat`, no path echo). Backstory: §C/F2 of the audit — the backend currently records no chapter duration and never probes sr/channels.
- **012 — Source-swap + cap-lift + virtualization.** Point `usePeaks` at the sidecar when present; **lift the duration cap** for clips that have one; add windowed/virtualized rendering for the hour case. Backend (pytest, R1 revert-checked) + frontend (vitest) tests.

---

## Post-V2 (excluded)

**Annotation / edit-marking** — needs timestamp→segment mapping the backend lacks (spec §5.5/§6). Deferred entirely.
