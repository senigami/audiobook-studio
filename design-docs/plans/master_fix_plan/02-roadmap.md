# Roadmap — ordered workloads & dependencies

Ordering reflects dependency and risk (see [01-map.md](01-map.md) for the connection graph). Tasks
are in `tasks/`. Owner-decision gates are called out — three sequencing forks need an owner call
before their workstream starts (see Open Questions in the map).

> **2026-07-01 reconciliation:** the graph and lane plan below were rebuilt from a full
> plan-vs-code audit (8 parallel audit passes). The original W1–W13 graph is kept below for
> provenance; the **Workflow tree** section is the current *ordering/dependency* truth —
> **but not the status source.** `✓`/`◐`/done-ness markers in this file are a snapshot from
> that audit and are **not maintained** going forward; they will drift. For what's actually
> done vs. pending right now, check **[`../TASKS.md`](../TASKS.md)**. This file's job is to
> answer "what depends on what and what can run in parallel," not "what's done."

## Workflow tree (2026-07-01 snapshot) — what runs in parallel, what serializes, what gates what

Legend: `✓` done · `◐` built-uncommitted / partial · `👁` owner visual gate · `──►` hard dependency.
**Status markers below are frozen at 2026-07-01 — for current status see [`../TASKS.md`](../TASKS.md).**

```
╔═══════════════ LANE 1 — Progress / parallel render (critical path) ═══════════════╗
║ W-MIX-LA 007  spec recon (live-events, queue-jobs, data-model, wiki) + TASKS sync  ║
║      │ 👁 G0 re-check: mixed render + REAL cold-load pre_load_eta frame           ║
║      ▼                                                                             ║
║ [owner sign-off: raise cap > 1] ──► W-PAR 002 parent/child scheduling              ║
║      W-PAR 001 ✓ (semaphores, dark)   │                                            ║
║      W-PAR 004 ✓ (server pool, dark)  ▼                                            ║
║                          W-PAR 003 dispatch isolation (KEYSTONE, ~1,460-line       ║
║                              │        closure + R-F SEGMENT_SAVED rework)          ║
║                    ┌─────────┴─────────┐                                           ║
║                    ▼                   ▼                                           ║
║           W-PAR 005 correctness   W-PAR 006 frontend multi-active                  ║
║                    └─────────┬─────────┘                                           ║
║                              ▼                                                     ║
║           W-PAR 007 ETA-under-parallelism + cap toggle (+ absorbs                  ║
║                     ENGINE_CLASS_ADMISSION→setting) + spec recon                   ║
║                              │ 👁 Phase-1 check (cap>1 live render)                ║
║                              ▼                                                     ║
║           Phase 2 render monitor (fast-follow; design + demo mock done)            ║
╚════════════════════════════════════════════════════════════════════════════════════╝

╔══════════ LANE 2 — Player (M2 004) ══════════╗  ╔═══════ LANE 3 — Simplification (M3) ═══════╗
║ 004-W1 scope-agnostic player                 ║  ║ 005 subsets, parallel-safe among themselves:║
║   = RST-8 + scrubber W1: ONE coordinated     ║  ║   • styling separation (03) — re-scan       ║
║   edit of PlayerBar.tsx/playerBus.ts         ║  ║     counts first (audit: doc numbers stale) ║
║      │                                       ║  ║   • large-file splits (04) — EXCEPT the     ║
║      ▼                                       ║  ║     coordinated files (see conflicts)       ║
║ 004-W2 waveform tape (tasks 006–009)         ║  ║   • backend cleanup (05) — BE-1 corrected   ║
║      │                                       ║  ║   • plugin consolidation (06) PL-1..5 ──┐   ║
║      ▼                                       ║  ║   • logic-audit residue (09)            │   ║
║ 004-W3 peaks source + sidecar (010–012)      ║  ║      │                                  │   ║
║      │ 👁 player + tape check                ║  ║      ▼                                  │   ║
║      ▼                                       ║  ║ 006 namespace rename (ALONE, LATE,      │   ║
║ unlocks 005 DC-1b dead-tree delete           ║  ║   widest blast radius; coordinate 010)  │   ║
║   (⚠ re-verify gate: trees are LIVE and      ║  ╚═════════════════════════════════════════│═══╝
║    grew coupling — audit 2026-07-01)         ║                                            │
╚══════════════════════════════════════════════╝                                            │
                                                                                             │
╔═══════ LANE 4 — Features / polish (M4) ═══════╗  ╔═══ LANE 5 — Owner / design ═══╗          │
║ 007 taxonomy (NARROWED: language+style only;  ║  ║ Chapter-editor art-program:   ║          │
║   accent already shipped) ──► PK7 demo bundle ║  ║   WL1 bugs B1–B4 ──► Step-1   ║          │
║ 008 remainder (A11/A12/U16 now ✓; U-items,    ║  ║   scaffold ──► Cast/Booth/    ║          │
║   R6-T7 responsive, Stage-5 gate)             ║  ║   Revise modes                ║          │
║ S12 deps ✓ (all satisfied; audit clean)       ║  ║ HF voice + AI casting:        ║          │
║                                               ║  ║   design decisions, after 007 ║          │
╚═══════════════════════════════════════════════╝  ╚═══════════════════════════════╝          │
                                                                                             │
                    010 standalone repos (extraction X1-X6/V1-V3 + trust e2e;  ◄─────────────┘
                        registry JSON + paste-URL UI already SHIPPED) 
                              │
                              ▼
                    011 RELEASE GATING (M5 — owner-run, strictly last)
                    Stage 1 render verify → Stage 2 cleanup checkpoint →
                    Stage 4 (needs 007 taxonomy + 010) → Stage 5 (needs 008/S12) →
                    Stage 6 (SP9 conformance — the 4 "missing" specs EXIST; wiki W1/W3/W4;
                    demo/screenshot refresh; Pinokio PK3/7/8) → v2.0.0 tag
```

