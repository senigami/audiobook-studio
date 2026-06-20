# Roadmap — ordered workloads & dependencies

Ordering reflects dependency and risk (see [01-map.md](01-map.md) for the connection graph). Tasks
are in `tasks/`. Owner-decision gates are called out — three sequencing forks need an owner call
before their workstream starts (see Open Questions in the map).

## Dependency graph (text)

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

### Milestone 1 — Safe base (no behavior change)
- **[001 Foundation cleanup](tasks/001-foundation-cleanup.md)** (W1) — dead deps, dead files,
  hardcoded-color fixes, dead CSS, `.coveragerc`, `last_test.json`, + folded `final_release/06 §1`
  and `09` dead-code items. Ships immediately; unblocks the rest.

### Milestone 2 — Two-level IA port (absorbs the lost-feature restoration)  *(owner-decided 2026-06-20)*
The live 5-stage pipeline is being **replaced** by the two-level Book + Chapter workspace IA — it
"doesn't work right" (owner design review pending, which informs this port). The lost features are
restored **as part of** this port, carried by an explicit checklist so none are dropped.
- **[003 Book/Chapter IA port](tasks/003-ia-live-app-port.md)** (W4) — the primary redesign. **Carries
  the RST-1..8 lost-feature checklist** (from 002) as acceptance criteria, and **gates** the dead-tree
  deletion in 005 (DC-1b): the port harvests those features from the old trees before they're removed.
- **[002 Wire orphaned features](tasks/002-restore-lost-functionality.md)** (W3, re-scoped) — the
  non-IA restores only: WIRE-1 VoiceDropzone, WIRE-2 VoiceModules, WIRE-3 SearchableSelect. Independent
  of the port.
- **[004 Audio player completion](tasks/004-audio-player-completion.md)** (W5) — RST-8 segment-aware
  player, delivered alongside the Chapter workspace.

### Milestone 3 — Simplification
- **[005 Code simplification](tasks/005-code-simplification.md)** (W2) — styling separation,
  large-file splits, backend cleanup, plugin SDK consolidation. The FE dead-tree **deletion** step is
  gated on Milestone 2 (INV-2).
- **[006 Backend namespace rename & code-org](tasks/006-backend-namespace-and-codeorg.md)** (W10) —
  run alone; coordinate with 007.

### Milestone 4 — Feature + polish backlog
- **[007 Voice taxonomy v2 (Phase G)](tasks/007-voice-taxonomy-v2.md)** (W6) — unblocks demo bundle.
- **[008 UX / A11y / Perf backlog](tasks/008-ux-a11y-perf-backlog.md)** (W7+W8) — minus styling (in 005).
- **[009 Security backlog](tasks/009-security-backlog.md)** (W9).
- **[010 Standalone plugin repos](tasks/010-standalone-plugin-repos.md)** (W11) — after 005 plugin work.

### Milestone 5 — Release  *(owner-run, last)*
- **[011 Release gating](tasks/011-release-gating.md)** (W12) — manual render verify, Pinokio
  PK3/PK7/PK8, wiki corrections, demo refresh, spec conformance SP9, release notes + tag.

### Deferred — post-v2.0
- **[012 Deferred & open questions](tasks/012-deferred-and-open-questions.md)** (W13) — localization
  implementation; sub-sentence speaker assignment design decision.

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
