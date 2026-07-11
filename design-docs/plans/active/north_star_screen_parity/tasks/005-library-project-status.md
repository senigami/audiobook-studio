# Task 005 — Library: per-project workflow status (research-gated)

Status: pending

Risk: quality-sensitive (real risk of scope creep into a schema change — INV-4 applies)

## Goal

Determine whether a per-project workflow status (Studio/Review/Casting/Drafting/Published, per the
demo's `StatusPill`) can be **derived** from data the app already has, and if so, add a `StatusPill`
to both the grid card and list view. If not cheaply derivable, STOP and record the gap as a decision
for the owner — do not add a persisted field to `Project` unilaterally.

## Why this matters

Demo grid cards and list rows both show a `StatusPill` (`library.tsx:542-544, 581`). Live has no
status indicator anywhere on a project card or in the list view's columns
(`ProjectListView.tsx:35-38`: Project/Series/Created/Updated/Actions — no Status column). The
`Project` type itself (`frontend/src/types/index.ts:65-77`) has no `status` field — so this can't be
a simple "read an existing field" fix; it requires either computing status client-side from
chapter/render data, or a real schema addition, and this plan does not authorize the latter without
owner sign-off (INV-4).

## Exact files (research phase)

- `frontend/src/types/index.ts` (read only — confirm `Project` shape)
- Whatever hook/API call already fetches per-project chapter/render data for a book (check
  `frontend/src/pages/Book/` data hooks — the Contents/Book tabs already compute "N of M chapters
  rendered" type figures, e.g. `ContentsStage.tsx`'s "N of M chapters rendered" line noted in
  `01-map.md`'s Book-level-tabs research)
- `app/db/` — check whether a project-level aggregate status/lifecycle query already exists
  server-side (search for anything resembling `get_project_status` or similar in `app/db/projects.py`
  or `app/db/chapters.py`)

## Step 1 — Research spike (do this before writing any UI code)

Answer: can a project's overall status (e.g. "Drafting" if all chapters are Draft, "Casting" if
some are Cast-pending, "Studio" if actively rendering, "Review" if fully rendered but unassembled,
"Published" if an assembled audiobook exists) be computed from data the **Library page can already
fetch cheaply** — i.e., without an extra per-project API round-trip for every card in the grid?

- If the Library page's existing project-list fetch already includes (or could cheaply include)
  aggregate chapter-lifecycle counts per project, proceed to Step 2 (client-derived status, no
  schema change).
- If computing this requires a new per-project or bulk backend query that doesn't exist yet, that's
  still likely fine (a new read-only query, not a schema change) — check whether `app/api/routers/
  projects.py`'s list endpoint could cheaply join/aggregate chapter status without an N+1 query
  pattern. If yes, proceed to Step 2 with a small backend addition included.
- If neither is feasible without materially changing how projects are stored (i.e., you'd need to
  add and *maintain* a persisted `status` field kept in sync via triggers/writes elsewhere), **STOP.**
  Do not implement. Instead, append a finding to this task file's "Research outcome" section below,
  update `00-overview.md`'s Decisions section, **AND add a line item to
  `design-docs/plans/TASKS.md`'s active-work section flagging the unresolved decision by name** (not
  just inside this plan folder). **Caught in adversarial review: a decision recorded only inside this
  plan folder can rot exactly like the phantom entry task 001 fixed — nothing forces anyone to
  revisit it.** A `TASKS.md` line item is this repo's actual forcing function (it's the single
  status source everyone reads); rely on that, not on someone happening to reopen this plan folder.

## Research outcome

*(Fill in during execution — this section starts empty. Do not skip recording the outcome even if
the answer is "yes, easily derivable" — the next task, 006, depends on knowing which data source
this task settled on.)*

## Step 2 — Implement (only if Step 1 concludes derivation is feasible)

1. Compute/fetch the per-project status using whatever source Step 1 identified.
2. Map computed status to the existing `StatusPill`-equivalent visual language this repo uses
   elsewhere (check `StatusOrb`/existing status-pill components before building a new one — INV-3
   spirit extends to any new status UI, even if it's not literally `StatusOrb`).
3. Add the pill to `ProjectCard.tsx`'s grid card and add a Status column to
   `ProjectListView.tsx:35-38`.

## Acceptance criteria

- [ ] Research outcome is recorded in this file, either way.
- [ ] If implemented: status pill appears on both grid and list views, computed without a new
      per-card API round-trip (verify via network tab / existing test mocks — no N+1 pattern).
- [ ] If implemented: status categories match the demo's set (Studio/Review/Casting/
      Drafting/Published) or a documented, deliberate variant if the live app's actual lifecycle
      states differ (check `ChapterLifecycle` type — Draft/Ready/Cast/Rendered — and map
      thoughtfully rather than forcing an exact label match that doesn't fit the live data model).
- [ ] If NOT implemented: this file's Research outcome section explains why, `00-overview.md`'s
      Decision #3 is updated to reflect the specific blocker found (not left generic), AND a line
      item is added to `design-docs/plans/TASKS.md` so the unresolved decision has a forcing
      function beyond this plan folder.
- [ ] `npm -C frontend run test -- --run`, lint, build clean (if implemented).

## Map links

Part: "Library (home)". Invariant: INV-4 (no silent schema changes) is the whole point of this
task's structure.

## Dependencies

None. Task 006 depends on this task's Research outcome (same underlying data question).

## Out of scope

Do not implement the "Continue" section (task 006) here, even though it uses related data — keep
this task scoped to the status pill only, so its research finding is usable standalone.
