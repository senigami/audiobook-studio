# Frontend Rules

## Quality

- Prefer project conventions over ad-hoc patterns.
- When changing UI, account for accessibility, responsiveness, loading states, empty states, and error states.
- Recommend improvements when a UI request would hurt usability or consistency.

## Interaction Consistency

- Interactive list items, tabs, and menu items should follow the established visual hierarchy:
  - Selected/active: `background: var(--accent)`
  - Hovered: `background: var(--accent-glow)`
  - Default: transparent or `var(--surface)` with muted text
- Prefer theme variables over hardcoded colors.
- High-level interaction logic should favor reliable component state over fragile styling hacks.

## UX Expectations

- Keep layouts responsive across desktop and mobile.
- Preserve consistent focus behavior and semantics.
- Make loading, disabled, and error states obvious rather than implicit.
