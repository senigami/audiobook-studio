# Task 004 — ProjectLibrary + ProjectDetail card sweep

Status: pending

## Goal

`pages/ProjectLibrary/` has zero `data-testid` coverage; `ProjectListView.tsx` rows and `ProjectCard.tsx` are indistinguishable to a selector without DOM-order/index scoping.

## Exact files

- `frontend/src/pages/ProjectLibrary/components/ProjectListView.tsx` — each `<tr key={project.id}>`.
- `frontend/src/pages/ProjectDetail/components/ProjectCard.tsx` — same class of gap.

## Steps

- [ ] `ProjectListView.tsx`: add `data-testid={`project-row-${project.id}`}` to each `<tr>`. Pass `entityLabel={project.name}` to its `<ActionMenu>` call (confirm the exact prop name for the project's title field — likely `project.name`, verify against the type first).
- [ ] `ProjectCard.tsx`: same treatment — `data-testid={`project-card-${project.id}`}`, `entityLabel` on its `<ActionMenu>`.
- [ ] Run `npx tsc -b --force` and the relevant `frontend/tests/unit/pages/ProjectLibrary/` + `ProjectDetail/` suites — confirm no regression.

## Acceptance criteria

- [ ] Every project row/card has a `data-testid` keyed by `project.id`.
- [ ] `ActionMenu` calls pass `entityLabel`.
- [ ] `npx tsc -b --force` clean; existing tests pass unchanged.
- [ ] Append a code-map changelog entry.

## Dependencies

Task 001.

## Map links

- Part: `ProjectListView`, `ProjectCard` — `01-map.md`, "The parts"
- Invariant: INV-2, INV-3
- Risk: `none`

## Out of scope

- `pages/ProjectDetail/components/ChapterList.tsx`'s own `<ActionMenu>` usage — noted in `01-map.md` as an existing call site outside this plan's page-scope; leave it for a future pass unless trivially bundled here (owner's call at execution time, not required).
