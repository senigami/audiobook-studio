# Task 006 — Library: "Continue" section (research-gated, depends on task 005)

Status: pending

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

*(Fill in during execution.)*

## Step 2 — Implement (only if Step 1 concludes it's feasible, at whatever scope Step 1 settled on)

1. Add the "Continue" section above the "All Books" grid (task 004), matching demo's card layout:
   cover, title, author, series, status line, progress bar (+ ETA only if genuinely available).
2. Selection logic: which ≤2 projects appear here (most-recently-active, not-yet-Published, per
   Step 1's finding).
3. Reuse whatever progress-bar component already exists (`PredictiveProgressBar` per
   `00_execution_contract.md`'s reuse list) rather than building a new one.
4. Empty case: if no project qualifies (e.g. a brand-new library, or everything already Published),
   this section should not render at all — do not show an empty "Continue" shell (matches demo's
   implicit behavior; verify by checking whether `library.tsx` conditionally renders this section).

## Acceptance criteria

- [ ] Research outcome recorded in this file.
- [ ] If implemented: section shows ≤2 real in-progress projects with real (not fabricated)
      status/progress data; ETA shown only if genuinely available.
- [ ] If implemented: section is absent entirely when no project qualifies — no empty-state shell.
- [ ] If NOT implemented: escalated per task 005's same path, `00-overview.md` Decision #3 updated
      with the specific finding.
- [ ] `npm -C frontend run test -- --run`, lint, build clean (if implemented).

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
