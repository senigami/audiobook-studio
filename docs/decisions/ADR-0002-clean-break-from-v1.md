# ADR-0002: Clean Break from v1 (No Compatibility Layer)

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

V1 used a direct worker loop (`app.jobs`), inline one-shot subprocess spawning per
synthesis call, flat voice directories, and no plugin abstraction. The architecture
assumed a single TTS engine and a single process.

Studio 2.0 replaces all of this: subprocess → managed TTS Server, worker loop →
task orchestrator, flat voices → nested variant layout, inline engine logic →
plugin registry. Every subsystem changed.

Maintaining a compatibility layer would require conditional branches throughout the
codebase — "if v1 mode, do X; else do Y" — in routes, the scheduler, voice resolvers,
and path helpers. This would make every future change more expensive and testing
harder, with no long-term payoff since the self-hosted deployment model allows a
clean upgrade.

## Decision

Delete v1 code entirely at the Studio 2.0 cutover. No compatibility shims, no dual
code paths. Compatibility obligations begin at the v2.0.0 release — callers who
upgrade must migrate.

The single exception is the v1→v2 data migration path, which is preserved in
`app/api/routers/migration.py` and runs automatically on first boot of v2.

## Consequences

### Positive
- Clean codebase with no dead conditional branches.
- Every module can be written assuming v2 contracts exclusively.
- Test surface is smaller — no need to cover v1 paths.

### Negative / Trade-offs
- Callers (API consumers, external integrations) must migrate before upgrading.
- No rollback path to v1 after data migration runs.

### Neutral
- The migration router is the only place that knows about v1 layout; it can be
  removed after the transition window closes.
- `plans/` holds the v1→v2 conversion roadmap for reference.
