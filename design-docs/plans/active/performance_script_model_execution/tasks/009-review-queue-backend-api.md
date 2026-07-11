# Task 009 — Review-queue backend API (surface AI suggestions for confirmation)

Status: pending

Risk: quality-sensitive — **INV-3 ("AI suggestions are never silently auto-applied") is
load-bearing here.** Get this wrong and AI suggestions silently become confirmed data with
no human ever having looked at them, per `02-roadmap.md`'s risk-flag summary for this task.

## Goal

Build the backend API that surfaces every `needs_review`/`ai_suggested` character and
segment (written by task 008's reconciliation pass) to a human reviewer, and the
confirm/reject/edit endpoints that are the ONLY path by which an AI suggestion transitions
to confirmed (`locked = 1`, `ai_suggested` cleared) state. This is not a UI task (012 is) —
this is the API contract the review UI will call.

## Why this is the most consequential task in the whole AI-pipeline workload

Every other task in this workload (005-008) produces suggestions with appropriate
confidence/review flags — but a suggestion that's never actually reviewable, or that has an
accidental path to auto-confirmation, defeats the entire point of building confidence
scoring and review flags in the first place. This task is where the project's own binding
precedent applies directly:

> **INV-3** (`01-map.md`): "Per this project's standing casting-contract precedent
> (`cast_voices()` in `app/domain/voices/metadata.py` — ranked suggestions only, never
> auto-apply), the AI extraction pipeline's output populates `ai_suggested`/`needs_review`
> flags for human confirmation — it must never write directly into a 'confirmed' state."

`cast_voices()` (`app/domain/voices/metadata.py:332-393`) is the concrete precedent to
imitate structurally: it returns ranked `recommendations` plus a `needs_input` flag and
**never itself writes anything** — the actual voice assignment is a separate, later, always
explicit write performed by a human action elsewhere in the app. This task's review-queue
API must follow the same shape: **read-only surfacing endpoints, plus separate,
explicit-only mutation endpoints that require an actual human-initiated request** — there
must be no code path, background job, or default behavior that flips `ai_suggested`/
`needs_review` to confirmed without a discrete API call representing a real human action.

## Exact contract to build

1. **List/surface endpoints** (read-only):
   - Characters needing review for a project/book: filter `characters` where
     `needs_review = 1` (or `ai_suggested = 1`), returning the full profile plus
     `review_reasons` so a reviewer can see WHY it's flagged.
   - Segments needing review for a chapter: filter `chapter_segments` similarly, including
     `speaker_confidence`/`speaker_basis`/`speaker_evidence`/`review_reasons`.
   - Both should support the standard project/chapter scoping this codebase already uses
     elsewhere (check existing router patterns in `app/api/routers/chapters.py` and
     `app/api/routers/projects.py` for the established scoping convention before inventing
     a new one).
2. **Confirm endpoint(s)** (the only path to `locked = 1`): an explicit
   `POST .../characters/{id}/confirm` (and segment equivalent) that a human-initiated
   request calls, optionally with edits (the reviewer can correct a field while
   confirming, not just accept-as-is). On confirm: set `locked = 1`, clear
   `ai_suggested`/`needs_review`, clear `review_reasons`. This is the single mutation path
   that moves data out of "suggestion" state.
3. **Mandatory scoping on the MUTATION endpoints, not just the list endpoints (caught in
   adversarial review — do not skip this).** The list endpoints above are specified with
   project/chapter scoping; the confirm/reject endpoints must carry the **exact same
   scoping requirement**, explicitly re-verified at the mutation layer, not assumed
   inherited from the list call. This repo has already shipped the "endpoint accepts an id
   with no project-scope check, silently allowing cross-project access" bug class at least
   twice in this session alone (a chapters-endpoint fix, and a Backups-relocation
   `projectId` check in a sibling plan) — a new write endpoint that doesn't carry this
   requirement forward is repeating a known, already-diagnosed failure mode in this exact
   codebase. Concretely: `POST .../characters/{id}/confirm` and its segment/reject
   equivalents must validate that `{id}` belongs to the `project_id`/`chapter_id` in the
   request's own scope (route param or auth context — match whatever pattern
   `app/api/routers/chapters.py`/`projects.py` already use for this), and reject
   (404, not a silent no-op) a mismatched id rather than trusting the id alone.
