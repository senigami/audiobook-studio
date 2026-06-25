# 00 — Audit Report: current state, reconciliation, findings

```
scope: feature plan derived from design-docs/plans/audio_player_scrubbing_waveform_proposal.md
date: 2026-06-16
not: a whole-repo audit — bounded to the audio-player surface + the peaks-sidecar backend hook
```

## Reconciliation update — 2026-06-16 (mock landed, spec 1.6.0)

Since this report was first written, **W0 (the mock) shipped and was owner-approved**, and **`audio-player.md` was rewritten to 1.6.0**. The live port (W1–W3) must now carry everything the mock converged on — the originally-planned "fit-based rule" expanded into a larger, owner-approved feature set. Deltas the task files reflect:

- **Scope-agnostic, not just fit-based.** The segment/chapter toggle is removed *entirely*: `altScope`/`switchScope` retire from `playerBus.ts`, the `player-scope-*` UI goes, time becomes `position/duration`. (W1 / task 005.)
- **Port the mock, don't re-derive.** `MockWaveTape` + `speechPeakAt` (`shared.tsx`) and `MockTapeControls` (zoom/minimap) are the reference. The live tape is a **custom renderer fed by a real peak array**, not wavesurfer's renderer.
- **Fixed-grid sampling is binding** (spec §5.3) — the stability fix discovered in the mock.
- **New features beyond the original plan:** the paged↔**moving** motion toggle (reduce-motion forces paged), **cover-slider** zoom (no second-labels), the **m:ss time ruler**, and the **"Play book"** whole-book affordance.
- **Peak provider seam:** `usePeaks(url)` — browser-decode below the duration cap (W2), sidecar above (W3).

The current-state map below (live code, §A–C) is unchanged and still accurate — the live `PlayerBar`/`playerBus` have not yet been touched by the port.

## How the work was divided (token discipline)

Three read-only **Explore** (Haiku-class) agents mapped the current code in parallel; the orchestrator verified the load-bearing claims (the `showWave` predicate, the wavesurfer single-owner binding, the absence of a peaks field) against the proposal before writing tasks. No source was read whole into the orchestrator that an agent could summarize.

---

## A. Live player — current state (verified)

| Fact | Location |
|------|----------|
| Bus state: `scope`, `audioUrl`, `playing`, `position`, `duration`, `requestId`, `seekRequestId`, `altScope` | `frontend/src/store/playerBus.ts:17–30` |
| Bus API: `loadAndPlay` (L96, bumps `requestId`), `seek` (L162, bumps `seekRequestId`), `skip` (L166), `switchScope` (L125), `reportTime` (L171) | `frontend/src/store/playerBus.ts` |
| **Representation predicate** `const showWave = forceWave ?? (scope === 'segment')` | `frontend/src/app/layout/PlayerBar.tsx:121` |
| `forceWave` state + reset-to-null on new source | `PlayerBar.tsx:46`, effect on `[requestId]` at `:47` |
| `AudioLines` toggle button (`player-btn-wave`), `onClick={() => setForceWave(!showWave)}` | `PlayerBar.tsx:254–262` |
| Scrub choice: `{showWave && audioEl ? <WaveformStrip> : <input type=range .player-progress-slider>}` | `PlayerBar.tsx:231–247` |
| Seek click → bus: `handleSeekChange` calls `seek(val)` | `PlayerBar.tsx:112–118` |
| Total size | `PlayerBar.tsx` = 266 lines |
| **Wavesurfer single-owner binding**: `WaveSurfer.create({ media: audioEl, ... })` then `ws.load(audioUrl)` (browser-decodes peaks via Web Audio; playback still through the one `<audio>`) | `WaveformStrip.tsx:48–87`, load at `:84` |
| WaveformStrip props: `{ audioEl: HTMLAudioElement; audioUrl: string }` only; re-inits on `[audioUrl, audioEl]` | `WaveformStrip.tsx:20–25, 97–98`; 100 lines total |
| CSS: `.player-bar` (`container-type: inline-size`) | `components.css:2355–2368` |
| CSS: `.player-waveform-inline` 32px; `.player-progress-slider` 4px | `components.css:2571–2574, 2590–2599` |
| CSS: container query reflow-above (`@container (max-width:720px)` → `.player-scrub--wave { flex-basis:100%; order:-1 }`, wave 24px) | `components.css:2580–2588` |
| Wave color tokens `--color-wave / -progress / -cursor / -bg` | `tokens.css:200–207` (light), `:328–333` (dark) |

