# Overview

## The task

Finish plan 004 (Audio player + waveform scrubber, map ref **W5**) completely, across three workloads:

1. Wire the already-built `WaveformTape`/`WaveformTapeZoom`/`WaveformTapeMinimap` components into the live `PlayerBar` (W2 finish).
2. Fix real segment/block-navigation bugs on the global player's one live segment-playback path (RST-8).
3. Compute waveform peaks server-side so long chapters get a scrub waveform without a risky full-WAV browser decode (W3).

## Goal

A user can: open any chapter under ~10 minutes and get a scrubbable "tape" waveform view from the global player bar (zoom, minimap, paged/moving motion, reduced-motion-safe); play a segment from the Cast tool and have Prev/Next correctly navigate between distinct audio blocks (not naive per-segment stepping) with a passive "Block N of M" label in the bar; open a chapter *over* 10 minutes and still get the tape, fed by a server-computed peaks sidecar instead of a browser decode.

## Scope boundaries

**In scope:** the three workloads above, exactly as specified in each workload's task files.

**Explicitly out of scope** (do not implement, even if related code is touched):
- The "Play book" whole-book sequential-chapter affordance. Confirmed duplicative of the already-shipped `ContinueListeningCard.tsx` (`scope: 'book'` + a fully-assembled audiobook URL). The real remaining need — chaining *unassembled* per-chapter renders from the Library page — requires Library-page chapter-audio hydration that doesn't exist today and is unrelated to this plan. Logged separately as a future backlog item.
- Synced text auto-scroll (owner's longer-term idea: precompute per-segment timing so the reading view can track playback position). A materially different feature (touches Book/Booth reading UI, needs its own timing-data design), logged separately, not part of this plan.
- Any "virtualization" of the tape/minimap rendering. Verified false premise — both renderers already do O(visible-bars) work per frame regardless of total peak-array length. Do not add windowing/slicing logic.
- Annotation / edit-marking (post-V2 everywhere in the source docs).
- Any change to `playerBus.ts`'s public API/state shape. Neither RST-8 nor W3 need one — see `01-map.md` connections.

## Constraints

- **INV-4** (`design-docs/plans/master_fix_plan/01-map.md`): `useStudioChapter.ts`'s segment-playback exports (`playbackQueue`, `playbackBlockStartIds`, `currentPlaybackBlockIndex`, `activePlaybackLabel`, `playSegment`, `startSkim`/`stopSkim`) must not be stripped.
- **INV-7** (same file): all new CSS must reference `var(--token)` with a dark-mode value for every token used — no hardcoded hex/rgb.
- Single-`<audio>`-owner invariant (ADR-0010): only `PlayerBar.tsx` and the voice-sample-duration-probe exemption in `VoiceDropzone.tsx` may touch `<audio>`/`new Audio(`.
- Every contract/manifest declares an explicit version validated at load time (owner directive) — the new peaks sidecar file carries `"version": 1`.
- Testing standards (`design-docs/specs/testing-standards.md`): R1 revert-check every bug-fix test, R2 mock only outside the unit under test, R4 no sleep-based timing.
- No import-time side effects; anything with side effects goes through the explicit boot sequence or an existing sanctioned side-effect pathway (an HTTP request handler is fine; a new background thread/listener is not).

## Success criteria (definition of done)

- **Workload A:** `npm -C frontend run build`/`lint`/`test -- --run` all green; the two new PlayerBar-level tests pass; owner visual sign-off recorded (tape open/close, zoom, minimap, motion toggle, reduced-motion, duration-cap fallback — see `02-roadmap.md`).
- **Workload B:** the characterization tests (003) exist and originally documented the pre-fix bug; the fix (004) makes them pass and is revert-checked (R1: fails on pre-fix code); `design-docs/specs/audio-player.md` bumped with a changelog row; owner visual sign-off recorded (correct Prev/Next block navigation + label in the running app).
- **Workload C:** `./venv/bin/python -m pytest -q` and the frontend suite both green; a long chapter (mocked or real, >10 min) serves peaks from the sidecar route with no full-WAV browser decode (confirmed via network tab); `design-docs/specs/data-model.md` and `audio-player.md` both updated and cross-consistent.
- `design-docs/plans/TASKS.md`'s 004 entry reflects reality once this plan is archived.
