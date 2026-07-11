# ADR-0009: Standard App Shell and Routed Book Pipeline

**Date:** 2026-06-13  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

The redesign work exposed two structural problems in the frontend:

1. Global chrome was drifting into page-level code paths.
2. The old project detail page mixed book workflow, chapter editing, and publish actions in one surface.

That shape made the app harder to keep organized and made it easier for new work to bypass the shared shell or reintroduce page-specific navigation.

## Decision

Standardize the frontend around one shared app shell and one routed book pipeline.

- The shell lives under `frontend/src/app/layout/` and owns the top bar, rail, body column, and mobile drawer.
- `frontend/src/components/layout/Layout.tsx` remains only as a compatibility export while the app is being migrated.
- Book work lives under `/book/:bookId/...` with routed stages for Manuscript, Casting, Studio, Review, and Publish.
- Legacy deep links (`/project/:id`, `/chapter/:id`) redirect into the book pipeline instead of owning their own page chrome.

## Consequences

### Positive

- The app has one standard base layer, which keeps navigation and layout consistent across pages.
- Book workflow is easier to reason about because each stage has a single route and a single responsibility.
- Old bookmarks keep working through redirects, so the migration remains safe for users.
- Future page work has a clearer boundary: shell behavior goes in app/layout, book workflow goes in book stages, and shared UI stays reusable.

### Negative / Trade-offs

- The migration required a temporary compatibility export for the legacy `Layout` path.
- The book pipeline is more route-oriented than the old project detail page, so simple feature changes may touch more files when a capability spans multiple stages.

### Neutral

- The old `ProjectDetail` surface may remain as a compatibility boundary until every capability is fully re-homed.
