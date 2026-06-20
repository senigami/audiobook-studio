# Roadmap — ordered workloads & dependencies

Ordering reflects dependency and risk (see [01-map.md](01-map.md) for the connection graph). Tasks
are in `tasks/`. Owner-decision gates are called out — three sequencing forks need an owner call
before their workstream starts (see Open Questions in the map).

## Dependency graph (text)

```
W1 (foundation cleanup) ─────────────────────────────► (unblocks everything; ship first)
        │
W3 (restore lost fn) ──must precede──► W2 dead-tree delete (DC-1b)
        │                              │
        ├─ coordinate with ─► W4 (IA port)   ◄── OWNER FORK: sequence W3 vs W4
        └─ RST-8 merges with ─► W5 (audio player)
        │
W2 (simplification: styling, splits, BE, plugins) ──► (parallel-safe except DC-1b)
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

### Milestone 2 — Restore before you delete  *(OWNER FORK: confirm W3↔W4 sequencing first)*
- **[002 Restore lost functionality](tasks/002-restore-lost-functionality.md)** (W3) — RST-1..8 +
  WIRE-1/2/3. **Gates** the dead-tree deletion in 004.
- **[003 Book/Chapter IA live-app port](tasks/003-ia-live-app-port.md)** (W4) — coordinate with 002.
- **[004 Audio player completion](tasks/004-audio-player-completion.md)** (W5) — absorbs RST-8.

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

## Owner decisions needed before starting the gated workstreams
1. **W3 ↔ W4 sequencing** — restore into the current 5-stage pipeline first, or fold restoration into
   the two-level IA port? (Affects 002 vs 003 order.)
2. **W4 scope** — is the two-level Book+Chapter workspace IA still the target, given the 5-stage
   pipeline already shipped? (Confirms or re-scopes 003.)
3. **W13 localization** — in v2.0 or post-v2.0? (Currently deferred.)
