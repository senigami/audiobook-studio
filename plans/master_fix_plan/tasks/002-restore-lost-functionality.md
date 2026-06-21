# 002 — Wire orphaned features (W3, re-scoped 2026-06-20)

**Status: DONE (2026-06-21)** — WIRE-1 VoiceDropzone mounted in the New Voice modal; WIRE-2 VoiceModules live as a "Module Settings" tab on /engines; WIRE-3 SearchableSelect swapped into the move-variant speaker picker. Committed on `studio2/phase-12.5-style`.

**Owner decision (06-20):** the *lost* Book-pipeline/Studio features (RST-1..8) are **folded into the
IA port (003)** as a carried checklist — they are NOT a separate restore-first step. This task is
re-scoped to only the **orphaned features that aren't part of the book IA** and can be wired
independently.
**Authoritative source:** [`simplification/07_restore_lost_functionality.md`](../../simplification/07_restore_lost_functionality.md)
(WIRE-1/2/3 section).

**In scope here (independent of the port):**
- **WIRE-1** VoiceDropzone → voice-creation modal (samples at creation + duration validation).
- **WIRE-2** VoiceModules → a live page (per-engine settings/diagnostics). *Confirm placement
  (Engines tab vs Settings) with owner before building — its own larger sub-effort.*
- **WIRE-3** SearchableSelect → replace plain `<select>`s in speaker-assignment surfaces.

**Moved OUT of this task (now owned by 003 / 004):**
- RST-1..7 (chapter-list progress bar/play/download/guards, in-Studio edit, default-voice picker,
  engine banner) → **carried by 003** (the IA port rebuilds those surfaces).
- RST-8 (segment-aware global player) → **delivered in 004**, using the segment logic preserved per INV-4.

**Map links:** W3 (re-scoped). Independent of the port; no longer gates the dead-tree deletion (that
gate moved to 004→003). Honors INV-1, INV-7. Specs: `voice-bundles.md` (WIRE-1), `engines-and-plugins.md`
(WIRE-2).
**Dependencies:** none. Parallel-safe.
**Acceptance:** each wired feature works + owner visual verification; relevant tests.
**Out of scope:** the RST-* lost-feature restoration (now in 003/004).
