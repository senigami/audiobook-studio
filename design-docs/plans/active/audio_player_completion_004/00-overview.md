# Overview

## Status (2026-07-18)

All 9 tasks (Workloads A/B/C) are **complete** and gate-green (build/lint/test/pytest). Owner visual/functional sign-off is the only remaining step — see `02-roadmap.md`'s three sign-off checklists. Do not archive this folder until sign-off is recorded.

## The task

Finish plan 004 (Audio player + waveform scrubber, map ref **W5**), across three workloads:

1. Wire the already-built `WaveformTape`/`WaveformTapeZoom`/`WaveformTapeMinimap` components into the live `PlayerBar` (W2 finish).
2. Fix real segment/block-navigation bugs on the global player's one live segment-playback path (RST-8).
3. Compute waveform peaks server-side so long chapters get a scrub waveform without a risky full-WAV browser decode (W3).

## Goal

A user can: open any chapter under ~10 minutes and get a scrubbable "tape" waveform view from the global player bar (zoom, minimap, paged/moving motion, reduced-motion-safe); play a segment from the Cast tool and have Prev/Next correctly navigate between distinct audio blocks (not naive per-segment stepping) with a passive "Block N of M" label in the bar; open a chapter *over* 10 minutes and still get the tape, fed by a server-computed peaks sidecar instead of a browser decode.

## Explicitly out of scope (do not implement, even if related code is touched)

- The "Play book" whole-book sequential-chapter affordance — duplicative of the shipped `ContinueListeningCard.tsx`; the real remaining need (chaining unassembled per-chapter renders from the Library page) is unrelated, logged separately.
- Synced text auto-scroll — a materially different feature, logged separately.
- Any "virtualization" of the tape/minimap rendering — verified false premise (both renderers already do O(visible-bars) work per frame).
- Annotation / edit-marking (post-V2).
- Any change to `playerBus.ts`'s public API/state shape.

## Constraints (still binding for any future touch-up in this area)

- **INV-4** (`design-docs/plans/master_fix_plan/01-map.md`): `useStudioChapter.ts`'s segment-playback exports must not be stripped.
- **INV-7**: all new CSS references `var(--token)` with a dark-mode value.
- Single-`<audio>`-owner invariant (ADR-0010): only `PlayerBar.tsx` and the voice-sample-duration-probe exemption in `VoiceDropzone.tsx` may touch `<audio>`/`new Audio(`.
- Peaks sidecar carries `"version": 1` (versioned-contracts directive).
- Testing standards: R1/R2/R4 (see `design-docs/specs/testing-standards.md`).

## Definition of done

- **Workload A:** build/lint/test green; owner visual sign-off recorded (tape open/close, zoom, minimap, motion toggle, reduced-motion, duration-cap fallback).
- **Workload B:** owner visual sign-off recorded (correct Prev/Next block navigation + label in the running app).
- **Workload C:** owner visual sign-off recorded (a real long chapter renders the tape from the sidecar, confirmed via network tab).
- `design-docs/plans/TASKS.md`'s 004 entry reflects reality once this plan is archived.

Note: `design-docs/specs/audio-player.md` cites this exact plan path (§1 implementation-status paragraph) — keep this folder's path stable until archived, and update that citation in the same change that archives this folder.
