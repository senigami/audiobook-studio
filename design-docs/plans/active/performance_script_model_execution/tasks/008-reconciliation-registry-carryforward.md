# Task 008 — Reconciliation + cross-chapter registry carry-forward

Status: pending

Risk: quality-sensitive (cross-chapter state — an error here compounds across every
subsequent chapter processed after it, per `02-roadmap.md`'s risk-flag summary)

## Goal

Build the fourth stage of the AI extraction pipeline: reconcile one chapter's
discovery/segmentation/attribution/annotation output (005-007) into the durable character
registry and DB write path, and carry that registry forward as the input context for the
next chapter's 005 pass. Per
`design-docs/plans/proposals/performance_script_model/02-character-profiles-and-extraction-spec.md`
§2's recommended architecture:

```text
Chapter text → discovery → registry update → segmentation → attribution →
annotation → character profile update → human review → database encoding → synthesis export
```

This task owns "registry update," "character profile update" (merging this chapter's
discoveries into the running per-book registry), and "database encoding" (the actual write
into `characters`/`chapter_segments`) — but NOT "human review" (that's 009's review-queue
API) and not the actual UI review flow (012).

## Why this matters — compounding risk

Every task before this one (005-007) operates on a single chapter in isolation. This task
is where cross-chapter state enters the picture: if chapter 3 incorrectly merges "the old
man" into an existing character who isn't actually the same person, or fails to recognize
that "Elena" in chapter 5 is the same "Elena Marrow" discovered in chapter 1, every
chapter processed afterward inherits that error. This is exactly the class of risk
`02-roadmap.md`'s risk-flag summary calls out for this task specifically (distinct from
005-007's per-chapter LLM-reliability risk): a bad merge doesn't just affect one chapter's
output, it silently corrupts the registry state every later chapter is built on.

## What the spec says about merge caution (important — this is a restraint problem, like 007)

Per the extraction prompt's own rule (`05-ai-extraction-agent-prompt.md`): "If two names
may refer to the same character, do not merge them unless the text strongly supports it.
Instead, flag for review." This is the load-bearing constraint for this whole task — the
default behavior on ambiguous identity must be "keep separate + flag," never "merge
speculatively." An over-eager auto-merge (treating "the old man" and "Marcus's father" as
the same character without strong textual support) is a worse failure than under-merging
(leaving two candidate entries that a human later confirms are the same), because
under-merging is visible and fixable in a review queue while over-merging silently deletes
information and can misattribute dialogue to the wrong permanent character record.

## What the research left open here (still relevant, still unresolved)

The companion research
(`design-docs/plans/proposals/research_character_brief_extraction_and_persona_casting.md`)
found no confirmed prior art for the proposal's automatic rolling-registry approach —
real systems either use human-in-the-loop merge (Portrayal) or hierarchical multi-agent
pipelines (NexusSum), not a pure automatic carry-forward. This task is exactly where that
uncertainty lands. Do not treat the rolling-registry design as proven correct just because
005-007's spikes worked on 2-3 isolated chapters — those spikes did not exercise
cross-chapter merge behavior at all. This task needs its OWN validation spike specifically
testing multi-chapter registry correctness (see Steps), separate from and in addition to
005-007's single-chapter spikes.

## Steps

1. **Spike first, and this spike must be multi-chapter, not single-chapter.** Run 005-007
   across a real, short sequence of consecutive chapters (3-5 chapters minimum) from the
   same book/project, feeding each chapter's reconciled registry forward as the next
   chapter's input, and reconcile at each step. Manually review:
   - Does a character introduced in chapter 1 get correctly recognized (not re-discovered
     as a duplicate) when they reappear in chapter 3?
   - Does the system correctly avoid merging two genuinely different characters who share
     superficial similarity (e.g. two unnamed "the woman" references in different
     chapters that are NOT the same person)?
   - When identity is genuinely ambiguous, does the pipeline flag for review rather than
     silently guessing either way?
   - Does the character profile (source_profile, voice_guidance) sensibly accumulate new
     evidence across chapters rather than being overwritten/discarded each time?
   Do not build the full production reconciliation logic around this stage until a human
   has reviewed this multi-chapter spike's output and confirmed registry correctness is
   acceptable — this is a harder bar than 005-007's single-chapter spikes and deserves
   proportionately more scrutiny given the compounding-risk nature of this task.