The live implementation matches the proposal's stated premises exactly — no contradictions found.

## B. Mock + styleguide — current state (verified)

| Fact | Location |
|------|----------|
| Mock PlayerBar region | `frontend/src/demo/stages/siteMockupStage.tsx:571–794` (224 lines) |
| Transport = lucide `SkipBack/Rewind/Play|Pause/FastForward/SkipForward` array + render loop | `siteMockupStage.tsx:620–651, 669–703` |
| **Waveform is SYNTHETIC**: `WaveformSvg` renders 30 hardcoded bars, animated by a `tick` state (80ms interval) modulated by `Math.sin((i+tick)*0.4)` — **not** real audio decode | `shared.tsx:463–501` (formula `:482–484`) |
| Mock seek: `handleSeek` computes position from mouse-X; clickable scrub `<div>` | `siteMockupStage.tsx:593–598, 707–728` |
| Play state + auto-advance interval (1s tick) | `siteMockupStage.tsx:559–566, 902–917` |
| Reusable shared primitives | `shared.tsx`: `Row/Col` (26–48), `Card/Panel` (128–163), `SemanticChip` (249–276), `Btn` (387–426), `ProgressBar` (431–458), lucide re-exports (628) |
| Mock CSS player rules (`.nsp-playerbar/.nsp-scrub/.nsp-wave`), reduced-motion block | `siteMockup/mockup.css:517–569, 659–665`; container query in `siteMockupStage.tsx:660–665` |
| Styleguide U16 specimen `U16Mock`, with its own **static** `WaveformSVG` (50 bars, playhead at 35%) | `styleguide/StyleguidePage.tsx:1002–1194` (waveform `:943–992`) |
| Stage routing: `#/stage/site-mockup` → `siteMockupStage.id='site-mockup'` | `DemoApp.tsx:24–27, 40–47, 97–98`; `siteMockupStage.tsx:1197–1203` |

## C. Backend audio producers — current state (verified)

| Fact | Location |
|------|----------|
| Segment WAV written by engine via synthesis; result carries `output_path`, `duration_sec` | `tasks/synthesis.py:202–249`; `engines/voice/sdk.py:92–116` (`TTSResult`) |
| Chapter WAV stitched by FFmpeg concat (codec copy, no re-encode) | `tasks/assembly.py:130–173` → `engines/audio_ops.py:99–145` (`stitch_segments`) |
| **Assembly does NOT record chapter duration** — fire-and-forget; would need a probe after | `tasks/assembly.py:164–173` |
| Artifact metadata model: `ArtifactOutputModel{duration_ms, sample_rate, channels}` + immutable `ArtifactManifestModel.output` | `domain/artifacts/models.py:14–21, 35–75` |
| **`ArtifactOutputModel` constructed only here**; returns None if duration/sr/channels missing | `orchestration/progress/reconciliation.py:390–410` |
| **`sample_rate`/`channels` are NOT probed from files** — hardcoded convention 24 kHz mono | (no production reader; tests assume 24 kHz mono) |
| Duration probe exists (ffprobe, seconds) | `engines/audio_ops.py:52–57` → `utils/subprocess_utils.py:36–52` |
| Paths: `ProjectContext` → `chapters/<id>/chapter.wav`, `segments/<id>.wav` | `storage/project.py:20–38`; `storage/manager.py:95–137` |
| **No `peaks`/sidecar field exists anywhere** | — |

