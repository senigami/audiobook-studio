# Overnight work log + questions for owner

Autonomous session starting 2026-06-21 (branch `studio2/phase-12.5-style`). Minimal-chatter mode.
Each commit is task-labeled (S-id / WIRE-id / task number) for later bug cross-checking against studio-2.0.

## Done (committed + pushed)
- **S11** (ffmpeg concat quoting) — verified the audit was WRONG; current `'\''` escaping is correct, double-quoting breaks concat. No code change; regression tests added. `c18dd385`
- **S7** (rate-limiter docs) — documented in-memory/per-process + IP-key limits; `security.md` → 1.2.2. `9ce5c6a5`
- **S6** (WebSocket Origin check) — CSWSH prevention on `/ws`; `security.md` → 1.2.3; revert-checked tests. `6657722b`
- **S10** (secret-aware plugin settings) — `secret:true` masked at the TTS-server source (covers bridge + external API); round-trip guard; `plugin-contract.md` → 1.4.0; 15 tests. `082bae1a`
- **S12** (Dependabot deps) — vite 7.3.5 / @babel 7.29.7 / js-yaml 4.2.0 → **npm audit: 0 vulnerabilities**. `33d0ccb7`
  → **Security backlog (task 009) COMPLETE.**
- **.gitignore root-cause fix** — bare `lib/` was hiding `frontend/src/pages/Book/lib/` (stages.ts, chapterJobs.ts untracked → studio-2.0 broken in fresh clones). Anchored to `/lib/`; tracked the hidden source files. `30b5c8d6`
- **IA port Phase 1** (task 003) — two-level shell: Contents·Cast·Publish·Backups + `/book/:id/chapter/:chapterId` workspace route; ManuscriptStage→ContentsStage + drill-through; Backups stub. 1376 tests. `ab87ed90`
- **IA port Phase 2** (task 003) — Chapter Workspace header (switcher/prev-next/back) + Review re-homed (Studio/Review toggle). 1388 tests. `596e8b4b`

## IA port — owner feedback addressed (2026-06-21)
- **Drill-through wired** (`4be1253b`) then **Open button removed** (`b7a2746f`) — clicking the chapter row opens the workspace (owner: "click the bar is the open, no Open button").
- **Review layout reworked** (`1020c8d8`) — left vertical chapter rail; selecting a chapter navigates + load+plays into a follow-along main pane; inline styles → token CSS. Owner approved the two-level structure ("looks pretty good, continue").

## IA port Phase 3 — Cast panel: FULL 3-TIER + temp characters — DONE (2026-06-21)
Owner chose the larger option (real chapter-scoped temp-character concept). Built as a vertical feature:
- **Backend** (`5ed500ec`): nullable `characters.chapter_id` (NULL=book, set=chapter-temp); idempotent
  migration; `get_characters` scope filter; `promote_character`; API create-with-chapter_id, list
  `?chapter_id`, `POST /characters/{id}/promote`; `data-model.md` → 1.2.0. 221 tests, R1-checked.
- **Frontend** (`2072bfcc`): CastPalette → 3 tiers (in-this-chapter / chapter temps / everyone else);
  "+ Temp character" + "Promote" actions; workspace hydrates chapter-scoped chars; temp badge.
  INV-4 + INV-7 honored; 1399 tests.

## IA port — also DONE this push (2026-06-21)
- **Contents publish-readiness CTA** (`7f3f293e`).
- **Bookmarks + jump-to-next-unrendered** (`5f678c0f`, localStorage).
- **RST-1..4** chapter-list restores: per-row progress bar / play via global player / download /
  destructive guards (`eb9ab2b2`).
- **RST-5,6,7** Studio restores: in-Studio source edit / chapter default-voice picker / engine banner
  (`4ca1e9e9`).

## REMAINING — needs owner input (batched questions 2026-06-21)
- **RST-8 segment-aware universal player** — deferred; the single riskiest item (touches the
  playback engine). Gates dead-tree deletion (DC-1b). Studio/Review toggle works as interim.
- **Per-span range assignment** (replace sentence-paint) — touches the segment/assignment model.
- **Lexicon + inline pronunciation** — needs a scope (book vs series/global) + representation
  (plain-text respelling vs IPA/SSML) + synthesis-integration decision.
- **Dead-tree deletion (DC-1b)** — gated on RST-8 harvest; husks (ProjectDetail/ChapterEditor) still
  referenced for segment-playback logic.
- **CastPalette.tsx now 745 lines** — over the 600 split threshold (task 005 follow-up).
- **a11y:** dark `--text-on-error` (#fff on #f87171 ≈ 3.5:1) — a Quiet-Studio palette decision.
- **Non-IA workstreams** (005 cleanup/splits, 006 namespace rename, 007 taxonomy v2, 008 UX/a11y/perf)
  — priority + (for 006) risk acknowledgement needed.

## IA port — remaining phases (task 003)
- **RST-8 (deferred, deliberate):** the deep segment-aware universal-player unification — the plan's highest-risk item ("characterize with tests, its own mini-project"). Not attempted in the autonomous blitz; needs a careful dedicated pass.
- **Phase 3–5 (taste-heavy):** cast-panel 3-tier, `Character ▾·Variation ▾` per-span control, range/span assignment, named bookmarks + jump-unrendered, inline pronunciation + lexicon. These are the most design-fluid pieces (owner: "not happy with everything, take liberties") — flagged for an owner eyeball of the Phase 1–2 shell before building, to avoid rework.

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
