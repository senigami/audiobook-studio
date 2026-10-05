# ADR-0003: Dual State Store (SQLite + state.json)

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

The app has two distinct categories of data with different access patterns:

1. **Relational entity data** — projects, chapters, segments, characters, speakers,
   processing queue history, render performance samples. These need FK queries, joins,
   and durable persistence across restarts. SQLite is the natural fit.

2. **Live job state + settings** — current job status, progress values, listener
   callbacks, active settings. These are read on every WebSocket broadcast (multiple
   times per second during synthesis) and must have sub-millisecond access. They don't
   need relational queries. Writing them to SQLite on every progress update would
   create contention.

A single SQLite store would either require frequent writes that create lock contention
or polling-based reads that add latency. A single in-memory store would lose state on
restart with no recovery path.

## Decision

Two stores with explicit ownership:

- **`state.json`** (managed by `app/db/state.py`) holds volatile in-memory job state,
  settings, and job-listener callbacks. Access is guarded by an RLock; writes are
  atomic. It is the fast path for all live UI updates.
- **SQLite** (`app/db/`, `audiobook_studio.db`) holds durable relational data:
  projects, chapters, segments, characters, speakers, `processing_queue` history, and
  render `performance` samples.

On restart, `state.json` job state is cleared and reconciliation (driven by SQLite) is
the source of truth for what work needs to resume.

## Consequences

### Positive
- Sub-millisecond reads for live progress and settings — no DB round-trip on each broadcast.
- SQLite for entities that need FK constraints and historical queries.
- Crash recovery: SQLite survives; reconciliation rebuilds live state from durable records.

### Negative / Trade-offs
- Two stores must be kept consistent by explicit rules; a write to one without the
  other creates drift.
- Reconciliation logic on startup adds complexity and must be tested for all recovery
  scenarios.

### Neutral
- `app/db/state.py` is a facade over decomposed sub-modules (`state_helpers`,
  `state_settings`, `state_performance`, `state_jobs`) — callers use the facade, not
  the sub-modules directly.
- `app/db/__init__.py` does not auto-migrate on import; callers invoke migration
  explicitly through the boot sequence (see ADR-0006).
