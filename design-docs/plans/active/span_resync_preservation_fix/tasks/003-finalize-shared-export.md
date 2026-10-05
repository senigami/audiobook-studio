Status: pending
Depends on: Task 1 (and Task 2 if triggered)

# Task 3 — finalize `align_segments` as the one shared export

**Map links:** Part P1's connection to P2/P3 (`01-map.md` — "P1 is the single source of truth").
Risk: none (thin wiring/export task).

## Goal

Confirm `align_segments` (Task 1, possibly extended by Task 2) is import-ready for both consumers,
with a stable, documented return shape. This task is mostly a checkpoint before Tasks 4/5 begin, not
new logic.

## Steps

1. Confirm `align_segments`'s module has no import-time side effects (per
   `design-docs/engineering-rules/modular_architecture.md` — importing must not start threads,
   mutate globals, etc. A pure function module should already satisfy this; just confirm).
2. Add a short module docstring stating it is the SINGLE shared alignment function for both
   `sync_chapter_segments` and `get_resync_preview` — future changes to matching logic must touch
   only this file.
3. Confirm the return type is stable and documented (whatever dataclass/TypedDict Task 1 defined).

## Acceptance criteria

- [ ] No import-time side effects (verify via the repo's existing check if one exists).
- [ ] Module docstring states the single-source-of-truth rule explicitly.
- [ ] Both Task 4 and Task 5 can import from this module without circular-import issues (quick
      sanity import check).

## Out of scope

No new logic — if you find yourself adding matching logic here, it belongs in Task 1/2 instead.