### Cross-lane file conflicts — serialize these, never parallel

| Contested surface | Claimants | Required order |
|---|---|---|
| `useStudioChapter.ts` (915 lines) | 004-W1/RST-8 (Lane 2) · 005 LF-1 split (Lane 3) · art-program (Lane 5) | RST-8 consumes its segment exports FIRST (INV-4), then LF-1 splits, then art-program builds on it |
| `PlayerBar.tsx` / `playerBus.ts` | 004-W1 = RST-8 + scrubber W1 | one coordinated edit — do not run as two tasks |
| `orchestrator_helpers.py` (1,563 lines, verified 2026-07-02) | W-PAR 003 (Lane 1) · any BE cleanup | W-PAR 003 owns it; Lane 3 BE items keep out until 003 lands |
| `app/orchestration/progress/service.py` (1,503 lines, verified 2026-07-02) | 005 LF-6 split (Lane 3) · W-MIX-LA/W-PAR ETA work (Lane 1) | LF-6 waits until Lane 1's 007s (both) settle the file |
| `ChapterEditor/` + `ProjectDetail/` trees | DC-1b delete (Lane 3) · art-program (Lane 5) · 004 harvest (Lane 2) | harvest (Lane 2) → art-program decides what survives → DC-1b LAST, gate re-verified |
| `plugins/` paths | 006 namespace rename (Lane 3) · 010 extraction | 005 PL-consolidation → 006 rename (alone) → 010 extraction |

### Gate summary (the only hard serialization points)

1. **Commit gate (now):** working tree → one commit train (006 + fixes). Everything waits on this.
2. **W-MIX-LA 007 + 👁** gates W-PAR resume (Lane 1 interior).
3. **Owner cap>1 sign-off** gates W-PAR 002/003 execution.
4. **004 (RST-8)** gates DC-1b; **005 PL-\*** gates 010 extraction; **006 rename** runs alone.
5. **007 taxonomy** gates PK7 (release Stage 4/6).
6. **011** gates the tag; strictly owner-run, strictly last.

Lanes 1–5 are mutually parallel EXCEPT at the contested surfaces above. Within Lane 3, the 005
subsets are parallel-safe among themselves.

## Dependency graph (text) — original W1–W13 view (provenance)

```
W1 (foundation cleanup) ─────────────────────────────► (unblocks everything; ship first)
        │
[owner design review of the broken 5-stage pipeline] ──informs──► W4
        │
W4 (IA port) ──CARRIES RST-1..8 checklist──► harvests lost features from old trees
        │      └── RST-8 segment-aware player delivered with W5 (audio player)
        └──must precede──► W2 dead-tree delete (DC-1b)
W3 (re-scoped) = WIRE-1/2/3 only ──► independent of the port
        │
W2 (simplification: styling, splits, BE, plugins) ──► (parallel-safe except DC-1b, gated by W4)
        │
W6 (taxonomy v2) ──unblocks──► W12 PK7 demo refresh
W10 (namespace rename) ── alone, late ──► coordinates with W11
W11 (standalone repos) ──after──► W2 plugin SDK consolidation
W7/W8/W9 (UX/a11y/perf/security) ──feed──► W12 stages 5–6
W12 (release gating) ── LAST, owner-run ──► v2.0.0 tag
W13 (localization, sub-sentence) ── deferred / needs decision ──► post-v2
```

## Execution order

> **Status snapshot, not live.** The done/partial/not-started labels below are frozen from the
> 2026-07-01 audit and will drift — **[`../TASKS.md`](../TASKS.md) is the live checklist.** This
> section's lasting value is the *ordering* (what precedes what) and the milestone → task-file
> mapping, not the status words.

### Milestone 1 — Safe base (no behavior change) — **DONE (2026-06-20/21)**
- **[001 Foundation cleanup](tasks/001-foundation-cleanup.md)** (W1) — dead deps, dead files,
  hardcoded-color fixes, dead CSS, `.coveragerc`, `last_test.json`, + folded `final_release/06 §1`
  and `09` dead-code items. **DONE.** Unblocks the rest.

