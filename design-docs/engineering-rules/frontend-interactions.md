# Frontend Interactions

Use this file for styling decisions, component boundaries, semantics, and layout responsiveness.

## Core Rules

- Prefer theme variables over hardcoded colors.
- Preserve focus behavior, keyboard access, and semantics.
- High-level interaction logic should use reliable state and clear component boundaries rather than fragile styling hacks.
- Keep layouts usable on desktop and mobile.
- Sticky controls and two-pane layouts must degrade gracefully on smaller screens.
- Prefer semantic HTML and accessible component patterns before adding ARIA; when ARIA is needed, keep labels and live regions accurate.
- Clean up timers, subscriptions, listeners, observers, and async effects on unmount.
- Use stable, meaningful keys for rendered lists; never rely on labels that can collide when a durable id exists.
- Keep components focused. Extract hooks or child components when a component starts owning unrelated state, effects, or rendering policy.
- Avoid `any` and unnecessary casts in TypeScript. Use explicit prop types, type guards, and discriminated unions where they clarify runtime states.
- Use explicit return types for exported helpers and public hooks when inference does not communicate the contract clearly.
- Memoize only where it protects an expensive calculation, stable callback boundary, or measured render issue; do not add memoization as decoration.
- Loading, error, empty, disabled, and success states should be user-meaningful and testable by role, label, or visible behavior.
