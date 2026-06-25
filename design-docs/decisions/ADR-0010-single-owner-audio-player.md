# ADR-0010: Single-Owner Global Audio Player

**Date:** 2026-06-13  
**Status:** Accepted (implementation lands in the redesign Phase R4; see `design-docs/plans/site_redesign_rollout/06_phase_r4_player_review.md`)  
**Deciders:** Studio owner

## Context

Before the redesign, audio playback was spread across multiple independent owners: the VCR-style segment player at the bottom of the Chapter Editor, an inline `<audio>` element in the chapter header, inline players on chapter rows, and separate preview players in the Voices area. These competed for screen space and attention, could play over each other, and stopped whenever the user navigated away — which is exactly the wrong behavior for a listening-review workflow where audio should keep playing as you move between screens.

The redesign introduces a persistent, full-width bottom **player bar** (north-star decision 8 / Q6) that must own every kind of playback: segment auditions, rendered chapters, voice previews, and assembled books. That only works if there is a single source of truth for "what is playing."

## Decision

There is exactly one audio owner in the application.

- A single `playerBus` store holds all playback state (`scope: segment | chapter | preview`, title, audio URL, playing, position, duration, and optional prev/next within the scope).
- Exactly one `<audio>` element exists, living in the `PlayerBar`. Nothing else instantiates an audio element or calls `play()` on its own.
- Every former player becomes a thin **adapter** that dispatches `load`/`play`/`pause`/`seek`/`clear` to the bus. The VCR control keeps its segment-sequencing logic but drives the bus rather than its own element.
- Loading a new source stops the previous one (single owner — no overlapping audio).
- The player bar is hidden when nothing is loaded (no false affordance) and persists within a book as the user navigates.

The contract is specified in `design-docs/specs/audio-player.md`.

## Consequences

### Positive

- No competing or overlapping audio; one obvious place to control playback.
- Audio survives navigation, which is what the Review listening workflow needs.
- New playback surfaces (Review follow-along, future waveform) consume the same bus instead of adding more elements.

### Negative / Trade-offs

- Every existing player must be converted to an adapter; their tests are updated rather than deleted, and the segment-sequencing logic must be preserved through the conversion.
- A single element means cross-cutting concerns (scope switching, follow-along position) concentrate in one module, which must stay well-factored.

### Neutral

- Waveform rendering (wavesurfer.js) shipped in R7: `WaveformStrip` lazy-loaded, toggle persisted, seek-on-click via `bus.seek()`.
- Intra-section highlight precision in Review is limited by the absence of per-word timing data — chapter audio is sequenced from per-segment files, so the follow-along highlight tracks at segment granularity.
- **R7 scope model note (2026-06-14):** the `altScope` field + `switchScope()` enable a Segment↔Chapter toggle when both sources are available for the same context. The Review stage registers the first rendered segment as an `altScope` when loading a chapter (best-effort: no fabricated URL). If only one scope exists, the passive badge renders instead. This is a minimal scope model; cycling through more than two scopes is not yet supported.
