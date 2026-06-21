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

## Session end — what I judged unsafe to do blind (held, not abandoned)
After S11 + S7, the remaining backlog is gated on your input, needs visual verification, or is a
risky/sensitive change I shouldn't make unsupervised. Reasons:
- **S10 (secret-aware plugin settings)** — held. Not a single chokepoint: the read/serialize path
  spans `app/tts_server/settings_store.py` + the Studio engines router + the tts_client proxy.
  "Mask on read / never log" done incompletely is worse than not done (false security confidence).
  Plus it's a versioned-contract change. Wants your review. *(There's a clean pattern to follow:
  mirror the existing `_strip_read_only_settings(settings, schema)` with a `_redact_secret_settings`
  applied at the read chokepoint — but I need to confirm every read site first.)*
- **PL-6 (document the xtts/`to_bridge_request` redundancy)** — held. Documenting it accurately needs
  a full dispatch trace (registry-adapter path vs the bridge path at `orchestrator_helpers.py:442`);
  low value for the verification cost, and a wrong comment misleads. Note: `to_bridge_request` is NOT
  dead — `api_synthesis.py:147` calls it and the orchestrator reads it via `getattr`.
- **task 005 large-file splits** — held. The big files are core (`progress/service.py` 1449,
  `tts_server/server.py` 1333, `orchestrator_helpers.py` 1233) — exactly where a subtle break causes
  hard-to-find regressions; not safe to refactor blind. `events.py` (800) splits cleanly but it's a
  low-value reorg of a sensitive versioned-contract file. Best done supervised.
- **S6, WIRE-1/2/3, IA port (003)** — held per the questions above (decisions / visual verification).

**Net:** stopped after the cleanly-safe items rather than force risky work overnight (you said holding
off is OK). Everything done is behavior-preserving and easy to validate against studio-2.0.
