# Overview

## Task

Fix stable-selector coverage gaps across the frontend so both agent-driven browser tooling and Playwright e2e tests can reliably locate and disambiguate interactive elements, prioritizing the pages/components measured to have the worst coverage.

## Success criteria

1. `.agent/rules/frontend-interactions.md` documents the selector convention (accessible-name-first; `data-testid` on repeated containers keyed by entity id; shared components accept an entity-identifying prop).
2. `ActionMenu.tsx` accepts an optional `entityLabel`/`entityId` prop and interpolates it into its trigger's `aria-label` (e.g. `aria-label={`More actions for ${entityLabel}`}`) — every call site updated to pass it.
3. `pages/Voices/`, `pages/VoiceLab/`, `pages/ProjectLibrary/` each have their primary repeated-entity components (cards/rows) carrying a `data-testid` keyed by the entity's real id, matching `ChapterTable.tsx`'s existing pattern.
4. Queue components (`QueueItem.tsx`, `ReorderableQueueItem.tsx`, `GlobalQueue.tsx`) get the same treatment — per-job `data-testid`, scoped labels.
5. A quick manual/scripted check (grep-based, not necessarily a full new Playwright suite) confirms zero remaining cases in the touched components where an accessible-name query would match more than one element when 2+ entities are rendered.
6. Full green gate: `npx tsc -b --force`, `npx vitest run`, `npm run lint`, `npm run build`, plus the existing `frontend/tests/e2e/a11y/axe.spec.ts` (currently `.fixme`'d — do not un-skip it as part of this plan unless it's trivially clean; that's a separate, larger effort).

## Scope

**In scope:** see README.

**Out of scope:** see README. Also explicitly out of scope: adding `data-testid` to every single element in the codebase (183 files) — this plan targets the measured, concrete gaps (Voices/VoiceLab/ProjectLibrary/Queue + the shared `ActionMenu`), not a mechanical blanket pass.
