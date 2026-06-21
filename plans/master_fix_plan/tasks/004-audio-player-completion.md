# 004 — Audio player completion (W5)

**Status: NOT STARTED** — RST-8 (segment-aware player) deferred by owner; this task is blocked pending that decision. DC-1b dead-tree deletion in 005 remains gated here.

**Goal:** finish the global audio player: make it **scope-agnostic and segment-aware**, and port the
waveform-tape scrubber from the demo mock to the live app.
**Authoritative sources:** [`audio_player_waveform_scrubber/`](../../audio_player_waveform_scrubber/README.md)
W1–W3 (06-16) **+** [`simplification/07`](../../simplification/07_restore_lost_functionality.md) RST-8
(segment-awareness, 06-19). **These two describe the same player — execute them together.**
**Supersedes:** `audio_player_scrubbing_waveform_proposal.md` (archived).

**Open items:**
- **W1** (task 005): scope-agnostic live player — remove `altScope`/`switchScope`, implement
  `fitsLegibly()`, drop the scope toggle from the live `PlayerBar`.
- **RST-8 (from 002):** teach the global player a **segment model** so it can address segments and do
  block navigation — using the segment-playback logic preserved in `useStudioChapter` (INV-4).
- **W2** (tasks 006–009): port `WaveformTape` renderer + browser peak provider, zoom/minimap/ruler,
  PlayerBar integration, CSS + tests to the live app.
- **W3** (tasks 010–012): peaks source abstraction, backend sidecar emission, source-swap + virtualization.

**Map links:** W5. **RST-8 is part of the lost-feature restoration folded into the IA port (003) but
implemented here** — deliver alongside the Chapter workspace. The segment-playback logic it needs is
preserved per INV-4 (005's split must not strip it). Honors INV-4, INV-7. Spec: `audio-player.md`
(already at 1.6.0 — keep in sync).
**Dependencies:** INV-4 means the W2 large-file split of `useStudioChapter` (005) must not strip the
segment-playback exports before this lands; coordinate. RST-8 is the delicate part — characterize with
tests first.
**Acceptance:** live player is scope-agnostic + segment-aware; tape scrubber works; owner visual
verification; `audio-player.md` in sync.
**Out of scope:** the demo-mock tape (already done).
