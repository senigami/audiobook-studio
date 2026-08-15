# Roadmap

## Workloads (in dependency order — mostly serial, low parallelism value here)

**Workload A — per-file renames (tasks 001-004).** Can run in any order relative to each other
except that 001 (profiles) should land before 002/003 reference the new profile paths/filenames.
004 (CLAUDE.md) is fully independent of 001-003.

**Workload B — mechanical follow-through (tasks 005-007).** Independent of each other; all depend
on Workload A being done (005 needs the new spawn_key names decided in 001; 006's OD entry
documents the whole change so it comes after everything else is real; 007 mirrors 006).

**Workload C — safety net + owner-attended verification (tasks 008-009).** MUST run last. 008 is
the cross-file consistency check this whole plan exists to enforce. 009 can't happen until a real
session restart occurs, which may be a different session than the one executing 001-008.

## Dependency graph

```
001 (profiles) ──┬──> 002 (roster.json) ──┐
                  ├──> 003 (roster.html) ──┼──> 008 (cross-ref sweep) ──> 009 (restart verify)
                  └──> 005 (memory move) ──┘
004 (CLAUDE.md) ─────────────────────────────> 008
                  006 (OD entry) ──> 007 (name registry) ──> 008
```

006 and 007 can start once 001-005 are done (they document/register the already-completed
rename); they don't block 001-005.

## Milestones

- **M1**: all 9 profile files renamed, frontmatter updated (task 001 complete).
- **M2**: `roster.json` and `roster.html` fully consistent with M1 (tasks 002-003 complete).
- **M3**: `CLAUDE.md` updated, memory moved, OD written, registry updated (tasks 004-007 complete).
- **M4 (gate)**: task 008's grep sweep returns clean — this is the actual "done" signal for the
  rename itself.
- **M5 (owner-attended, separate session)**: task 009 confirms dispatch under new tokens post-restart.

## Coverage

Not a findings-derived plan (no `Covers:` table needed) — this implements one locked decision, not
a list of independent findings to track for completeness.
