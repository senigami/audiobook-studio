# Frontend Rules

## 1. State Ownership

- Canonical entities such as projects, chapters, blocks, voices, and settings belong to API-backed data loading.
- The frontend store owns live overlays, reconnect state, notifications, and local session state.
- Do not let the store become a second database.
- Do not infer canonical completion state from local UI assumptions or stale props.

## 2. UX Quality Bar

- Every meaningful screen change must account for loading, empty, error, reconnecting, interrupted, and recovered states.
- Prefer interfaces that explain why something is waiting or stale instead of hiding behind generic spinners.
- Recommend improvements when a requested UI flow would reduce trust, recovery, or clarity.

## 3. Interaction Consistency

- Prefer theme variables over hardcoded colors.
- Preserve focus behavior, keyboard access, and semantics.
- High-level interaction logic should use reliable state and clear component boundaries rather than fragile styling hacks.

## 4. Chapter Editor Expectations

- Fast local editing is required, but canonical persistence must remain trustworthy.
- Mark edited, stale, queued, rendering, rendered, and failed states explicitly.
- Inline recovery actions are preferred over forcing users to leave the editor for common fixes.

## 5. Responsiveness

- Keep layouts usable on desktop and mobile.
- Sticky controls and two-pane layouts must degrade gracefully on smaller screens.
