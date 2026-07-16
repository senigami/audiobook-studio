# PR 07 — Milestone 2 / DC-1b: dead-tree deletion (investigate-first)

**Branch:** `studio2/dc1b-dead-tree`
**Target:** `studio-2.0`
**Size:** S if truly dead / S if the outcome is "close the item"; M only if a real detachment is
warranted and approved.
**Gate:** none to *investigate*. But this is **NOT a straight deletion task** — see below.
**Runs solo vs 03:** ⚠️ must **not** run concurrently with PR 03 (both touch frontend dead-code).

## Read this first — the task is investigation, not deletion

DC-1b was re-verified **2026-07-12 as still blocked**, and the note is explicit that this is **not
an owner decision** — it's a factual state:

> `ProjectDetail`/`ChapterEditor` trees are still live-imported/route-mounted, more so than the
> 2026-07-01 check found; coupling grew 4→7+ importers.

So the honest job here is: **re-verify the current state, and produce the right outcome for what you
actually find** — which may be "delete a genuinely-dead subset," "detach then delete (needs
approval)," or "confirm still-live and close the DC-1b item as not-doable."

## Authoritative source

- `design-docs/plans/active/simplification/02_frontend_dead_code_removal.md` (the audit + the
  DC-1b correction).
- TASKS.md line ~399 (Milestone 2) and ~436 (Milestone 3 FE dead-code sub-part).
- INV-2 (dead-tree deletion gated on restoration 002 — 002 is done, so the gate now is purely
  "is it actually dead").

## Steps

1. **Establish ground truth with the code map, not by eye.** Use the map's symbol trace / blast
   radius on `ProjectDetail` and `ChapterEditor` (and their subtrees): who imports them, what routes
   mount them, what's genuinely unreachable.
   - `grep -rn 'ProjectDetail\|ChapterEditor' frontend/src/app frontend/src/pages` for route
     registration and live imports.
2. **Classify** every file in the candidate tree: (a) live-routed/imported, (b) imported only by
   other dead files (transitively dead), (c) truly orphan (zero importers).
3. **Produce the outcome that matches reality:**
   - If a genuinely-dead subset exists (category c, and category b whose only roots are category c):
     delete it. Nothing else.
   - If everything is live (category a) or transitively reachable from live code: **do not delete.**
     Write a short findings note into `02_frontend_dead_code_removal.md`, mark the DC-1b item closed
     as "still live — not deletable," update TASKS.md line ~399/436, and ship that as the PR. A
     correct "we cannot delete this" with evidence is a valid, valuable outcome — don't manufacture
     a deletion to look productive.
   - If deletion would require **detaching** a still-mounted route/import first (a behavior change),
     that's beyond "dead-code cleanup" — **stop and bring the specific proposal to the owner**
     before doing it.

## Verify

- If you deleted: full frontend suite + lint + tsc + build green; **launch the app and click through
  every route that could have referenced the tree** — a dead-code deletion that breaks a live route
  passes tsc and fails here. Screenshot the still-working routes.
- If you closed the item: the findings note + TASKS.md update are the deliverable; no code change.

## Definition of done

- DC-1b resolved one way or the other, with **evidence** (symbol trace + route audit), not a guess.
- TASKS.md + `02_frontend_dead_code_removal.md` reflect the real outcome.
- If code changed: suites green, live route-click proof, code-map changelog-queue entry.
- PR via `write-pr` → `studio-2.0`.
