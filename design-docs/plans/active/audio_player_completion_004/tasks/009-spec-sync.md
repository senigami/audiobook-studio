Status: complete — 2026-07-10

# 009 — Spec sync: data-model.md + audio-player.md

Workload: C · Risk: `none` · Blocked-by: 006, 007, 008 · Blocks: none (Workload C done after this)

## Goal

Document the new peaks-sidecar contract in the binding specs, matching this repo's directive that behavior changes update the matching spec (bump `spec_version`, add a changelog row) in the same commit.

## Files

### Edit

- `design-docs/specs/data-model.md` (currently `spec_version: 1.9.0`)
- `design-docs/specs/audio-player.md` (currently `spec_version: 1.6.0` — or `1.6.1` if task 005 already landed; check first)

## Target shape / contract

### `data-model.md`

Add a new section: **"Chapter peaks sidecar (derived, lazily-computed artifact)"**. Cover:
- The contract JSON shape (mirror task 006's schema exactly: `version`, `peaks`, `duration_sec`, `sample_rate`, `channels`, `peaks_per_sec`, `source`).
- **Compute-on-request semantics**: no producer writes this eagerly; it's computed the first time it's requested (or found stale) by the serving route, then cached as a sibling file next to the WAV.
- **Staleness-by-source-stamp**: the sidecar is authoritative only while its `source.size_bytes`/`source.mtime_ns` match the current WAV's `stat()` — a mismatch means "treat as absent," never "serve anyway."
- **No manifest/DB field**: explicitly note that this does NOT extend `ArtifactOutputModel` or any DB table — it's a derived, self-describing file, matching the project's existing artifact-cache immutability model without touching it.
- Bump `spec_version` 1.9.0 → 1.10.0, add a changelog row.

### `audio-player.md`

Cross-check §5.4 (peaks strategy) for consistency with the above — update it to describe the actual shipped mechanism (lazy compute-on-request via the chapter-asset route) rather than any earlier draft's producer-hook framing. Bump `spec_version` accordingly (check the current version first — task 005 may have already bumped it to 1.6.1; this task goes one more, e.g. 1.6.2), add a changelog row.

## Steps

- [x] Check both specs' current `spec_version` (task 005 had already bumped `audio-player.md` to 1.6.1).
- [x] Add the new `data-model.md` section; bump version (1.9.0 → 1.10.0) + changelog row.
- [x] Update `audio-player.md` §5.4 (and §1's implementation-status paragraph, since the tape is now shipped, not "mid-migration"); bump version (1.6.1 → 1.6.2) + changelog row.
- [x] Cross-read both files once more for internal consistency (same field names, same compute-on-request/staleness-by-stat semantics described in both places).
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] Both specs accurately describe the compute-on-request mechanism actually shipped (tasks 006-008), not the rejected orchestrator-hook design.
- [x] Both `spec_version`s bumped with changelog rows.
- [x] No contradiction between the two specs' descriptions of the same contract.
- [ ] **Owner sign-off** (recorded in `../02-roadmap.md`'s Workload C checklist) — this is the last task; once ticked, Workload C (and the whole plan, pending A/B sign-offs) is done. *(Not verifiable by an automated agent — left for the owner.)*
