# Task 001 — Fix `ActionMenu.tsx` + document the convention

Status: pending

## Goal

Add an optional `entityLabel` prop to the shared `ActionMenu` component so its trigger's `aria-label` can disambiguate between repeated instances (the single highest-leverage fix — 11 call sites benefit at once), and document the selector convention so future components follow it without rediscovery.

## Exact files

- `frontend/src/components/ui/ActionMenu.tsx` — add the prop, use it in the trigger's `aria-label`.
- `.agent/rules/frontend-interactions.md` — add a new section documenting the convention.

## Target contract

Current (`ActionMenu.tsx:16-22`):
```ts
interface ActionMenuProps {
    items?: ActionMenuItem[];
    onDelete?: () => void;
    trigger?: React.ReactNode;
    disabled?: boolean;
    onOpenChange?: (open: boolean) => void;
}
```
Add:
```ts
    /** Interpolated into the trigger's aria-label to disambiguate repeated instances, e.g. "More actions for Dark Fantasy". Optional — omitting it preserves today's generic label (backward compatible). */
    entityLabel?: string;
```

Current trigger (`ActionMenu.tsx:113`):
```tsx
aria-label="More actions"
```
Target:
```tsx
aria-label={entityLabel ? `More actions for ${entityLabel}` : 'More actions'}
```

## Steps

- [ ] Add `entityLabel?: string` to `ActionMenuProps`.
- [ ] Destructure it in the component signature (`ActionMenu.tsx:24`).
- [ ] Update the trigger's `aria-label` per the target contract above.
- [ ] Do NOT touch any of the 11 call sites in this task — passing the new prop at each site is Tasks 002-005's job, scoped by page. This task only makes the prop available.
- [ ] Add `.agent/rules/frontend-interactions.md`'s new section (see below for the content to add).
- [ ] Run `npx tsc -b --force` from `frontend/` — confirm clean (proves the new optional prop doesn't break any of the 11 existing call sites).
- [ ] Run any existing test that renders `ActionMenu` or a component using it (`grep -rl "ActionMenu" frontend/tests/unit/`) — confirm no regression to the default (no-`entityLabel`) case.

## Convention doc content to add to `.agent/rules/frontend-interactions.md`

Add a new section (title suggestion: "Stable selectors for repeated UI"):

```markdown
## Stable selectors for repeated UI

Interactive elements that render N times on screen (cards, rows, list items) must be locatable and disambiguable by both Playwright and accessibility-tree-based tooling:

1. Prefer a real, unique `aria-label` or visible text first — this is the primary selector path (`getByRole(..., {name})`) and doubles as an accessibility improvement.
2. Use `data-testid` on the repeated *container* element, keyed by the entity's real id (`data-testid={\`voice-card-${speaker.id}\`}`) — never by array index. Once the container is identified, elements within it can be found by scoping even if their own labels are generic.
3. Shared components reused across pages (e.g. `ActionMenu`) must accept an optional entity-identifying prop and interpolate it into their generated `aria-label`/`data-testid`, so every call site doesn't ship an identical, ambiguous label. See `ActionMenu`'s `entityLabel` prop for the pattern.

`frontend/src/pages/Book/components/ChapterTable.tsx` is the reference example already following this convention.
```

## Acceptance criteria

- [ ] `ActionMenuProps` has the new optional `entityLabel` field; trigger label uses it when present.
- [ ] `npx tsc -b --force` clean.
- [ ] No existing test regresses.
- [ ] `.agent/rules/frontend-interactions.md` has the new section.
- [ ] Append a `.agent/code-map/queue/` entry.

## Dependencies

None.

## Map links

- Part: `ActionMenu` — `01-map.md`, "The parts"
- Contract: `ActionMenuProps` — `01-map.md`, "Contracts"
- Invariant: INV-1 (additive, not breaking)
- Risk: `multi-file` (11 call sites consume this component — verify none break, even though none are edited by this task)

## Out of scope

- Passing `entityLabel` at any of the 11 call sites (Tasks 002-005, scoped by page — this task only adds the capability).
