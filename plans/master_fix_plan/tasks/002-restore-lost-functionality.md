# 002 — Restore lost functionality (W3)

**Goal:** restore the capabilities the v1→v2 redesign dropped (owner-confirmed 2026-06-19), and wire
in the features that were built but never connected — **before** the dead trees that contain them are
deleted (INV-2).
**Authoritative source:** [`simplification/07_restore_lost_functionality.md`](../../simplification/07_restore_lost_functionality.md)
(newest, 06-19) — execute RST-1..RST-8 + WIRE-1/2/3 verbatim. This is a brand-new workstream; nothing
older covers it.

**Open items (full detail in source):**
- RST-1 per-row live progress bar · RST-2 chapter play via **global player** (not a hosted bar) ·
  RST-3 audio download · **RST-4 destructive-action guards (rebuild + large-chapter + delete/reset
  confirms) — highest value, do first** · RST-5 in-Studio source edit · RST-6 chapter default-voice
  picker · RST-7 engine-unavailable banner in Studio · **RST-8 segment-aware global player (preserve
  segment logic — INV-4)** · WIRE-1 VoiceDropzone · WIRE-2 VoiceModules page · WIRE-3 SearchableSelect.

**Map links:** W3. **HARVESTS FROM** W2's dead trees → must precede 005's DC-1b deletion (INV-2).
**Shares the Book pipeline surface with W4 (003)** — coordinate. **RST-8 merges with W5 (004)** — the
segment-aware player and the audio-tape player are the same player. Honors INV-4, INV-7.
**Dependencies:** none to start; **gates** 005 dead-tree deletion. ⚠️ OWNER FORK: confirm W3↔W4
sequencing (see roadmap) before RST-1/5/6 (the Book-pipeline UI restores) — they may be better done
*as part of* the IA port.
**Acceptance:** each restored feature works + owner visual verification (light+dark); relevant tests;
specs touched: `site-shell-and-book-pipeline.md`, `audio-player.md` (RST-8), `voice-bundles.md` (WIRE-1).
**Out of scope:** deleting the old trees (that's 005 DC-1b, gated on this).
