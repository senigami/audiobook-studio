# Plan — ACX loudness QA + optional normalization

**Status:** DRAFT — awaiting twin + Fable plan review. No code changes made producing this plan.
**Feeds from:** `.agent/frontier-calibration/references/PL-1.md` (Fable planning reference,
2026-07-19) — a complete slice-by-slice plan; this document is a lean formalization of it.

## Problem / backlog item

`design-docs/plans/FUTURE_WORK.md:85-87`: ffmpeg `loudnorm` analysis per chapter, pass/warn/fail
column, optional EBU R128 normalize at assembly — must land inside the existing
`wav_to_mp3`/`export_chapter_audio`/assembly chain, not a resurrected task class.

## Design decisions (from the reference — see PL-1.md for full rationale)

1. **Analysis result = a loudness sidecar (`<chapter>.loudness.json`), not a DB column** — clones
   the existing peaks-sidecar cache contract (own version marker, freshness by source size/mtime,
   atomic write, `None` on failure). A DB column would go silently stale on re-render; the sidecar
   auto-invalidates. No schema migration needed.
2. **Metrics**: `loudnorm` analysis pass (LUFS/true-peak/LRA) + `astats` (RMS/noise floor) against
   ACX's actual gates (RMS ∈ [-23,-18] dBFS, true peak ≤ -3 dBTP, noise floor ≤ -60dB RMS).
   Thresholds live in one constants block for easy tuning.
3. **Normalization runs per-chapter WAV-in/WAV-out, before stitch/encode — never inside
   `stitch_segments`** (which is `-c copy`, a fast path that can't re-encode). Two-pass loudnorm
   into a temp file consumed by assembly; the canonical chapter WAV on disk is never mutated.
4. **Engine-agnostic**: keys off the canonical chapter WAV at the orchestrator's one completion
   point — no engine-ID branches.

## Tasks (mirrors the reference's slices — S1→S2+S3(parallel)→S4→S5→S6; two PRs along the seam)

1. **S1 — `app/engines/audio_qa.py` analysis core** (new module — keeps `audio_ops.py`, already
   335 lines, under the 500-line split threshold). ACX threshold constants; `measure_loudness()`
   (ffmpeg subprocess, JSON from stderr); `evaluate_acx()` (pure function, measurements → per-check
   verdict); the sidecar compute/read/write functions, reusing `_read_fresh_sidecar`/
   `_atomic_write_sidecar` from `audio_ops.py` if clean, else lift into a shared helper (10-minute
   check at implementation time). Tests (R1/R2/R4): table-driven `evaluate_acx` (pass/warn/fail/
   boundary values); malformed ffmpeg output → None; sidecar freshness/staleness/version-bump
   tests mirroring the existing peaks tests; timeout → clean None, no wall-clock sleeps.
2. **S2 — orchestrator emit hook** (parallel with S3, both depend only on S1): a third sibling
   emitter next to `_emit_chapter_peaks_sidecar`, identical scope guard (synthesis + chapter scope
   + `.wav`) and best-effort/swallow contract. Test: fires correctly scoped, an exception inside
   never changes the published task result.
3. **S3 — API surface** (parallel with S2): `GET /api/chapters/{id}/assets/loudness`, cloning the
   peaks route (containment-checked WAV resolution, per-path lock, lazy `ensure_loudness_sidecar`
   for pre-feature chapters). List-hydration payload reads (never computes) fresh sidecars —
   missing/stale reports `"unknown"`, never fabricated. Tests: fresh-served, stale-recomputes,
   missing-WAV, path-containment against hostile ids.
4. **S4 — frontend pass/warn/fail column**: contract + fetch helper cloning the peaks pair; a
   badge column in the Book/Contents chapter table with a detail popover (measured vs. threshold,
   not just a color). `unknown` renders as unknown, never fabricated. **Design review required
   before merge** — this is a release-facing surface. Tests: vitest contract-parse (cloned),
   column renders all four states from hydration data, `waitFor`/no timers (R4).
5. **S5 — optional EBU R128 normalize at assembly**: `normalize_chapter_wav()` in `audio_qa.py`
   (two-pass loudnorm apply, running through the existing `run_cmd_stream` for cancellation/test
   patching). `AssemblyTask` gains `normalize_loudness: bool = False` — **added to `__init__`,
   `describe()`, AND `from_task_context`** (the classic silent-loss-on-crash-recovery bug if only
   two of three). New setting `acx_normalize_on_assembly` (default `False` — audio-quality defaults
   are an owner perceptual call, stage A/B samples, don't assert). Tests: payload round-trip
   (describe→from_task_context preserves the flag — the bug-shaped test); flag-set invokes
   normalize per input; flag-clear is byte-identical to today; temp cleanup on failure and cancel.
6. **S6 (optional, cheap) — normalize on chapter MP3 export**: `export_chapter_audio` gains a
   `normalize: bool` keyword; cached artifact must be named distinctly (`<stem>.acx.mp3` vs.
   `<stem>.mp3`) or the existing MP3 cache serves a stale non-normalized file after toggling.
7. **One real-ffmpeg integration test** (marked, tiny generated sine-wave fixture): measure →
   evaluate → normalize → re-measure lands inside the ACX window. The only test allowed to touch
   real ffmpeg — everything else boundary-mocks (R2: never patch `audio_qa` internals in its own
   tests).
8. **Docs, same commits**: `audio-player.md` (sidecar family) + `queue-jobs.md`/assembly
   spec_version bumps + changelog rows; a `wiki/Changelog.md` entry when it ships; a code-map
   changelog-queue entry per slice.

## Open items for the owner

- Exact normalize targets (I=-20 LUFS proposed) and warn-band margins — perceptual call, isolated
  in one constants block, ships default-off so the owner can A/B before any default changes.
- Per-request normalize override vs. setting-only — plan supports either; defaults to setting-only.
- Whether M4B's own AAC encode alters loudness enough post-normalization to matter — worth one
  measurement in the integration test before finalizing.

## Out of scope

A new `StudioTask` subclass (explicitly forbidden by the backlog item) — everything lands inside
`AssemblyTask.run()` / `export_chapter_audio`.
