# Task 005 — Queue components sweep

Status: pending

## Goal

`QueueItem.tsx`/`ReorderableQueueItem.tsx` have no per-job `data-testid` on their root card; "Cancel"/"Drag to reorder"/"Remove from queue" labels are static strings repeated across every queue item.

## Exact files

- `frontend/src/components/queue/QueueItem.tsx`
- `frontend/src/components/queue/ReorderableQueueItem.tsx`
- `frontend/src/components/queue/GlobalQueue.tsx`

## Steps

- [ ] `QueueItem.tsx`: add `data-testid={`queue-item-${job.id}`}` to the root card div. Note: `dataTestId="queue-item-progress-bar"` currently exists but is NOT per-job-scoped (confirmed by research) — fix it to `` `queue-item-progress-bar-${job.id}` ``. The "Cancel" button currently has only `title="Cancel Job"` (no `aria-label`) — add `aria-label={`Cancel job ${job.title || job.id}`}` (check the actual field name for a human-readable job title first).
- [ ] `ReorderableQueueItem.tsx`: `aria-label="Drag to reorder"` and `aria-label="Remove from queue"` are static — interpolate the job identifier the same way.
- [ ] `GlobalQueue.tsx`: the past-jobs wrapper `<div key={job.id} onMouseEnter=...>` has no `data-testid` — add `data-testid={`queue-past-job-${job.id}`}`. If this file also renders an `<ActionMenu>` (confirm via grep), pass `entityLabel`.
- [ ] Run `npx tsc -b --force` and the relevant `frontend/tests/unit/components/queue/` suite — confirm no regression. Check specifically for any existing test asserting the OLD non-scoped `dataTestId="queue-item-progress-bar"` string, since this task changes it — update that assertion if found (this is the one genuinely-breaking change in this task, flagged explicitly: not additive, an existing non-unique testid is being corrected).

## Acceptance criteria

- [ ] Every queue item (active, pending, past) has a `data-testid` keyed by `job.id`.
- [ ] The progress-bar testid is job-scoped, not shared.
- [ ] Cancel/drag/remove controls have job-scoped `aria-label`s.
- [ ] `npx tsc -b --force` clean; existing tests updated where the progress-bar testid change requires it, otherwise unchanged.
- [ ] Append a `docs/code-map/queue/` entry.

## Dependencies

Task 001.

## Map links

- Part: `QueueItem`/`ReorderableQueueItem`/`GlobalQueue` — `01-map.md`, "The parts"
- Invariant: INV-2, INV-3
- Risk: `multi-file` (the progress-bar testid rename could break an existing test asserting the old string — check before assuming additive-only)

## Out of scope

- Any behavioral change to queue ordering/cancellation logic — attributes only.