2. Design the merge-decision logic: default to "new candidate, don't merge" unless the
   model's own output plus a code-level corroboration check (e.g. matching aliases,
   matching narrative context) meets a conservative bar. Any merge decision below that bar
   creates two (or more) candidate records and a review-queue entry flagging possible
   duplication, per the spec's own rule — never a silent merge.
3. Implement the DB write path into `characters` and `chapter_segments` (the actual
   columns task 001 added) — this is the first task in the pipeline that writes to the
   live tables. Every AI-written row must carry `ai_suggested = 1`, `locked = 0`, and the
   appropriate `needs_review`/`review_reasons` per 005-007's flags — per INV-3
   (`01-map.md`), reconciliation writes suggestions, never confirmed state. A `locked = 1`
   row must never be overwritten by this pass (re-verify this against whatever a human
   already confirmed in an earlier run) — confirm this by a direct test that a locked
   character/segment survives an update attempt from a later chapter's reconciliation
   unchanged.
4. Implement the book-level reconciliation pass (spec §10 step 7: "run a book-level
   reconciliation pass at the end") as a distinct, later operation from the per-chapter
   incremental reconciliation — this catches issues (e.g. two candidates that should have
   merged) that only become clear with the whole book's context.
5. Add tests per `testing-standards.md`: mock the LLM boundary only (R2); assert the
   locked-row-never-overwritten invariant with a test that first fails without the guard
   (revert-check style) and passes with it; assert the default-to-no-merge behavior with a
   test feeding two similar-but-distinct character candidates and confirming they stay
   separate with a review flag rather than merging.

## Acceptance criteria

- [ ] Multi-chapter validation spike (3-5 consecutive real chapters) run end-to-end; a
      human reviewer has confirmed cross-chapter character identity is handled
      acceptably — correct recognition of returning characters, no over-eager merging of
      distinct characters, ambiguous cases flagged rather than guessed — as a precondition
      for this task being done.
- [ ] Merge logic defaults to "keep separate + flag for review" on ambiguous identity,
      verified by a test with deliberately ambiguous input.
- [ ] `locked = 1` rows are never overwritten by a later reconciliation pass, verified by a
      test that fails without the guard and passes with it.
- [ ] Every row this task writes carries `ai_suggested = 1` and appropriate
      `needs_review`/`review_reasons` — nothing is written as confirmed.
- [ ] Book-level (end-of-book) reconciliation exists as a distinct pass from per-chapter
      incremental reconciliation.
- [ ] Tests mock only the LLM API boundary (R2).
- [ ] `./venv/bin/python -m pytest -q` clean.

## Map links

Part C in `01-map.md` (AI extraction pipeline), step C-4 in `02-roadmap.md` Workload 4.
Invariant INV-3 (never auto-apply — most load-bearing here of all the C-tasks, since this
is the first write path into live tables). Risk: cross-chapter compounding state (see
`02-roadmap.md`'s risk-flag summary for task 008).

## Dependencies

Depends on tasks 005, 006, and 007 (discovery, segmentation/attribution, annotation) — this
task consumes all three passes' output per chapter and is the first to persist it.

## Out of scope

The review-queue backend API surfacing these `needs_review` rows to a human for
confirmation (009's job). Any frontend review UI (012, a later workload). Deciding HOW a
human resolves a flagged duplicate-identity case in the UI — this task only ensures the
data model correctly represents "these might be the same, unresolved" so 009/012 can
surface it.
