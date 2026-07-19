# PL-1 — Executable plan: ACX loudness QA + normalization

## Question restated

Turn the FUTURE_WORK backlog one-liner — *"ACX loudness QA + normalization (M): ffmpeg
`loudnorm` analysis per chapter, pass/warn/fail column, optional EBU R128 normalize at
assembly. Lives in `app/engines/audio_qa.py` + assembly option"*
(`design-docs/plans/FUTURE_WORK.md:85-87`, with the sibling constraint at :39-41 — "add to
the shipped `wav_to_mp3`/`export_chapter_audio` chain, not a resurrected task class") —
into a self-contained implementation plan: the analysis pass, hook points in the existing
export/assembly chokepoints, the pass/warn/fail data model, the settings/manifest surface,
the UI column, and a test strategy honoring R1 revert-check discipline.

## What was examined

- `design-docs/plans/FUTURE_WORK.md:39-41, 85-87` — the two backlog entries and the
  explicit "no resurrected task class" constraint.
- `app/engines/audio_ops.py` — the whole existing audio-ops module:
  - `wav_to_mp3` (:20-43) — thin policy wrapper over `studio_plugin_sdk.audio.wav_to_mp3`
    (`studio_plugin_sdk/audio.py:16`), injecting `MP3_QUALITY` and the app runner
    (`run_cmd_stream`) so ffmpeg-call patches still intercept.
  - `stitch_segments` (:106-144) — chapter assembly is ffmpeg concat with **`-c copy`**
    (:127-139). No re-encode happens at chapter stitch; any normalization inserted there
    would break the fast copy path.
  - **The sidecar-cache pattern** (:162-334): `SIDECAR_VERSION` (:169),
    `compute_peaks_sidecar` (:180) with the torn-read stat-before/after guard (:192, :235-237),
    `_read_fresh_sidecar` freshness = version + size_bytes + mtime_ns (:261-282),
    `_atomic_write_sidecar` (:285), `ensure_peaks_sidecar` (:300) with its
    "never raises, None = unavailable" contract. This is the shape a loudness sidecar
    should clone, not reinvent.
- `app/orchestration/scheduler/orchestrator.py:287-345` —
  `_emit_chapter_peaks_sidecar` and `_emit_chapter_timing_sidecar`: the **single
  engine-agnostic completion point** in `submit()` where chapter-finalization side
  artifacts are emitted. Scope guards: `task_type == "synthesis"`, `payload["scope"] ==
  "chapter"`, output path ends `.wav`; best-effort, every failure swallowed+logged.
  This is the designed extension point for a third sibling emitter.
- `app/orchestration/tasks/assembly.py` — `AssemblyTask` (:19), `run()` (:130-173)
  dispatching to `assemble_audiobook` (m4b) or `stitch_segments` (chapter);
  `describe()`/`from_task_context` payload round-trip (:88-128) — any new option must be
  added to *both* or it is silently lost on crash-recovery re-submit.
- `app/api/routers/projects_assembly.py:254-266` — the one production submission site for
  the audiobook `AssemblyTask`.
- `app/domain/chapters/assets.py:10-50` — `export_chapter_audio`: synchronous WAV→MP3 with
  an **mp3 cache** (`mp3_path.exists()` short-circuit at :33) and tmp-file atomic replace;
  route at `app/api/routers/chapters_assets.py:67`.
- `app/api/routers/chapters_assets.py:16, 39-63` — the lazy per-WAV-locked peaks GET route
  (`_load_or_compute_peaks_sidecar` → `ensure_peaks_sidecar`); the serving pattern for a
  loudness endpoint.
- `frontend/src/api/fetchPeaksSidecar.ts` + `frontend/src/api/contracts/peaksSidecar.ts` —
  the frontend contract-parse-fetch pattern to clone for a loudness sidecar.
- `app/db/state_settings.py:12-29` (`_default_state()["settings"]`) and
  `_normalize_settings` — where a new setting gets its default and normalization;
  `app/db/core.py:324` shows the `add_column_if_missing` migration pattern (available, but
  deliberately not used — see data model).
- `design-docs/specs/testing-standards.md` R1-R4; `design-docs/specs/audio-player.md`
  (peaks sidecar contract §5.4, referenced from the orchestrator emitter docstring);
  CLAUDE.md audio-format rule (render audio = WAV, exports/bundles = MP3) and
  `.agent/rules/modular_architecture.md` (no import-time side effects; no engine-ID
  branching; validated artifact metadata over raw file existence).

## The plan

### Design decisions (made up front, with reasons)

1. **Analysis result = a loudness sidecar, not a DB column.** Store
   `<chapter>.loudness.json` next to the canonical WAV, cloning the peaks-sidecar cache
   contract (own `LOUDNESS_SIDECAR_VERSION`, freshness by source size/mtime, atomic write,
   None-on-failure). Reasons: (a) freshness is automatic — a re-rendered WAV invalidates
   the verdict by stat mismatch, exactly matching the "validated artifact metadata, not
   raw file existence" rule; a DB column would go stale silently on re-render; (b) no
   schema migration (ask-first territory per the mandate); (c) the serving/broadcast
   plumbing already exists for this shape. The pass/warn/fail "column" is **derived** in
   the API response, never persisted as a standalone flag.
2. **Metrics: `loudnorm` analysis pass + `astats`.** ACX gates are RMS ∈ [-23, -18] dBFS,
   true peak ≤ -3 dBTP, noise floor ≤ -60 dB RMS. `ffmpeg -af loudnorm=print_format=json`
   yields `input_i` (LUFS), `input_tp`, `input_lra`, `input_thresh`; RMS and noise floor
   come from `astats` (or a measured quiet-window RMS). Sidecar stores raw measurements +
   a `checks` block (each check: measured value, threshold, `pass|warn|fail`) + an overall
   verdict; thresholds live in one constants block in `audio_qa.py` so "warn" margins are
   tunable in one place.
3. **Normalization is per-chapter WAV-in/WAV-out, applied *before* stitch/encode — never
   inside `stitch_segments`.** Stitch is `-c copy` (`audio_ops.py:137`); m4b assembly
   re-encodes once. Two-pass `loudnorm` (analysis measurements → `measured_*` apply pass)
   on each chapter WAV into a temp file consumed by assembly. The canonical chapter WAV on
   disk is **not** mutated (immutability of validated artifacts; re-analysis and the
   waveform tape must keep matching what the user rendered). This satisfies both the
   "assembly option" and the FUTURE_WORK:39 "in the export chain, not a task class" rule —
   no new `StudioTask` subclass; the work happens inside `AssemblyTask.run()` /
   `export_chapter_audio`.
4. **Engine-agnostic by construction:** everything keys off the canonical chapter WAV at
   the orchestrator's single completion point — no engine IDs anywhere (INV-5).

### Slices (each independently landable, ordered)

**S1 — `app/engines/audio_qa.py`: analysis core.**
New module (backlog names it; also keeps `audio_ops.py`, already 335 lines, from growing
past the 500-line split threshold). Contents: ACX threshold constants;
`measure_loudness(wav_path) -> LoudnessMeasurements | None` (runs the ffmpeg
`loudnorm`+`astats` analysis via a subprocess with timeout, parses JSON from stderr —
`loudnorm` prints there); `evaluate_acx(measurements) -> AcxReport` (pure function:
measurements → per-check pass/warn/fail + overall); `compute_loudness_sidecar`,
`loudness_sidecar_path` (`.loudness.json`), `ensure_loudness_sidecar` — reusing
`_read_fresh_sidecar`/`_atomic_write_sidecar` from `audio_ops.py` (import them; they are
already sidecar-generic — if their peaks coupling bites, lift them into a shared helper in
the same commit rather than copy-pasting). No import-time side effects, plain functions.

**S2 — Orchestrator emit hook.**
`_emit_chapter_loudness_sidecar(context)` in
`app/orchestration/scheduler/orchestrator.py`, a third sibling next to
`_emit_chapter_peaks_sidecar` (:287) with the identical scope guard (synthesis + chapter
scope + `.wav`) and identical best-effort/swallow contract, called at the same completion
point in `submit()`. This gives every fresh render an up-to-date verdict without blocking
or failing the render.

**S3 — API surface.**
`GET /api/chapters/{chapter_id}/assets/loudness` in
`app/api/routers/chapters_assets.py`, cloning the peaks route (:39-63): resolve canonical
WAV via the existing containment-checked helpers, per-WAV-path lock,
`ensure_loudness_sidecar` (lazy compute covers chapters rendered before this feature
shipped). Response = the sidecar plus the derived `verdict` field. Optionally include the
verdict in the chapter-list hydration payload by reading (never computing) fresh sidecars —
list endpoints must stay cheap, so a missing/stale sidecar reports `"unknown"` there.

**S4 — Frontend pass/warn/fail column.**
`frontend/src/api/contracts/loudnessSidecar.ts` + `fetchLoudnessSidecar.ts` cloning the
peaks pair (`fetchPeaksSidecar.ts` derives the URL by path-segment replacement — same
trick). Column in the Book/Contents chapter table (`frontend/src/pages/Book/`):
pass/warn/fail/unknown badge; detail popover lists each check with measured vs. threshold
(the *why*, not just a color). Verdict presentation is factual measurements — no fabricated
values when the sidecar is absent (the progress no-fabrication principle generalizes:
`unknown` is rendered as unknown). Design review by the designer profile before merge; the
column is a release-facing surface.

**S5 — Optional EBU R128 normalize at assembly.**
- `normalize_chapter_wav(in_wav, out_wav, measurements, *, on_output, cancel_check) -> int`
  in `audio_qa.py`: two-pass loudnorm apply (targets: I=-20 LUFS / TP=-3 dB — inside the
  ACX RMS window; constants next to the thresholds), running through `run_cmd_stream` like
  `wav_to_mp3` so cancellation and test-patching keep working.
- `AssemblyTask` gains `normalize_loudness: bool = False`: added to `__init__`,
  `describe()` payload, **and `from_task_context`** (assembly.py:88-128 — both sides or
  crash-recovery drops it). In `run()`, when set: for each chapter input, analysis →
  normalize into a temp sibling → feed temps to `assemble_audiobook`/`stitch_segments` →
  clean temps in `finally` and in `on_cancel`.
- Setting `acx_normalize_on_assembly` (default `False`) in
  `app/db/state_settings.py:_default_state` + `_normalize_settings` (bool coercion),
  surfaced via the existing settings router; the submission site
  (`projects_assembly.py:254`) reads it (or a per-request override in the assemble
  endpoint's payload) into the task. Default stays off: normalization changes audio, and
  audio-quality defaults are an owner perceptual call — stage A/B samples, don't assert.

**S6 (optional, cheap) — normalize on chapter MP3 export.**
`export_chapter_audio` (`app/domain/chapters/assets.py:10`) grows a
`normalize: bool = False` keyword: when set, run the loudnorm apply into the temp WAV
before `wav_to_mp3`, and name the cached artifact distinctly
(`<stem>.acx.mp3` vs `<stem>.mp3`) — the existing `mp3_path.exists()` cache (:33) would
otherwise serve a non-normalized cached file after the user toggles the option.

**Docs, same commits:** this creates new behavior in areas covered by
`design-docs/specs/audio-player.md` (sidecar family) and `queue-jobs.md`/assembly — add
the loudness-sidecar contract where the peaks contract lives (spec_version bump +
changelog row), a `wiki/Changelog.md` entry when it ships, and a code-map changelog-queue
entry per slice.

### Test strategy

All backend tests mock at the ffmpeg boundary only (R2): patch
`app.engines.proc_utils.run_cmd_stream` / `subprocess.run` to return canned `loudnorm`
JSON stderr and `astats` output — never patch `audio_qa` internals in `audio_qa` tests.

- **S1:** table-driven `evaluate_acx` tests (pure function — pass, each warn band, each
  fail, boundary values exactly at thresholds); `measure_loudness` JSON-parse tests
  including malformed/empty ffmpeg output → None; sidecar freshness/staleness/version-bump
  tests mirroring the existing peaks-sidecar tests; timeout → clean None (no hang, R4:
  no sleeps — drive via the mocked runner, not wall clock).
- **S2:** orchestrator emit tests mirroring the peaks-emitter tests: fires for
  chapter-scope synthesis completion, NOT for segment scope / assembly / non-wav; an
  exception inside the emitter never changes the published task result.
- **S3:** route tests — fresh sidecar served without recompute; stale (touched WAV)
  recomputes; missing WAV → 404-shaped response; path containment holds for hostile
  chapter ids.
- **S5:** `AssemblyTask` payload round-trip test (`describe` → `from_task_context`
  preserves `normalize_loudness` — this is the classic silent-loss bug); run() with flag
  set invokes normalize per input and stitches temps, with flag clear is byte-identical to
  today's call sequence; temps cleaned on failure and on cancel.
- **Frontend (S4):** vitest contract-parse tests cloning the peaksSidecar contract tests;
  column renders pass/warn/fail/unknown from hydration data; `waitFor`, no timers (R4).
- **One real-ffmpeg integration test** (marked, using a tiny generated sine WAV fixture):
  measure → evaluate → normalize → re-measure lands inside the ACX window. This is the
  only test allowed to touch real ffmpeg; everything else is boundary-mocked.
- **R1 discipline:** the emitter-scope tests, the payload round-trip test, and the S6
  cache-key test are the bug-shaped ones — each lands with its slice and must be
  revert-checked (stash the production change, confirm red, restore). Threshold
  table tests must assert against the ACX numbers literally, not against the constants
  they test (a test importing the constant and comparing it to itself is the
  "re-implements the unit's math" anti-pattern the standards ban).

### Sequencing

S1 → S2+S3 (parallel, both depend only on S1) → S4 → S5 → S6. S1-S4 ship the QA half
(pure-additive, zero audio mutation — low risk, mergeable alone); S5-S6 ship
normalization behind a default-off setting. Two PRs along that seam.

## Confidence + what would change it

**High** on the hook points, sidecar shape, the `-c copy` constraint forcing per-chapter
pre-stitch normalization, the AssemblyTask round-trip requirement, and the test strategy —
all read directly from current code. **Medium** on two things: (a) exact ACX metric
sourcing — `loudnorm` reports LUFS while ACX specifies RMS dBFS; the plan's
`astats`-for-RMS split is standard practice but the precise ffmpeg filter recipe (and
whether measured RMS on TTS speech needs a speech-gated window) should be validated
against the real-ffmpeg fixture before freezing the sidecar schema; (b) whether
`_read_fresh_sidecar`/`_atomic_write_sidecar` reuse is clean or needs a small shared-helper
lift — a 10-minute check at implementation time. A decision to persist the verdict in the
chapters table instead of the sidecar would restructure S3/S4 and require the ask-first
schema-migration gate — I recommend against it for the staleness reason above.

## What I couldn't determine

- The exact Book/Contents-hub table component file for the column (the Book page tree is
  large; S4's implementer should locate the chapter-row component at execution time —
  `frontend/src/pages/Book/`).
- Whether the assemble endpoint should take a per-request `normalize` override vs. the
  global setting only — product call; plan supports either, defaulting to setting-only.
- Final normalize targets (I=-20 LUFS is a reasonable ACX-window default) and warn-band
  margins — perceptual/owner territory; the plan isolates them in one constants block and
  ships default-off precisely so the owner can A/B before any default changes.
- Whether M4B assembly's own AAC encode step alters loudness enough to matter post-
  normalization (worth one measurement in the integration test).
