# Task 006 — Library: "Continue" section (research-gated, depends on task 005)

Status: done — scoped-down (owner-instructed 2026-07-11, see Research outcome)

Risk: quality-sensitive (same INV-4 risk as task 005, and directly depends on its finding)

## Goal

Add the demo's "Continue" section — up to 2 cards for in-progress books, each showing cover, title,
author, series, a status line (e.g. "Studio · Chapter 7 rendering"), and a progress bar + ETA — to
the top of the Library page, ABOVE the "All Books" grid (task 004).

## Why this matters

Demo: `library.tsx:296-364`. Live has no equivalent section. This is the single highest-value
Library gap for a returning user ("pick up where you left off" is literally the header copy the
demo uses, per `library.tsx:269-285`) — but it's also the riskiest to implement cheaply, since it
needs not just a status label (task 005) but a progress percentage and an ETA per book, which is
more data than a simple status enum.

## Exact files (research phase)

Same starting points as task 005, plus: check whether the per-chapter render-progress data that
already powers `PredictiveProgressBar`/ETA displays elsewhere in the app (Studio/Contents tabs) can
be aggregated to a book level. This repo already has a whole progress/ETA subsystem
(`app/orchestration/progress/`, `frontend`'s progress-math consumers) — the goal is to reuse that
machinery at a coarser (book-level) grain, not invent a second ETA system.

## Step 1 — Research spike (build directly on task 005's finding)

1. Read task 005's "Research outcome" section first — if task 005 concluded status is NOT cheaply
   derivable, this task almost certainly can't proceed either (progress/ETA is a strict superset of
   that same data problem). In that case, STOP immediately, record the same conclusion here, and
   fold this into the same escalation as task 005 rather than duplicating research — including task
   005's `TASKS.md` line item (add this task's name to it too, don't create a second one) so the
   forcing function covers both.
2. If task 005 found a viable data source: determine whether that source (or a small extension of
   it) can also yield (a) which project is "most recently active"/in-progress (to pick which ≤2
   projects populate this section — likely: most recently updated project(s) that aren't fully
   Published), and (b) a render-progress percentage + ETA at the book level, reusing the existing
   progress/ETA subsystem rather than a new calculation.
3. If (a) is feasible but (b) is not cheaply available at the book level (e.g. ETA is only
   meaningful per-active-job, not as a static "time until this whole book is done" figure), consider
   a scoped-down version: show the status line and a simple percentage without a numeric ETA, and
   record that scope reduction explicitly rather than inventing a fake ETA number. (Note:
   `progress-no-fabrication-principle` is a standing rule elsewhere in this project's history — never
   fabricate ETA/progress numbers. If real ETA data isn't available at this grain, omit it rather
   than approximate it.)

## Research outcome

Recorded 2026-07-11.

1. **"Most-recently-active" candidate selection — cheaply available.** `Project.updated_at`
   (`frontend/src/types/index.ts`) already exists, and `app/db/projects.py::list_projects()`'s
   aggregate query (shipped by task 005) already runs `ORDER BY p.updated_at DESC`. No new
   endpoint or field is needed to pick "most recently touched" projects — the Library page's
   existing single `GET /api/projects` fetch already carries this.

2. **A static book-level progress percentage — cheaply available, small extension.** Task 005's
   aggregate SQL already computes `chapter_count` and `chapters_rendered_count` per project (used
   to derive `status`), but `list_projects()` discarded both via `row.pop(...)` right after
   deriving `status`, so they never reached the API response. Fix: stop popping them — keep both on
   each returned project dict. This is a small, no-new-query extension of an already-shipped
   aggregate (verified no N+1 regression; the existing single-query test still passes). From these,
   `chapters_rendered_count / chapter_count` is a genuine, real (not fabricated) static fraction.
   **Important distinction (per this task's own instruction not to conflate the two):** this
   fraction says nothing about whether a book is rendering *right now* — task 005 already
   established that live "Studio" status isn't derivable without a live-job subscription or an N+1
   scan, and that gap is unchanged here. The fraction is a point-in-time snapshot of completed work,
   not a live status signal.

3. **A genuine book-level ETA — NOT available anywhere.** Read `app/orchestration/progress/eta.py`
   and `app/orchestration/progress/service.py` directly:
   - `eta.py`'s `compute_eta_confidence` / `crossfade_eta` operate on a single job's `progress`,
     `age_ms`, `cv` (coefficient of variation of recent samples), and `velocity` — there is no
     aggregation across multiple chapters/jobs belonging to one project, and no notion of "time
     until this whole book, including not-yet-started chapters, is done."
   - `service.py`'s `ProgressService.estimate_eta` and its internal bookkeeping
     (`enrich`, `_build_progress_payload`, etc.) are all keyed by `job_id` /
     `parent_job_id` — i.e., a single active render job. A project with no job currently running
     (the common case for a "casting" book between render sessions) has no ETA data of any kind
     sitting anywhere waiting to be read; it is not merely "harder to fetch," it does not exist.
   - Conclusion: this confirms the task's own suspected fabrication risk. Per
     `progress-no-fabrication-principle` (a standing project rule — never fabricate ETA/progress
     numbers, and zero is not a safe default either), the ETA field is **omitted entirely** rather
     than estimated, approximated, or defaulted to a placeholder.

**Decision:** implement the Step 1.3 scoped-down version — status line + static rendered-fraction
percentage bar, no ETA — per explicit owner instruction accompanying this task's execution (checks
1 and 2 both came back "yes, cheaply available"; check 3 came back "no," and per the task's own
rule that means omit, not stop).

