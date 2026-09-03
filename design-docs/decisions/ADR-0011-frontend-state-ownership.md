# ADR-0011: Frontend State Ownership — Canonical Hydration vs. Live Overlay

**Date:** 2026-06-13 (retro-documenting a principle in force since the Studio 2.0 frontend was built; formalized here because the redesign multiplies the surfaces that consume live state)  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

The frontend has two very different kinds of state, and conflating them is a recurring temptation that causes real bugs:

1. **Canonical entity data** — projects, chapters, voices, engines. This is owned by the backend and fetched via API hydration.
2. **Live/ephemeral state** — queue/job overlays from WebSocket frames, reconnect/hydration status, notifications, and local editor drafts.

When the live store starts caching canonical entities as if it were a database, the UI drifts from the server: stale rows survive refetches, overlay frames overwrite authoritative data, and local drafts clobber server state. The redesign sharply increases the number of surfaces reading live state (rail badges, the queue drawer, the Activity page, in-book progress, the player bar), so the ownership rule needs to be explicit rather than folklore in a rules file.

This decision formalizes the principle already stated in `design-docs/engineering-rules/frontend-state.md`.

## Decision

The frontend separates ownership of state by kind, and the boundary is enforced:

- **Canonical entity data comes from API hydration** (API-backed loading hooks). The store is not a second database and must not become the source of truth for entities.
- **The store owns only** live overlays, reconnect/hydration status, notifications, and local editor session/drafts.
- **`queue.items` frames are the sole authority for queue rows.** Other live topics (`chapters.progress`, `segments.progress`, `voice.test`, `jobs.lifecycle`) may only update designated overlay fields on existing rows; they never create or author rows. (See `design-docs/specs/live-events.md` for the `QUEUE_OVERLAY_FIELDS` detail.)
- **Local editor drafts must not blindly overwrite canonical server state** — a draft is reconciled against, not pushed over, the hydrated entity.

## Consequences

### Positive

- The UI converges on the server: a refetch always wins over a stale overlay, so "ghost" rows and drifted status can't persist.
- New live-state consumers added by the redesign inherit one clear rule instead of each inventing its own caching.
- Editor work can't silently destroy server-side state through an out-of-date draft.

### Negative / Trade-offs

- More deliberate plumbing: a feature that wants entity data must hydrate it rather than reach into the store, which is occasionally more code than a single global cache would be.
- Contributors must internalize the overlay-vs-canonical distinction; violations are easy to write and only show up as subtle staleness bugs.

### Neutral

- The rule is documented in three places that must stay consistent: this ADR (why), `design-docs/specs/site-shell-and-book-pipeline.md` §Frontend state ownership (what), and `design-docs/engineering-rules/frontend-state.md` (the working engineering rule).
