# Frontend State

Use this file for API-backed entities, live overlays, reconnect state, and local session state ownership.

## Core Rules

- Canonical entities such as projects, chapters, blocks, voices, and settings belong to API-backed data loading.
- The frontend store owns live overlays, reconnect state, notifications, and local session state.
- Do not let the store become a second database.
- Do not infer canonical completion state from local UI assumptions or stale props.
