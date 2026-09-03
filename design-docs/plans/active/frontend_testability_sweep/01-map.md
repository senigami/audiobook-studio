# Implementation map

## The convention (the centerpiece — establish this in Task 001, then apply it)

1. **Accessible name first.** Every interactive element should have a real `aria-label` (or unambiguous visible text) — this is the primary selector path for both Playwright (`getByRole('button', {name})`) and the browser-preview accessibility-snapshot tool. Don't add `data-testid` where a good accessible name already exists and is unique.
2. **`data-testid` for what accessible names can't solve:**
   - Repeated container elements (a card, row, or list item that will exist N times on screen) — testid the **container**, keyed by the entity's real id: `data-testid={`voice-card-${speaker.id}`}`. Once the container is identified, its internal buttons can be found by scoping (`within(container).getByRole(...)`) even if their own labels are generic.
   - Icon-only controls with no reasonable text label.
3. **Shared components used across multiple pages must accept an entity-identifying prop** and interpolate it into their own generated `aria-label`/`data-testid`, rather than leaving every call site with an identical, non-unique label. This is `ActionMenu.tsx`'s exact bug (see Contracts below) — one fix there resolves the ambiguity everywhere it's used.

## The parts

| Part | File(s) | Current state | Target state |
|---|---|---|---|
| `ActionMenu` (shared, 11 real call sites) | `frontend/src/components/ui/ActionMenu.tsx` | Trigger hardcoded to `aria-label="More actions"` (line 113) — identical across every instance | Accepts optional `entityLabel?: string` prop; trigger label becomes `` `More actions${entityLabel ? ` for ${entityLabel}` : ''}` `` (backward compatible — omitting the prop keeps today's behavior, so this is additive, not breaking) |
| `VoiceCatalogCard` | `frontend/src/pages/Voices/components/VoiceCatalogCard.tsx` | Root `<div className="voice-catalog-card">` has no `data-testid`; "Play preview" button label identical across all cards | Root gets `data-testid={`voice-card-${speaker.id}`}`; pass `entityLabel={speaker.name}` to its `<ActionMenu>` |
| `NarratorCard` | `frontend/src/pages/Voices/components/NarratorCard.tsx` | Same class of gap (uses `<ActionMenu>` too) | Same treatment |
| `ScriptEditor` / `VariantEditor` (Voices) | `frontend/src/pages/Voices/components/{ScriptEditor,VariantEditor}.tsx` | No `data-testid` on key controls (Save/Reset/Suggest buttons, variant rows) | Add `data-testid` on the drawer root and its primary action buttons |
| VoiceLab page components | `frontend/src/pages/VoiceLab/**/*.tsx` | Zero `data-testid` anywhere (6 files) | Add to the primary interactive surface (voice selector, Test/Build buttons) — see Task 003 for the exact file list |
| `ProjectListView` | `frontend/src/pages/ProjectLibrary/components/ProjectListView.tsx` | `<tr key={project.id}>` has no `data-testid`/`id` | Add `data-testid={`project-row-${project.id}`}`, pass `entityLabel={project.name}` to its `<ActionMenu>` |
| `ProjectCard` | `frontend/src/pages/ProjectDetail/components/ProjectCard.tsx` | Same class of gap | Same treatment |
| `QueueItem` / `ReorderableQueueItem` | `frontend/src/components/queue/{QueueItem,ReorderableQueueItem}.tsx` | Root card has no `data-testid`; "Cancel"/"Drag to reorder"/"Remove from queue" labels are static, not job-scoped | Root gets `data-testid={`queue-item-${job.id}`}`; per-job labels interpolate a job title/id where feasible |
| `GlobalQueue` | `frontend/src/components/queue/GlobalQueue.tsx` | Also renders an `<ActionMenu>` (line count TBD by task executor) | Pass `entityLabel` through if applicable |
| Convention doc | `design-docs/engineering-rules/frontend-interactions.md` | No selector-convention guidance today | New section documenting the 3-point convention above |

## Contracts

**`ActionMenuProps` (current, `ActionMenu.tsx:16-22`):**
```ts
interface ActionMenuProps {
    items?: ActionMenuItem[];
    onDelete?: () => void;
    trigger?: React.ReactNode;
    disabled?: boolean;
    onOpenChange?: (open: boolean) => void;
}
```
**Target (additive — no existing call site breaks):**
```ts
interface ActionMenuProps {
    items?: ActionMenuItem[];
    onDelete?: () => void;
    trigger?: React.ReactNode;
    disabled?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Interpolated into the trigger's aria-label to disambiguate repeated instances, e.g. "More actions for Dark Fantasy". Optional — omitting it preserves today's generic label. */
    entityLabel?: string;
}
```
Trigger's `aria-label` (line 113) changes from the literal `"More actions"` to a computed value using `entityLabel` when present.

## All 11 real call sites (`grep -rln "<ActionMenu" frontend/src`, excluding the self-contained demo styleguide page)

```
frontend/src/app/layout/RailBookBlock.tsx
frontend/src/components/queue/GlobalQueue.tsx
frontend/src/pages/ProjectDetail/components/ChapterList.tsx
frontend/src/pages/ProjectDetail/components/ProjectCard.tsx
frontend/src/pages/ProjectLibrary/components/ProjectListView.tsx
frontend/src/pages/Voices/components/VoiceCatalogCard.tsx
frontend/src/pages/Voices/components/NarratorCard.tsx
frontend/src/pages/Book/studio/CastPalette.tsx
frontend/src/pages/Book/studio/StudioHeaderActions.tsx
frontend/src/pages/Book/components/ChapterTable.tsx
```
(`frontend/src/demo/styleguide/StyleguidePage.tsx` excluded — self-contained demo, out of scope per this plan's README.)

Task 001 fixes `ActionMenu.tsx` itself; Tasks 002-005 update the call sites within their respective page scope to actually pass `entityLabel`. `Book/studio/CastPalette.tsx`, `Book/studio/StudioHeaderActions.tsx`, `Book/components/ChapterTable.tsx`, `app/layout/RailBookBlock.tsx`, and `ProjectDetail/components/ChapterList.tsx` are out of this plan's page-scope (per README) — noted here so a future pass knows they still exist as unfixed call sites, not silently forgotten.

## Invariants

- **INV-1 (additive, not breaking):** every prop added to a shared component (`ActionMenu`, etc.) must be optional with a default that preserves current behavior — existing call sites that don't pass the new prop must not change visually or functionally.
- **INV-2 (real entity id, not index):** `data-testid`/`entityLabel` values must derive from the entity's actual stable id/name (`speaker.id`, `project.id`, `job.id`), never the array index — index-based keys break the moment the list reorders or filters, defeating the whole point.
- **INV-3 (no visual change):** this plan is purely about attributes (`data-testid`, `aria-label`) — no task in this plan should change visible layout, styling, or copy that a user would notice, aside from the accessible-name text itself (which is not visually rendered).

## Risks

- `multi-file`: Task 001 (`ActionMenu.tsx`) is consumed by 11 files — verify the prop is genuinely optional and every existing call site still typechecks without modification before touching any of them.
- None of this is `quality-sensitive` in the plan-architect sense (no auth/payments/data-loss risk) — but a broken selector convention silently defeats its own purpose, so each task's acceptance criteria should include a concrete "grep confirms the new attribute is present and unique" check, not just "looks right."