### Milestone 2 — Two-level IA port (absorbs the lost-feature restoration)  *(owner-decided 2026-06-20)*
**SUBSTANTIALLY DONE (2026-06-21).** The live 5-stage pipeline has been **replaced** by the two-level
Book + Chapter workspace IA. RST-1..7 and the book-scope Lexicon (added feature) are shipped. Two items
remain deferred by owner decision: RST-8 segment-aware player (→ task 004) and per-span range
assignment. DC-1b dead-tree deletion remains gated on RST-8.

- **[003 Book/Chapter IA port](tasks/003-ia-live-app-port.md)** (W4) — **SUBSTANTIALLY DONE**; RST-8 +
  range-assignment DEFERRED (see task file for full breakdown).
- **[002 Wire orphaned features](tasks/002-restore-lost-functionality.md)** (W3, re-scoped) — **DONE.**
  WIRE-1 VoiceDropzone, WIRE-2 VoiceModules, WIRE-3 SearchableSelect all wired.
- **[004 Audio player completion](tasks/004-audio-player-completion.md)** (W5) — **NOT STARTED.**
  RST-8 deferred by owner; this task is blocked pending that decision. *(2026-07-01 audit: scrubber
  plan anchors verified exact; RST-8 and scrubber-W1 are the same `PlayerBar.tsx`/`playerBus.ts`
  edit — execute as ONE coordinated change. Both old XTTS follow-ups under 003 are RESOLVED.)*

### Milestone 3 — Simplification
- **[005 Code simplification](tasks/005-code-simplification.md)** (W2) — **NOT STARTED.** QW-6
  dead-CSS and `CastPalette.tsx` split pending; DC-1b still gated on Milestone 2 RST-8.
  *(2026-07-01 audit corrections applied to sub-plans: dead-tree premise WRONG — trees are live
  and coupling grew; BE-1 `schema_data` claim wrong; styling counts stale; `file_split_plan.md`
  retired — 3 of 5 items already right-sized. Re-read simplification/02/03/05 headers first.)*
- **[006 Backend namespace rename & code-org](tasks/006-backend-namespace-and-codeorg.md)** (W10) —
  **NOT STARTED.** Run alone; coordinate with 007.

### Milestone 4 — Feature + polish backlog
- **[007 Voice taxonomy v2 (Phase G)](tasks/007-voice-taxonomy-v2.md)** (W6) — **NOT STARTED;
  NARROWED 2026-07-01:** `accent` already shipped in taxonomy 1.0 — remaining scope is `language` +
  `style` only. Unblocks demo bundle.
- **[008 UX / A11y / Perf backlog](tasks/008-ux-a11y-perf-backlog.md)** (W7+W8) — **PARTIAL.**
  A11y A4/A6/A7/A8/A10 done; Perf P7/P8/P9 done; A5 deferred (Framer); *(2026-07-01: A11, A12 and
  U16 confirmed DONE in code)*; remaining = UX U-items, R6-T7 responsive sweep, Stage-5 gate.
- **[009 Security backlog](tasks/009-security-backlog.md)** (W9) — **DONE.** S6/S7/S10/S11 shipped;
  S12 dep-bump is a release-gate hygiene step *(2026-07-01: ALL satisfied — vite 7.3.5,
  @babel/core 7.29.7, js-yaml 4.2.0; `npm audit` = 0 vulnerabilities; re-run at release)*.
- **[010 Standalone plugin repos](tasks/010-standalone-plugin-repos.md)** (W11) — **PARTIAL
  (2026-07-01):** official registry JSON + paste-URL install UI already SHIPPED in-tree; remaining =
  actual repo extraction (X1-X6/V1-V3) + trust-warning e2e. After 005 plugin work.

### Milestone 5 — Release  *(owner-run, last)*
- **[011 Release gating](tasks/011-release-gating.md)** (W12) — **NOT STARTED.** Manual render verify,
  Pinokio PK3/PK7/PK8, wiki corrections, demo refresh, spec conformance SP9, release notes + tag.

### Deferred — post-v2.0
- **[012 Deferred & open questions](tasks/012-deferred-and-open-questions.md)** (W13) — localization
  implementation; sub-sentence speaker assignment design decision. **HOLDING.**

## Parallelization notes
- Milestone 1 (001) and most of Milestone 3 (005, except DC-1b) are independent and can run alongside
  Milestone 2 — but DC-1b waits for 002.
- 006 (namespace rename) has the widest blast radius; serialize it, don't bundle.
- 007/008/009 are independent polish; parallel-safe.
- 011 is strictly last and owner-driven.

## Owner decisions — RESOLVED (2026-06-20)
1. **W3 ↔ W4 sequencing** → **fold restoration into the IA port.** RST-1..8 ride along with 003 as a
   tracked checklist ("as long as we know it's coming"); no separate restore-first milestone.
2. **W4 scope** → **two-level Book + Chapter workspace confirmed as the target.** It replaces the
   5-stage pipeline, which doesn't work right. **Owner design review on the pipeline is pending** and
   will inform 003 — start the build after that review.
3. **W13 localization** → **post-v2.0** (deferred; tracked in 012).
