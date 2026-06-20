# 008 — UX / A11y / Perf backlog (W7 + W8)

**Goal:** the cosmetic, accessibility, and performance polish items that gate release stages 5–6.
**Authoritative sources:** [`final_release/10_ux_improvements.md`](../../final_release/10_ux_improvements.md)
(U-items) + [`final_release/11_accessibility_and_performance.md`](../../final_release/11_accessibility_and_performance.md)
(A/P-items).

**Open items:**
- **UX (W7):** U1 undo toasts, U2 focus management, U4 startup experience, U5 queue-drawer affordances,
  U6 guided failure recovery, U7 ActionMenu correctness, U11 resync→queue flow, U12 cancel single
  queued job, U13 first-run onboarding, U14 route transitions.
  *(U3 type scale, U8 voice-pill disclosure, U9 button/input, U10 z-index are FOLDED ELSEWHERE: U3/U9/U10
  → 005 styling; U8 → 007 taxonomy. Do NOT duplicate here.)*
- **A11y (W8):** A4 icon-button aria-labels, A5 drag-reorder keyboard, A6 live regions, A7
  JsonSchemaForm label association, A8 StatusOrb `role=img`, A10 landmarks/headings, A11 `--text-muted`
  contrast, A12 `prefers-reduced-motion`. (MobileNavDrawer focus-trap is also tracked in 006.)
- **Perf (W8):** P7 interval hygiene in `useQueueSync`, P8 bundle chunking, P9 mega-payload debounce.

**Map links:** W7+W8. Feeds W12 release stages 5–6. U3/U9/U10→005, U8→007 (de-dup). Honors INV-1, INV-7.
**Dependencies:** independent; parallel-safe with 007/009.
**Acceptance:** axe baseline passes; verification walkthrough per `final_release/10`; specs (`design-system.md`)
touched where a11y/UX conventions change.
**Out of scope:** the styling-system items folded into 005; taxonomy pill UI (007).
