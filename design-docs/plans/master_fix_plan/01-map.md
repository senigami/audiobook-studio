# Implementation Map — all outstanding fix work

The big picture, the parts, and — most importantly — the **connections** between them. When an
executor opens a task, this map tells them what it touches and must not break.

## Big picture

Studio 2.0 is functionally complete; what remains is **cleanup**, **restoring redesign regressions**,
**finishing the live-app IA port**, and **release polish**. These are not independent piles — they
interlock. The two load-bearing couplings an executor must never forget:

1. **Harvest-before-delete:** the "dead" `ProjectDetail`/`ChapterEditor` trees still contain
   functionality the owner wants back. Restoration (W3) must extract those features *before* the
   simplification dead-code deletion (W2) removes the trees.
2. **Restore-with-the-port, not after:** the live-app IA restructure (W4) rebuilds the same surfaces
   the restoration (W3) targets. If they run uncoordinated, the port re-loses features or the
   restoration is thrown away. They share the Book pipeline as their work surface.

## The parts (workstreams)

| ID | Workstream | Authoritative source | Nature |
|----|-----------|----------------------|--------|
| **W1** | Foundation cleanup (deps, dead files, hardcoded colors, dead CSS) | `simplification/01` + folded `final_release/06 §1`, `09 D-items` | low-risk, unblocks all |
| **W2** | Code simplification (FE dead-code delete, styling separation, large-file splits, BE cleanup, plugin SDK consolidation) | `simplification/02–06` | refactor |
| **W3** | Wire orphaned features (VoiceDropzone, VoiceModules, SearchableSelect) — re-scoped; the chapter-list/Studio/player restores (RST-1..8) now fold into W4 | `simplification/07` (WIRE-*) | feature |
| **W4** | Book/Chapter IA port (two-level Book + Chapter workspace) — **replaces the broken 5-stage pipeline**; **carries the RST-1..8 lost-feature checklist** | `book_view_redesign/` + `book_view_ia_proposal` + `simplification/07` (RST-*) | redesign (primary) |
| **W5** | Audio player completion (scope-agnostic live player, waveform tape, peaks) | `audio_player_waveform_scrubber/` W1–W3 | feature |
| **W6** | Voice taxonomy v2 — Phase G (language/accent/style, tinted pills U8, HF tags) | `final_release/04` Phase G | feature; unblocks demo bundle |
| **W7** | UX backlog (U1–U14, minus styling folded into W2) | `final_release/10` | polish |
| **W8** | A11y + Perf backlog (A4–A12, P7–P9) | `final_release/11` | polish |
| **W9** | Security backlog (S6/S7/S10/S11 — pre-LAN hardening) | `final_release/12` | hardening |
| **W10** | Backend namespace rename (`plugins/` → `tts_engines/`) + remaining code-org | `master_agnostic_tasks`, `organizational_cleanup` | structural |
| **W11** | Standalone plugin repos (extract XTTS/Voxtral, registry, paste-URL install) | `final_release/05` | distribution |
| **W12** | Release gating (manual render verify, Pinokio PK3/7/8, wiki, demo refresh, spec conformance SP9, tag) | `road_to_v2` + `final_release/08` | owner-driven, last |
| **W13** | Deferred / open questions (localization impl; sub-sentence speaker assignment) | `phase_12_multilingual`, `sub_sentence_speaker_assignment` | post-v2 / undecided |
| **W-MIX-LA** | Mixed-synthesis load attribution (segment-tagged load markers, load-aware ETA) | `active/mixed-synthesis-load-attribution/` | progress correctness; gates W-PAR |
| **W-PAR** | Parallel segment rendering (per-engine pools, parent/child scheduling, multi-active UI) | `active/parallel-segment-rendering/` | performance (ships dark until owner enables) |
| **W-QS** | Quiet Studio visual redesign | `reference/quiet_studio_migration/` | **done** (owner-gated rename deferred) |

## The connections (what wires to what)

