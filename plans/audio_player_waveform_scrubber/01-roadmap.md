# 01 — Roadmap: workloads, sequence, sign-off checks

Four workloads. **W0 (mock) gates everything** behind an owner sign-off on feel. W1–W2 are pure frontend (zero backend). W3 is the only backend work and can ship later without reworking the W2 UI.

```
W0  Mock prototype (feel)        ──sign-off──▶  W1  Spec + fit rule
                                                  │
                                                  ▼
                                                W2  Real tape + zoom (browser-decoded)
                                                  │
                                                  ▼
                                                W3  Peaks sidecar (backend) + source-swap   [later]

post-V2:  Annotation / edit-marking   (excluded)
```

### Dependency graph (tasks)

- 001 → 002 → 003  (mock builds on itself)
- 003 ⇒ **owner sign-off** ⇒ 004
- 004 (spec) → 005 (fit rule)            [004 first: code targets the rewritten spec]
- 005 → 006 → 007 → 008 → 009            (real tape stack; 006 is the component, 008 wires it into PlayerBar)
- 009 ⇒ W2 done ⇒ 010 → 011 → 012        (W3, later)

No forward dependencies: every task depends only on earlier-numbered tasks.

---

## Workload 0 — Mock prototype (feel-first)

**Goal:** nail the visual + interaction feel of the tape in the North-Star mock before touching the real app. Synthetic, peak-shaped data; no real audio, no wavesurfer.
**Sign-off check (gates W1):** owner reviews the tape in `#/stage/site-mockup`, confirms feel (paged motion, zoom presets, minimap, scrub, grow-upward), and records approval. Build is clean: `npm -C frontend run build` + eslint on changed files.

- **001 — Mock tape component.** Fork/extend `WaveformSvg` (`shared.tsx:463–501`) into a `MockWaveTape` that renders a **paged window** of synthetic-but-peak-shaped data (speech bursts + silences, F3) with a **moving playhead** and page-advance at the edge. Grows the bar upward when open. Reuse `Row/Col/Card/Btn`. Respect `prefers-reduced-motion` (instant page cut).
- **002 — Mock zoom presets + minimap.** Add the bounded discrete zoom-preset control (cover-slider style: snap dots, `8/15/30/60/120 s` across viewport) and a **minimap** strip (whole synthetic clip + draggable window rectangle whose width = current zoom span). Wire zoom + minimap to the tape window.
- **003 — Mock player integration + motion.** Wire the `AudioLines` toggle in the mock PlayerBar (`siteMockupStage.tsx:571–794`) so that **bar-mode → opens the tape**; add **click-to-jump + drag-to-scrub** on the tape (extend `handleSeek` `:593–598`); default to **paged** motion. Optionally mirror the state in the styleguide U16 specimen (`StyleguidePage.tsx:1002–1194`) so the styleguide stays honest.

## Workload 1 — Spec rewrite + fit-based inline rule (real app, pure frontend)

**Goal:** make the binding spec describe the new model, then flip the live representation predicate from scope to fit.
**Sign-off check:** `audio-player.md` version bumped with a clean changelog row; `PlayerBar` uses the fit predicate; vitest for the predicate + representation choice green; build + eslint clean.

- **004 — Rewrite `audio-player.md` §5.** Replace `representation follows scope` with the **fit-based, duration-driven, scope-blind** rule + the tape, zoom presets, minimap, duration cap, and browser-first/peaks-later strategy. Version bump + **one** changelog row (no revert history). Update the §9-style cross-ref to `design-system.md` §9 for the `AudioLines`-opens-tape behavior. Specs-first so code targets it.
- **005 — Fit-based inline rule.** Implement `fitsLegibly(durationSec, barWidthPx)` (`>= ~3 px/sec`, `~120 s` bootstrap) and change `PlayerBar.tsx:121` from `forceWave ?? (scope === 'segment')` to `forceWave ?? fitsLegibly(duration, measuredWidth)`. Measure bar width (ResizeObserver or container). Segments and short clips → inline waveform via browser decode; longer → bar. No new surface. Vitest with fake widths/durations.