---

## D. Reconciliation with `design-docs/specs/audio-player.md` (1.5.0)

- The proposal **supersedes §5** (`representation follows scope`) with a **fit-based, duration-driven, scope-blind** rule, and adds the tape, zoom presets, minimap, the duration cap, and the peaks-sidecar strategy. This is a genuine contract change → **§5 rewrite + version bump + one clean changelog row** (Workload 1, Task 004). Per owner: rewrite clean, do **not** record the prior experimentation/revert history.
- **No conflict** with `design-system.md` §9 (iconography — `AudioLines` stays the toggle icon; its *behavior* extends from "flip representation" to "open tape when in bar mode"). A one-line cross-ref update may be warranted.
- **No conflict** with `audio-player.md` §6 (follow-along) — annotation is out of scope; follow-along is untouched.
- **Workload 3 touches `data-model.md`**: adding a peaks sidecar to the artifact metadata is a data-model change → that spec must be updated in the same change (deferred to W3).

---

## E. Findings & risks (each becomes or shapes a task)

- **F1 — Browser decode cannot scale (download + memory, not CPU).** An hour WAV ≈ 150–300 MB on the wire and ≈ 600 MB decoded PCM/channel — a tab-crasher. → Mandatory **duration cap** in the browser-first phase (Task 008); above the cap, behave like today (plain bar). Keyed on **duration**, never scope.
- **F2 — The peaks-sidecar backend is more than "add a field."** `ArtifactOutputModel` has no peaks field, `sample_rate/channels` are never probed, and assembly records no duration. → Task 011 must: add a peaks reference to the artifact model (updating `data-model.md`), probe what it needs, emit at production time for over-threshold artifacts in **both** synthesis and assembly, and serve the sidecar. Respect immutable cache entries.
- **F3 — The mock waveform is a sine animation, not peaks.** Designing the tape against `WaveformSvg`'s sinusoid risks a feel that doesn't survive contact with real speech/pause structure. → Task 001 uses **synthetic-but-peak-shaped** data (speech-like bursts + silences), so the prototype reads like real narration.
- **F4 — Single-owner constraint.** `WaveformStrip` binds to the one `<audio>` via `media:` and re-inits per `audioUrl`. The tape must reuse that single instance/source — **never** spawn a second audio owner (ADR-0010 / `audio-player.md` §2 invariant). The conversion-complete grep (`<audio`/`new Audio(` only in `PlayerBar.tsx` + capture) must still hold. → Acceptance criterion on Tasks 006 & 008.
- **F5 — Reduced motion is free under paged-default.** Because paging (not continuous scroll) is the default, there is no continuous auto-scroll to suppress; page-advance becomes an instant cut when `prefers-reduced-motion` is set. → Built into Tasks 003 & 006.

---

## F. Locked decisions (from proposal §9 + this session)

1. **Duration-driven, scope-blind** — one variable governs display, cap, and peaks source.
2. **Fit predicate** — `~3 px/sec` legibility floor, width-adaptive; `~120 s` bootstrap before width is known.
3. **Paged by default** (moving playhead, page-advance at edge); no continuous-scroll mode.
4. **Zoom = bounded discrete presets** (cover-slider style): in-cap at native peak resolution, out-cap before "blob," never the whole clip (minimap owns whole-clip nav). Starting presets `8/15/30/60/120 s` across the viewport. Pinch/wheel snaps; ±/slider secondary.
5. **Grow the bar upward** for the tape (single surface, single focus context) — no floating sheet.
6. **Browser-first now, server sidecar later** — source-swap behind one seam, not a rebuild.
7. **Duration safety cap** ~10–15 min (tunable) in the browser-first phase.
8. **Annotation → post-V2**, excluded here.
9. **Mock-first** — prototype + owner sign-off in the mock before any real-app change.
10. **Spec authored clean** — no experimentation/revert history recorded.