4. **Reject/dismiss endpoint(s)** — this is a genuine open design fork, not just an
   implementation detail; resolve it explicitly before writing code, the same way this
   plan's task 000 resolves the schema-overlap fork, rather than inventing an answer
   mid-implementation:
   - **Option A (recommended default): mark permanently dismissed**, not deleted. Add a
     `dismissed` state (e.g. reuse `needs_review = 0` + a new lightweight flag, or a
     `review_reasons` sentinel value — decide the exact storage shape when implementing,
     but the semantic must be "this exact AI suggestion won't resurface as needing review
     again," not data deletion). Reasoning: deleting the candidate row destroys information
     a later reconciliation pass or a different reviewer might want to see (why did the AI
     think this, and why was it wrong) — dismissal preserves an audit trail; deletion
     doesn't.
   - **Option B: delete the candidate row entirely.** Simpler, but destroys the AI's
     reasoning/evidence with no audit trail — only choose this if Option A's extra state
     genuinely doesn't fit the schema task 001 ships.
   - Whichever is chosen, it must be explicit, auditable, and — like confirm — must never
     be reachable by any path other than a real human-initiated request.
5. **No implicit confirmation anywhere else in the codebase**: audit every other write path
   that touches `characters`/`chapter_segments` (existing chapter/character CRUD routes,
   any batch/bulk operations, the reconciliation pass itself from 008) to confirm none of
   them can flip `locked`/`ai_suggested`/`needs_review` as a side effect of an unrelated
   operation. This is the concrete way to verify INV-3 holds project-wide, not just within
   this task's own new endpoints.

## Steps

1. Before building anything, re-read `cast_voices()` in full
   (`app/domain/voices/metadata.py:332-393`) and its callers (grep for `cast_voices` across
   `app/api/routers/` and `frontend/src/`) to see exactly how this codebase's existing
   suggestion-only feature is wired end-to-end — what the API response shape looks like,
   how the frontend currently treats a "recommendation" vs. a "confirmed" write, and
   whether there's an existing confirm-style endpoint pattern to imitate for consistency
   (rather than inventing a structurally different shape for this feature).
2. Design the list/confirm/reject endpoints following the router conventions already
   established in `app/api/routers/` (naming, project/chapter scoping, error-response
   shape) — this is ordinary CRUD-adjacent API work, not novel to this task, so match
   existing patterns rather than introducing new ones.
3. Implement the confirm endpoint's write path with an explicit test that a suggestion
   NOT confirmed remains `ai_suggested = 1`/`needs_review = 1` indefinitely (i.e., nothing
   else flips it), and that calling confirm is the only thing that sets `locked = 1`.
4. Audit (per step 4 above) every other existing write path touching these two tables;
   write a regression test for at least one plausible "accidental confirmation" scenario
   (e.g. a bulk chapter re-import, or an unrelated field update) confirming it does NOT
   clear `needs_review`/`ai_suggested` or set `locked` as a side effect.
5. Decide and document the reject/dismiss semantics (see contract step 3) and implement
   whichever is chosen, with a test proving it doesn't accidentally confirm instead of
   reject.
6. Small-scale live-verification pass: since this task's correctness is really about
   "human reviews AI suggestions and the confirm action does what it should," this
   warrants an actual end-to-end walkthrough — seed a project with a few AI-suggested
   characters/segments (using 008's reconciliation output, or hand-crafted fixtures if 008
   isn't done yet), call the list endpoint, confirm one, reject one, and verify the DB
   state matches expectations at each step. This is closer to a manual UAT pass than a
   spike, since this task's risk is about correctness of a well-specified contract, not
   LLM-behavior uncertainty — but the review-queue's actual usefulness ultimately still
   depends on 005-008 having produced sane suggestions in the first place, so sanity-check
   against real (not synthetic) reconciled data if it exists.

## Acceptance criteria

- [ ] List endpoints return every `needs_review`/`ai_suggested` character and segment for
      a project/chapter, including the human-readable `review_reasons`.
- [ ] Confirm endpoint is the ONLY code path that sets `locked = 1`, verified by a test.
- [ ] A suggestion left unconfirmed never transitions to confirmed on its own — verified by
      a test that runs other existing write paths against a suggestion row and confirms it
      is unchanged.
- [ ] Reject/dismiss semantics are explicitly decided (Option A or B above, or a documented
      deviation) in this task file's own status update *before* implementation starts, then
      documented in the matching spec (per this repo's binding "behavior change updates
      the spec in the same commit" rule), and tested.
- [ ] **Confirm and reject/dismiss endpoints both validate project/chapter scoping**,
      verified by a test that a request for an id belonging to a different project is
      rejected (404), not silently applied — this is a blocking criterion, not optional.
- [ ] A human reviewer has walked through the actual confirm/reject flow against real or
      realistic seeded data and confirmed the endpoints behave as expected end-to-end —
      not just unit-tested in isolation, since this is the load-bearing INV-3 boundary for
      the whole workload.
- [ ] `./venv/bin/python -m pytest -q` clean; matching spec doc updated with a changelog
      row per this repo's binding directive on contract/behavior changes.

## Map links

Part C in `01-map.md` (AI extraction pipeline), step C-5 in `02-roadmap.md` Workload 4.
Invariant INV-3 (this task IS the INV-3 enforcement boundary). Precedent:
`cast_voices()` in `app/domain/voices/metadata.py`.

## Dependencies

Depends on task 008 (reconciliation) — this API surfaces and confirms/rejects rows that
008's write path produces.

## Out of scope

The actual frontend review UI (012, a later workload, shared surface with sub-sentence
assignment and the sibling `chapter_editor_catalog_completion` plan's Cast mode work — see
`01-map.md` Connections). Any bulk/batch confirm-all convenience endpoint is explicitly
out of scope unless separately requested — per INV-3's spirit, a "confirm everything"
shortcut would undermine the whole point of a review queue and should not be added as an
incidental convenience here.
