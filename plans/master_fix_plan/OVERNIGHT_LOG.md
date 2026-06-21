# Overnight work log + questions for owner

Autonomous session starting 2026-06-21 (branch `studio2/phase-12.5-style`). Minimal-chatter mode.
Each commit is task-labeled (S-id / WIRE-id / task number) for later bug cross-checking against studio-2.0.

## Done (committed + pushed)
- **S11** (ffmpeg concat quoting) — verified the audit was WRONG; current `'\''` escaping is correct, double-quoting breaks concat. No code change; regression tests added. `c18dd385`
- **S7** (rate-limiter docs) — documented in-memory/per-process + IP-key limits; `security.md` → 1.2.2. `9ce5c6a5`

## Questions for owner (non-blocking — held per instruction)
1. **S12 / Dependabot deps** — you rejected the `npm audit fix` call. 3 dev/build-only alerts remain (vite 7.3.2→>7.3.4, @babel/core, js-yaml). Want me to bump them, or are you handling these via Dependabot PRs against main? (Held.)
2. **WIRE-1 (VoiceDropzone) + WIRE-3 (SearchableSelect)** — built-but-unwired UI. Both need visual verification + a UX call (which `<select>`s to swap). Held for supervised so I don't ship UI blind.
3. **S6 (WebSocket auth)** — needs a decision: origin-check vs query-token on upgrade. Held.
4. **WIRE-2 (VoiceModules page)** — placement: Engines tab vs Settings? Held.
5. **S10 (secret-aware plugin settings)** — this is a *versioned contract* change (`plugin-contract.md`). Implementing with tests; flag for your contract review.

## Noted for the IA port (task 003) — owner guidance 2026-06-21
- Demo = North Star for the layout (chapter-library tab rearrangements included). Take design liberties toward a genuinely good interface; triage as needed.
- Model: **book starts with an index and reads like a book; chapters have their own flow, separate from the book.** Already documented + reflected in the demo.
- Still gated on the owner pipeline design review for the full build; this guidance feeds it. Not built tonight (visual-verification-heavy).

## In progress / planned tonight (safe, backend, no visual check)
- PL-6 (document the live xtts adapter / redundant `to_bridge_request`, INV-5)
- S10 (secret-aware plugin settings, with tests)
- task 005 backend cleanup / bounded large-file splits (behavior-preserving, test-gated)