```
W1 Foundation cleanup ──┬─> unblocks W2 (clean base)
                        └─> feeds W12 (release dead-code gate)

W4 IA port ──CARRIES RST-1..8 checklist & HARVESTS FROM──> the dead trees  (W4 MUST precede W2 DC-1b)
        │   (owner-decided 2026-06-20: restoration folds INTO the port; the broken 5-stage pipeline
        │    is being REPLACED by the two-level IA — owner design review of the pipeline pending)
        └──RST-8 segment-aware player──> W5 audio player (same player; deliver together)
W3 (re-scoped) = WIRE-1/2/3 only ──> independent of the port

W2 styling separation ──FOLDS──> W7 U3/U9/U10            (do once, in W2)
W2 large-file splits  ──TOUCHES──> useStudioChapter (W3/W4 depend on its segment-playback logic;
                                    PRESERVE it — see INV-4)

W6 taxonomy v2 ──UNBLOCKS──> W12 demo bundle refresh (PK7) ──> W12 release
W10 namespace rename ──BROAD BLAST RADIUS──> touches every plugin import + W2/W11 (sequence late, alone)
W11 standalone repos ──depends on──> W2 plugin SDK consolidation (clean plugin boundary first)
W7/W8/W9 polish ──feed──> W12 release stages 5–6
W12 release ──GATES──> v2.0.0 tag (owner-run stages)
W13 ──deferred──> post-v2.0 (not gating)

W-MIX (done) ──exposed gaps──> W-MIX-LA ──007 spec+👁 gate──> W-PAR resume (002→003→{005,006}→007)
W-PAR 003 (keystone) ──R-F single-active SEGMENT_SAVED rework──> emission path in app/api/ws.py
W-PAR 007 ──absorbs──> ENGINE_CLASS_ADMISSION flag→setting migration (from 001 as-built)
W-PAR ──interacts──> W2 LF-6 service.py split (same file; sequence, don't parallel)
```

## Invariants (must hold across all workstreams)

- **INV-1 — Specs are jointly authoritative.** Any behavior change bumps the matching `design-docs/specs/`
  spec (`spec_version` + changelog) in the same commit. (CLAUDE.md)
- **INV-2 — Harvest before delete.** No `ProjectDetail`/`ChapterEditor` husk is deleted until the IA
  port (W4) has restored the RST-1..8 lost features it carries (W4 → then W2 DC-1b).
- **INV-3 — No engine-ID branches in core.** Plugin/SDK work (W2, W10, W11) parameterizes; never
  `if engine == "xtts"`. (`modular_architecture.md`)
- **INV-4 — Preserve segment-playback logic.** `useStudioChapter`'s segment playback exports
  (`playbackQueue`, `playbackBlockStartIds`, `currentPlaybackBlockIndex`, …) must NOT be deleted by
  the W2 large-file split or W2 dead-code removal — W3 RST-8 / W5 need them to make the global player
  segment-aware. (owner directive 2026-06-19)
- **INV-5 — xtts adapter is the LIVE render path.** `xtts_dispatch_adapter` reaches the TTS Server via
  `generate_via_bridge`; do not delete it. Only the never-called `SynthesisTask.to_bridge_request()`
  for xtts is redundant. (verified 2026-06-19)
- **INV-6 — No import-time side effects.** New modules from any split must not start threads / mutate
  globals on import. (`code-organization.md` §8.3)
- **INV-7 — Token-only styling, light+dark parity.** W2/W6/W7 styling additions reference
  `var(--token)`; every token has a dark value. (`design-system.md` §2.2/§3.2)
- **INV-8 — Owner-run release gates stay owner-run.** W12 manual render verification and repo
  publishes are owner actions; do not automate or skip.

## Risks & open questions

| Risk / question | Where | Note |
|-----------------|-------|------|
| Pipeline design review still pending → port should follow it | W4 | The 5-stage pipeline "doesn't work right" (owner, 06-20). Owner will run a design review of it; **W4 build should start after that review** so the two-level IA reflects its conclusions. |
| Port silently drops a lost feature | W4 | Mitigated by the carried RST-1..8 checklist as W4 acceptance criteria (owner: "as long as we know it's coming"). |
| RST-8 (segment-aware player) is the hardest item; segment timing + global-player sync | W4/W5 | Treat as its own mini-project; characterize with tests before moving logic (INV-4). |
| W10 namespace rename breaks plugin imports across repo | W10 | Cross-cutting; do alone, full suite incl. plugin suites; coordinate with W11. |
| Deleting dead trees too early | W2 | Gated by INV-2 (now: after W4 harvests). |
| Sub-sentence speaker assignment undecided | W13 | Needs a design decision before it can be planned. **Open — owner call.** |
| ~~Localization in/post v2~~ | W13 | **RESOLVED 06-20: post-v2.0** (deferred). |
| Plan docs drift as code moves under them | all | 2026-07-01 audit corrected: stale W-PAR 003 size (~700→~1435 lines), dead-tree premise (trees are LIVE), false BE-1/api-index claims, 4 "missing" specs that exist. Re-verify task-file anchors before executing any task older than ~2 weeks. |
| ~~W3↔W4 sequencing; W4 IA scope~~ | W3/W4 | **RESOLVED 06-20:** restoration folds into the port; two-level IA confirmed as the target (replaces 5-stage). |
