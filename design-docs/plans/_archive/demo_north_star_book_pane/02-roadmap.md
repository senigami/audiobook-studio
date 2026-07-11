# Roadmap

## Dependency graph

```
001 (build BookPane component)
        │
        ▼
002 (wire tab: BOOK_TABS, default state, pane-switch)
        │
        ▼
003 (rebuild docs/demo/, verify)
```

Fully serial — each task's file changes overlap with the next (002 needs 001's `BookPane` to exist before it can reference it; 003 needs 002's wiring live before rebuilding).

## Milestones

- **M1:** `BookPane` exists as a standalone component (not yet wired into the tab switch) — typechecks clean in isolation.
- **M2:** Book tab is live in the demo dev build, first in tab order, default-landing.
- **M3 (done):** `docs/demo/` rebuilt and verified.
