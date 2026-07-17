# 01 — Timing sidecar contract

> **Provisional pending Task 1.** This doc reflects the Fable review
> corrections (see `04-roadmap.md` Task 1) but the exact finalization call
> site and funnel function name are confirmed by Task 1's findings, not
> assumed here.

## Terminology: "segment" in this plan == chunk group

The owner's mental model of "segment" throughout this feature is the render
unit the code calls a **chunk group**
(`app/domain/chunk_groups.py:47-88`): consecutive same-character
`chapter_segments` rows merged and rendered as **one WAV** (up to the engine's
`text_chunk_limit`). Multiple `chapter_segments.id`s can point at the same
`audio_file_path`. This plan's granularity is **one timing entry per rendered
WAV (per group)** — confirmed as the intended granularity, not a compromise.
Each timing entry lists its member `segment_ids[]` so the frontend can still
resolve individual segment text/character within the group's window if useful,
but the reader advances **per group**, not per underlying DB segment.

## Artifact

- **Filename:** `<chapter_wav_stem>.timing.json`, written in the same chapter
  audio directory as the chapter WAV (resolved via
  `resolve_chapter_asset_path(project_id, chapter_id, "audio", …)`). Mirrors
  the existing `.peaks.json` waveform sidecar convention
  (`app/api/routers/chapters_assets.py`).
- One sidecar per chapter WAV. Rewritten atomically on every stitch (temp file
  + rename, matching the repo's atomic-write pattern).

## Schema (version 1)

```json
{
  "schema": "chapter_segment_timing",
  "version": 1,
  "chapter_id": "ch_abc123",
  "audio_file": "chapter_ch_abc123.wav",
  "audio_generated_at": 1699999999.0,
  "audio_duration_ms": 754320,
  "generated_at": 1699999999.0,
  "group_count": 42,
  "groups": [
    {
      "group_id": "grp_0001",
      "segment_ids": ["seg_0001", "seg_0002"],
      "order": 0,
      "start_ms": 0,
      "end_ms": 3180,
      "duration_ms": 3180
    }
  ]
}
```

### Field rules

- `version` (int) — bumped on any breaking schema change. **Validated at load
  time**; a mismatch is treated as "no usable timing" (reader falls back to
  "unavailable," see `03-reader-frontend.md`; backend rewrites on next
  stitch). Follows the `SIDECAR_VERSION` precedent in `app/engines/audio_ops.py`.
- `schema` (str) — stable discriminator so the loader rejects a wrong-shaped
  file rather than mis-parsing it.
- `audio_generated_at` — copied from the chapter's own `audio_generated_at`
  timestamp (the value `_persist_mixed_chapter_output`-equivalent finalization
  writes when the chapter WAV completes — exact field pinned by Task 1). The
  serving route 404s if this doesn't match the live chapter record, so a
  sidecar can never be served against a WAV it wasn't generated for
  (**staleness binding** — Fable H3).
- `groups[]` — **ordered by `order`**, and `[start_ms, end_ms)` **tile the
  timeline gaplessly**: `groups[i].end_ms == groups[i+1].start_ms`, first
  `start_ms == 0`, last `end_ms == audio_duration_ms` (± tolerance, see below).
- `group_id` / `segment_ids[]` — `group_id` is a stable synthetic id (e.g. the
  first member segment's id, or a hash of the member set — Task 1/Task 2
  decides); `segment_ids` are `chapter_segments.id`s so the frontend can join
  text/character per member. If a member segment is later deleted, the group
  entry simply carries a shorter/stale `segment_ids` list — the reader still
  has real timing, just degrades gracefully on text lookup.
- **No `kind` field, no `sample_rate` field, no `char_count` field** (cut —
  see below).

## Which groups get an entry

- The contributing set is simply **chunk groups with non-empty rendered
  text/audio** — the same set the stitcher concatenates
  (`chunk_groups.py:58` filters to non-empty text). **Cut the silence/SFX
  timing-entry idea from the original draft**: `rendering.py:101` maps
  `SILENCE → OMIT` in all audio modes today, and the rendering matrix isn't
  even wired into the render pipeline yet — silence/SFX segments produce no
  audio to time. If/when that changes, this contract can add entries for them
  then; it does not need to model audio that doesn't exist today.
- The set of contributing groups and their order **must be derived from the
  exact same list the stitcher concatenates** (not re-derived independently),
  so timing and audio agree by construction. Task 1 pins the authoritative
  source (the stitcher's own ordered WAV-path list, mapped back to group/member
  ids — not a fresh DB query that could drift from what was actually stitched).

## Duration measurement (no estimation)

- Render audio is WAV. Read each group's WAV duration from the **WAV header**
  (frames ÷ sample rate via Python's stdlib `wave`) — cheap, no subprocess per
  group. Accumulate a running offset in **milliseconds (int)** to avoid float
  drift.
- After building the map, probe the **assembled chapter WAV** duration
  (`get_audio_duration` in `app/engines/audio_ops.py`, or a WAV-header read)
  and set `audio_duration_ms` from it.
- **Reconciliation:** assert `sum(group durations) ≈ chapter duration` within a
  tolerance (e.g. ≤ 50 ms total, or ≤ 1 frame × group_count). On drift beyond
  tolerance, log a warning with both totals and **snap the last group's
  `end_ms` to `audio_duration_ms`** so the timeline still tiles exactly. Drift
  beyond a hard ceiling fails the sidecar write (no sidecar is safer than a
  wrong one).
  - **Known risk (Fable H2):** stitch uses `ffmpeg -f concat -c copy`
    (sample-exact, no re-encode) **only if every input shares sample
    rate/channels** — `audio_ops.py:124`'s comment admits this is assumed, not
    guaranteed, across engines. A chapter mixing engines with different output
    rates could produce genuinely wrong concat timing, not just measurement
    drift. Task 3 must add an explicit test with mismatched-rate fixture WAVs
    to confirm the tolerance/hard-ceiling guard actually catches this rather
    than silently producing a corrupt sidecar.

## Cut from the original draft (Fable findings)

- `sample_rate` at the sidecar root — chapters can mix engines/rates; a single
  root-level value would be misleading. Dropped entirely (not needed by any
  consumer).
- `char_count` per entry — telemetry with no consumer. Dropped; the frontend
  already has segment text via the existing chapter-segments fetch.
- `engine_id` at sidecar root — same reasoning as `sample_rate`; a chapter can
  span engines. Dropped.
- `kind` — see "which groups get an entry" above; no non-speech entries exist
  today, so no discriminator is needed yet.

## Where the contract lives in code

- A typed model + `validate_timing_sidecar(raw) -> ChapterGroupTiming` under
  `app/domain/chapters/` (sibling to `performance_schema.py`, same
  strict-model + explicit-validation pattern). Both the writer and the serving
  route import it, so the shape has one definition.
- A matching TypeScript type in `frontend/src/api/contracts/` (or the nearest
  existing contracts location) so the frontend consumes a typed shape.