## Workload 2 — Real tape + zoom, browser-decoded (real app, pure frontend)

**Goal:** port the W0-approved tape to the real PlayerBar against browser-decoded peaks, with the duration safety cap. Zero backend.
**Sign-off check:** opening a chapter (under cap) and pressing the toggle shows the working tape (paged, scrub, zoom, minimap); a clip over the cap stays a plain bar; single-owner grep still passes; vitest + build + eslint clean. Verify in the running app (preview).

- **006 — `WaveformTape` component (real).** New component rendering the paged tape from **wavesurfer browser-decoded peaks**, bound to the **single existing `<audio>`** (reuse the `media: audioEl` pattern from `WaveformStrip.tsx:48–87`; **no second audio owner**, F4). Moving playhead, page-advance, `prefers-reduced-motion` instant cut. Reads/writes position via the bus (`seek` `:162`, `reportTime` `:171`).
- **007 — Zoom presets + minimap (real).** Port the W0 zoom-preset control + minimap to the real component. Zoom-in cap = available peak resolution; zoom-out cap before blob; minimap = whole-clip nav. Pinch/wheel snaps; ±/slider secondary; tokens for playhead/marker contrast on glass.
- **008 — PlayerBar tape integration + duration cap.** Extend `PlayerBar.tsx` so the `AudioLines` toggle (`:254–262`) **opens/closes the tape when in bar mode** (vs. flip-representation when in waveform mode); grow the bar upward. Add the **duration cap** (F1, ~10–15 min tunable): above it the tape is not offered (plain bar, today's behavior). Tape state resets on `requestId` like `forceWave`.
- **009 — Tape CSS + tests.** Add the expanded-tape styles to `components.css` (grow-upward region, ~96–120px, tokens, glass contrast for playhead/minimap, reduced-motion). Vitest: toggle opens/closes tape, cap guard, reduced-motion path, single-owner invariant.

## Workload 3 — Peaks sidecar (backend + thin frontend) — later

**Goal:** lift the duration cap toward the full hour by computing peaks server-side at production time and swapping the peaks *source*. The W2 UI is unchanged.
**Sign-off check:** a long chapter (> cap) renders the tape from the sidecar without downloading the WAV; sidecar is emitted at production for over-threshold artifacts (synthesis + assembly); reuse/immutability honored; `data-model.md` updated; backend + frontend tests green.

- **010 — Peaks-source abstraction (frontend).** Make `WaveformTape`/`WaveformStrip` accept **supplied `peaks` + `duration`** (wavesurfer `peaks` option) OR fall back to browser decode. One seam: `if sidecar exists → render from it; else decode`. No UI change.
- **011 — Backend peaks emission.** Add a peaks reference to the artifact metadata (`ArtifactOutputModel`/manifest, `models.py:14–21`; update `data-model.md`). At **production time** emit a downsampled peaks sidecar for any artifact **over the duration threshold** — synthesis (`tasks/synthesis.py`) for long segments, assembly (`tasks/assembly.py` / `audio_ops.py:stitch_segments`) for chapters. Probe `duration`/`sample_rate`/`channels` as needed (F2; `subprocess_utils.py:36–52`). Respect immutable cache entries. Serve the sidecar via a contained file route.
- **012 — Frontend source-swap + cap lift + virtualization.** Point the tape at the sidecar when present; **lift the duration cap** for clips that have one; add windowed/virtualized rendering (draw visible page ± buffer) for the hour case. Backend + frontend tests.

---

## Post-V2 (excluded)

**Annotation / edit-marking.** Dropping actionable edit-marks on the tape needs timestamp→segment mapping the backend lacks. Deferred entirely; not scheduled here.
