# Task 005 — Library: per-project workflow status (research-gated)

Status: done — partial scope (owner-approved 2026-07-11, see Research outcome)

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

**Partially derivable — 3 of the demo's 5 states, no schema change, no N+1.** Recorded 2026-07-11.

- `app/db/projects.py::list_projects()` (feeding `GET /api/projects`, the Library page's existing
  single fetch) now runs one aggregate SQL query: `projects` LEFT JOIN `chapters` LEFT JOIN a
  per-chapter segment-count subquery (`SELECT chapter_id, COUNT(*) AS total_segments FROM
  chapter_segments GROUP BY chapter_id`), `GROUP BY p.id` — same shape as the existing
  `_segment_counts_sql` helper in `app/db/chapters.py`. From the three aggregates it produces
  (`chapter_count`, `chapters_with_segments_count`, `chapters_rendered_count`), a `status` field is
  derived in Python and attached to each project dict:
  - `drafting` — no chapter has been chunked into segments yet (`chapter_count == 0` or
    `chapters_with_segments_count == 0`).
  - `casting` — some chapters have segments/progress but not every chapter's `audio_status` is
    `'done'`.
  - `rendered` — every chapter's `audio_status` is `'done'`.
  Verified single-query (no N+1) via a `sqlite3` trace-callback test
  (`tests/db/test_db_projects.py::test_list_projects_status_uses_a_single_query_no_n_plus_1`).
- **`Studio` (actively rendering) is NOT derivable this way** — there's no DB-tracked "is a render
  job running for this project right now" signal; the orchestrator's live job state lives in
  `state.json`/in-memory (`app/db/state.py`), not a column joinable per-project without either a new
  live-job subscription architecture or a per-project poll (an N+1 the Library page must avoid).
- **`Published` (assembled into an audiobook) is NOT derivable this way either** — whether a project
  has an assembled audiobook is currently only checked via a per-project API call
  (`api.fetchProjectAudiobooks`, used by `ProjectCard.tsx`'s hover-reveal play button, task 003) or a
  filesystem listing; doing that for every card on Library load is exactly the N+1 this task's
  acceptance criteria rule out.
- **Owner decision (2026-07-11):** ship the 3 derivable states now as a **partial** status pill
  (Drafting/Casting/Rendered only). Studio and Published remain out of scope for this task and this
  plan — solving them would need either a live-job broadcast the Library page subscribes to, or a
  bulk "has-audiobook" aggregate query analogous to this one, both bigger asks than this task's
  scope. `00-overview.md`'s Decision #3 records this as the settled owner call, not a lingering gap
  — no `TASKS.md` line item is needed since this is no longer an unresolved decision, just a
  documented scope boundary.
- Task 006 ("Continue" section) should treat this as: status data exists for 3 states; if it wants
  to surface "currently rendering" or "published" info it needs its own solve for those two states,
  this task does not provide them.

## Step 2 — Implemented (partial scope, per Research outcome above)

1. `app/db/projects.py::list_projects()` computes `status` per project via the aggregate query above
   (`_PROJECT_STATUS_AGGREGATE_SQL`, `_derive_project_status()`). `frontend/src/types/index.ts` gained
   `ProjectStatus = 'drafting' | 'casting' | 'rendered'` and `Project.status?: ProjectStatus`.
2. Added `frontend/src/components/ui/ProjectStatusPill.tsx` — a small presentational component
   reusing the same rounded-pill visual language as `ChapterTable.tsx`'s
   `.chapter-table__pill--*` lifecycle pill (CSS in `frontend/src/theme/components/misc.css`,
   `.project-status-pill--*`), not a new visual pattern.
3. Pill wired into `ProjectCard.tsx` (next to the project title) and a new Status column added to
   `ProjectListView.tsx`.
4. Bonus (per this task's owner instruction, not original scope): task 004's hidden "In Progress"
   quick-filter chip in `LibraryControls.tsx` is now wired up — it's a real filter (not a sort
   shortcut like Recent/A–Z), narrowing to projects whose status is `drafting` or `casting`, via new
   `statusFilter`/`filteredProjects` state in `useProjectLibrary.ts`.

## Acceptance criteria

- [x] Research outcome is recorded in this file, either way.
- [x] If implemented: status pill appears on both grid and list views, computed without a new
      per-card API round-trip (verified via a `sqlite3` trace-callback test asserting exactly one
      `SELECT` for the whole `list_projects()` call regardless of project/chapter count — see
      `tests/db/test_db_projects.py`).
- [x] If implemented: status categories match the demo's set (Studio/Review/Casting/
      Drafting/Published) or a documented, deliberate variant if the live app's actual lifecycle
      states differ — **documented deliberate variant**: only Drafting/Casting/Rendered are
      implemented; Studio and Published are explicitly out of scope per the Research outcome above,
      not silently dropped.
- [x] If NOT implemented: N/A — implemented (partial scope, owner-approved).
- [x] `npm -C frontend run test -- --run`, lint, build clean (all green — see verification notes in
      the engineer report for this task).

## Map links

Part: "Library (home)". Invariant: INV-4 (no silent schema changes) is the whole point of this
task's structure.

## Dependencies

None. Task 006 depends on this task's Research outcome (same underlying data question).

## Out of scope

Do not implement the "Continue" section (task 006) here, even though it uses related data — keep
this task scoped to the status pill only, so its research finding is usable standalone.
