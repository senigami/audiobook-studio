# Roadmap

## Dependency graph

```
001 (frontend snapping)  ── independent ──┐
                                            ├─► 003 (doc corrections) — already done, see its file
002 (backend snapping)   ── independent ──┘
```

001 and 002 are fully independent (different languages, different files, connected only by the
shared algorithm spec in `00-overview.md`) — safe to do in either order or in parallel. Both
should land before considering this plan's core work complete; 002 alone is sufficient for
INV-SNAP-1's correctness guarantee, but 001 is what the user actually sees while dragging, so
don't skip it as "just a nice-to-have."

## Workloads

**Workload 1 — Frontend snapping (UX-visible)**
- Task 001: `handleSelection()` snaps offsets before storing `pendingSelection`.

**Workload 2 — Backend snapping (authoritative)**
- Task 002: `_apply_range_assignment()` snaps offsets before splitting.

**Workload 3 — Documentation correction**
- Task 003: fix the two stale docs. **Already done** (see task file) — included here for the
  plan's own record-keeping, not as remaining work.

## Milestones

- **M1 (after 001+002):** Word-boundary snapping is complete and defense-in-depth (both layers
  enforce it) — the plan's actual deliverable.
- **M2 (already reached, task 003):** The doc graph accurately reflects that sub-sentence
  assignment is a shipped feature with one specific, scoped gap — not an unbuilt design draft.