`PredictiveProgressBar` (`frontend/src/components/progress/PredictiveProgressBar/`) was evaluated
for reuse and is **not a fit**: its props/behavior (`etaSeconds`, `etaBasis`, `estimatedEndAt`,
live-animated ticks, handoff-queue integration, `isLiveAnimatedStatus`/`isPreparingStatus` state
machine) all assume an actively-updating job stream, which this static, no-active-job case does not
have. Built a small dedicated static progress track/fill instead
(`LibraryContinueSection.tsx` + `.library-continue-card__progress-track/-fill` CSS) — a plain
percentage-width bar with no animation, no ETA text, no live-update wiring.

## Step 2 — Implemented (scoped-down, per Research outcome above)

1. Added `frontend/src/pages/ProjectLibrary/components/LibraryContinueSection.tsx`, wired into
   `ProjectLibraryPage.tsx` between `LibraryBookmarksPanel` and `LibraryControls` (above the "All
   Books" grid). Card shows cover (or a book-icon placeholder), title, author, series + position,
   a status line ("Casting · N of M chapters rendered"), and a static percentage-width progress
   bar. No ETA field — omitted per the Research outcome, not shown as blank/zero.
2. Selection logic: projects with derived `status === 'casting'` and `chapter_count > 0`, sorted by
   `updated_at` descending, capped at 2. `'drafting'` (chapter_count is 0, no fraction) and
   `'rendered'` (already done) are excluded.
3. `PredictiveProgressBar` was evaluated and rejected as not fitting the static-percentage-only
   case (see Research outcome) — a small dedicated static bar was built instead in the new
   component + `ProjectLibraryPage.css`.
4. Empty case: component returns `null` (no heading, no shell) when zero projects qualify — covered
   by tests for empty list, all-rendered, and all-drafting inputs.

Backend support: `app/db/projects.py::list_projects()` now exposes `chapter_count` and
`chapters_rendered_count` on each project dict (previously discarded) so the frontend can compute
the real percentage without a new query; `frontend/src/types/index.ts`'s `Project` type gained the
matching optional fields.

## Acceptance criteria

- [x] Research outcome recorded in this file.
- [x] Section shows ≤2 real in-progress projects with real (not fabricated) status/progress data;
      ETA omitted entirely (not genuinely available at book grain — see Research outcome), not
      shown as a placeholder.
- [x] Section is absent entirely when no project qualifies — no empty-state shell (verified by
      tests: empty project list, all-rendered, all-drafting).
- [x] `npm -C frontend run test -- --run --maxWorkers=1` (targeted: LibraryContinueSection +
      ProjectLibrary/useProjectLibrary/ProjectCard/ProjectStatusPill suites, 42 tests) and
      `npm -C frontend run lint` (0 errors, pre-existing warnings only) are clean. `npm -C frontend
      run build` currently fails on an UNRELATED pre-existing `tsc` error in
      `frontend/src/demo/stages/siteMockup/panes/book.tsx` (`'AddChapterModal' is declared but its
      value is never read`) — that file was already modified in the working tree by other,
      presumably parallel, in-flight work before this task started and was not touched here; this
      task's own files compile and lint cleanly.
- [x] Backend: `./venv/bin/python -m pytest tests/db/test_db_projects.py -q` — 12 passed (2 new
      tests added, TDD: written first, confirmed failing with KeyError before the
      `list_projects()` fix, then passing after).

## Map links

Part: "Library (home)". Invariant: INV-4, and the progress-no-fabrication principle noted above
(not one of this plan's INV-numbered items, but a standing project rule worth citing directly since
it's exactly on point for this task).

## Dependencies

Hard dependency on task 005's Research outcome — do not start this task's Step 1 until 005 is
resolved (either implemented or escalated).

## Out of scope

Do not implement the Status pill for the main grid (task 005) or the All Books header (task 004)
here — this task is the Continue section only.
