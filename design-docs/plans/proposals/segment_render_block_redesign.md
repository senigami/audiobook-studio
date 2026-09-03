# Segment/render-block redesign — preliminary plan

**Status:** preliminary sketch, not a build-ready spec. Full detailed design comes later; this
captures the reasoning and decisions made so far so they survive being picked up cold in a future
session. Tracked in [GitHub issue #232](https://github.com/senigami/audiobook-studio/issues/232) —
this file is the durable record; treat the issue as a pointer to this file, not the other way
around.

**No code should land against this without a real detailed plan reviewed first.** This is a schema
and pipeline redesign, not a rename.

## Why

Follow-up to the terminology ruling in `design-docs/specs/glossary.md` (1.1.0) and the
progress-display fix (PR #231). The owner's ruling: "segment" means the render block (one audio
file, real start/stop time). The current `chapter_segments` table actually stores sentences — one
row per sentence, with several rows sharing one `audio_file_path` when merged into a render batch.
That's backwards from the intended meaning, and it's the wrong shape for the stated future
direction (word-level speaker selection, already prototyped in the demo mock).

## Current state, verified against the live database (2026-08-26)

- `chapter_segments`: one row per sentence. A real chapter this session: 402 rows, collapsing into
  58 distinct `audio_file_path` values (multiple contiguous `segment_order` rows share one rendered
  file when merged by `build_chunk_groups`).
- Grouping (which sentences merge into one render batch) is recomputed fresh at render time
  (`app/domain/chunk_groups.py::build_chunk_groups`) — never persisted as its own row. Same-character
  contiguous sentences merge up to the engine's chunk-size limit.
- Re-sync on text edit (`app/db/segment_alignment.py::align_segments`, used by
  `sync_chapter_segments`) is a content-anchored diffing algorithm: position match, then
  unique-content search, then fragment-run search, preserving row identity (id, character
  assignment, audio fields) across edits where possible. Seven invariants (I1-I7), one documented
  production regression already fixed (RC-1, `span_resync_preservation_fix`).

## Decided shape — single table

**Superseded:** an earlier draft of this proposal split into two tables (`chapter_spans` +
`chapter_segments`). The owner corrected this directly: a "span" is never its own stored row. It's
purely the in-progress editor selection while assigning a speaker — UI-only, transient. The moment
that assignment is submitted, the selection *is* a segment row. **There is one table.**

`chapter_segments` (single table, replaces the current one entirely): one row per render unit, one
row per audio file, **always, by construction**. Roughly: `id`, `chapter_id`, `segment_order`,
`character_id`, `text_content` (the full text this segment renders), `audio_file_path`,
`audio_status`, `audio_generated_at`. Casting/review metadata (locked, needs_review, etc.) now
applies meaningfully at this granularity — a whole render unit, not a sentence — rather than the
currently-dead per-sentence fields (see Open questions).

This resolves the current system's actual defect directly: 402 sentence-rows sharing 58 audio files
can't recur in this shape, because a segment IS the audio file by construction.

## The operation, worked through

1. User selects a text range in the editor (the "span" — transient, UI-only) and assigns it a
   speaker.
2. **Exact match:** the range exactly matches one existing segment's full text and only the speaker
   differs → update `character_id` on that row, invalidate its audio (speaker changed, content
   didn't), re-render.
3. **Sub-range (split):** the range is a sub-range of an existing segment → split that segment into
   up to three new rows (before/selected/after, whichever exist), assign the new speaker to the
   selected piece, keep the original speaker on the outer pieces. **Only the original segment's
   audio is invalidated** — see the non-cascading rule below. Every segment after the split point
   gets `segment_order` shifted to stay contiguous (same renumbering invariant the current
   `segment_alignment.py` already protects, I1a) — renumbering is metadata-only, never a re-render
   trigger.
4. **Multi-segment range:** the range spans multiple existing segments → re-split all overlapping
   segments into the new boundary set, same invalidate + renumber, still non-cascading beyond the
   segments actually touched.
5. **Word-level (future):** same table, finer possible splits, no schema change required — matches
   the stated design intent directly.

Manuscript-text-edit re-sync (independent of speaker reassignment) is a smaller problem in this
shape too — the diff algorithm now reconciles against ~58 rows instead of ~402, though whether it
stays content-anchored (like today) or moves to offset-based is still open (see Open questions).

## Split vs. regroup — two distinct operations

A speaker reassignment that splits one segment must **only** invalidate that one segment's audio.
Every segment after it keeps its existing rendered audio untouched, even though its `segment_order`
shifts. Concretely: if a chapter is fully rendered and the user assigns a new speaker to a sub-range
inside one already-rendered segment, only that one segment splits and only the new pieces need
audio — nothing downstream re-renders.

Real consequence, designed for up front: **repeated incremental splits only ever fragment segments
smaller, never re-merge them.** Over many edits, what could be one efficient render batch degrades
into several small ones, each a separate TTS call. That's expected and fine day-to-day. The
recovery path is an explicit, opt-in **"regroup"**: clearing rendered audio for a chapter (or a
range) and rebuilding lets `build_chunk_groups`' merge logic run fresh and re-consolidate
same-speaker segments back into larger batches. Regrouping is deliberate and destructive-on-purpose;
an incidental speaker split is not.

Two distinct operations, not one:

- **Split** (implicit, from a speaker reassignment): narrow, surgical, invalidates only the
  segment(s) whose boundaries actually changed. The common case — must stay cheap.
- **Regroup** (explicit, user-initiated): the user opts into clearing and re-batching a chapter or
  range; the grouping algorithm re-optimizes batch sizes from scratch.

Not decided beyond this two-operation shape — the actual regroup UI/trigger and how far its blast
radius extends (whole chapter vs. a selected range) still need real design.

## What this touches (not exhaustive — real scoping work)

- `app/db/segments.py` (`sync_chapter_segments`), `app/db/segment_alignment.py` (the whole alignment
  algorithm, likely needs a parallel offset-based version to evaluate against the current one)
- `app/domain/chunk_groups.py` (`build_chunk_groups` — grouping logic moves from ephemeral to
  persisted, and gains the explicit regroup entry point)
- Every consumer of `chapter_segments`' per-row fields for casting/locking/review
  (`app/api/routers/chapters.py`, `frontend/src/hooks/chapter/useChapterAssignments.ts`,
  `ScriptView.tsx`, `CastPalette.tsx`)
- `app/domain/chapters/rendering.py` and the (currently dead, per `design-docs/specs/data-model.md`)
  W-PERF columns — worth resolving in the same design pass since they were built for a related
  unbuilt feature
- Every spec currently describing `chapter_segments`/"segment" in the old sense: `text-processing.md`,
  `data-model.md`, `queue-jobs.md`, `progress-presentation.md`
- A real migration for existing production data (splitting existing sentence-rows into the new
  segment shape without losing audio, casting, or review state)

## Open questions for planning, not decided here

- Is offset-based re-sync actually safer/simpler than content-anchored matching, or does it trade
  one set of edge cases for another? Needs a real design spike, not assumed.
- Do the dead W-PERF columns (`performance_data`, `speaker_confidence`, etc. — confirmed unread by
  any code path, per `data-model.md`) get folded into this redesign or handled separately? The
  owner has said the AI-extraction feature behind them is still planned, so this redesign should
  account for their eventual use, not just delete them.
- Migration strategy for existing chapters with real, already-rendered audio — must not silently
  invalidate work in progress.
- The regroup operation's exact trigger and blast radius (whole chapter vs. a selected range).

## Adversarial review (2026-08-26)

Four independent passes against real code: two done directly by the orchestrator (Findings 1-4
below), plus a three-persona panel (Saboteur, Migration/Integrity, Concurrency) dispatched
separately, each tracing real current code, not reasoning about the plan in isolation. The most
surprising claims from all three were independently re-verified by the orchestrator before being
recorded here (cited below as "verified").

**Headline result: this plan is not safe to build as written.** The most severe finding
(Saboteur C1) shows the re-sync algorithm this plan calls "a smaller problem" cannot actually
express the new shape at all, and would silently destroy every segment, all casting, and all
audio on the first ordinary manuscript edit after migration. A second major discovery
(Saboteur N3/W2, verified) is that split and regroup **already partially exist** in
`app/domain/chapters/operations.py` — this plan's "future design" sections are largely
describing code that's already there, under assumptions the new schema breaks.

### Orchestrator's own findings (before the panel)

**Finding 1 (Critical) — in-flight jobs hold segment ids by value; a split can invalidate them mid-render.**
`app/db/queue.py`'s `processing_queue` table stores `segment_ids` as a JSON-encoded list on the job
row itself (`_encode_segment_ids`, line 12). A job commits to a specific set of segment ids at
submission time and carries them for its whole lifetime. The Concurrency panelist's Finding C1
below traces this same hazard much further (the render task's script snapshot, not just the queue
row) — treat that as the fuller version of this finding.

**Finding 2 (Warning) — no schema-migration framework exists.** Confirmed and substantially
deepened by the Migration/Integrity panelist's C1 below — see there for the full picture
(no versioning, no transaction boundary, swallowed failures, no backup).

**Finding 3 (Note) — orphan GC's job gets simpler under the new shape, in the steady state.**
Still true once the system is fully migrated (every `audio_file_path` becomes unique to its row by
construction) — but see Saboteur C2/C4 and Concurrency C3/W4 below: the *transition* and the
*ongoing split/regroup* operations both create real windows where GC can delete valid audio. The
simplification is real; it does not make GC safe to leave unchanged.

**Finding 4 (Note) — the restart-recovery reset query is shape-agnostic.** Still true in isolation.
See Concurrency W5/W6 and Migration/Integrity C3 below for how recovery interacts badly with a
split that happened mid-flight or across a restart — the query itself doesn't need to change, but
what calls it and what it's allowed to assume does.

---

### Saboteur panel

**C1 (Critical) — Any manuscript text save wipes every segment row, all casting, and all audio.**
`align_segments` (`segment_alignment.py`) matches fresh *sentences* against existing rows in three
passes, and every one of them assumes an existing row is at most one sentence: position+content
equality, single-row unique-content search, and a fragment-run search that only recognizes **many
existing rows concatenating to ONE fresh sentence** — never the inverse. Under the new design a row
is a render block of ~7 sentences; the needed case (one existing row covering many fresh sentences)
does not exist in the algorithm. Every row falls through to unmatched, and `sync_chapter_segments`
deletes all of them and their audio. Concretely: cast a chapter, render it fully, fix one typo,
save — total loss. **The plan's claim that re-sync "is a smaller problem in this shape" is
backwards: it's not smaller, the current algorithm cannot express it at all.** A new
sentence-to-block alignment algorithm is a hard prerequisite for this redesign, not an open
question to defer.

**C2 (Critical) — `build_chunk_groups` still runs on every read and silently destroys audio of any segment adjacent to a same-speaker sibling.**
`get_chapter_segments` recomputes groups on every read and resets any row whose `audio_file_path`
doesn't match the *current recomputed* group leader's name — in the DB, as a side effect of a GET.
Under the new design, any two adjacent same-speaker rows that would now fit in one chunk get
silently merged by this read-path check, invalidating one of the two. Direct violation of "only
that one segment's audio is invalidated." **`build_chunk_groups` must stop running on the read path
entirely** and only run inside the explicit regroup operation once this redesign lands.

**C3 (Critical) — the render write-back still fans one audio file across many row ids; the plan's core invariant is unenforced at the writer.**
The orchestrator's `[SEGMENT_SAVED]` handling calls `update_segments_bulk(sids, ..., audio_file_path=<one filename>)` where `sids` is the whole group's member list — not one-row-per-file. The plan's "can't recur in this shape, because a segment IS the audio file by construction" is a claim about the table, not the writer; the writer needs its own change, and it's not currently on the "what this touches" list.

**C4 (Critical) — no uniqueness constraint on `(chapter_id, segment_order)`; renumbering is currently relative arithmetic with nothing to catch a collision.**
Confirmed independently by the Concurrency panel's W1 below from a different angle (concurrent
writers); Saboteur's angle is that even single-threaded renumbering (`segment_order = segment_order
+ 1 WHERE segment_order > ?`) has no constraint stopping a duplicate or gap from silently
persisting. **Add `UNIQUE(chapter_id, segment_order)`** and make renumbering a deterministic
full-chapter rewrite, not relative arithmetic.

**W1 — "Regroup" already exists (`compact_script_view`, `operations.py`) and isn't in the plan.** It
merges adjacent compatible segments today, but with **no chunk-limit check at all** — under the new
design it can build a row exceeding the engine's `text_chunk_limit` with no re-split path. The plan
needs to reconcile with this existing function, not design a new one, and needs to add the missing
limit check.

**W2 — Split already exists too (`_apply_range_assignment` + `_split_segment_at_offset`,
`operations.py`), and the plan's step 3 should be written as an amendment to it, not a greenfield
design.** Verified directly by the orchestrator. It already does before/selected/after splitting
with word-boundary snapping and order renumbering, and already only invalidates the touched rows —
consistent with the owner's non-cascading refinement. Two concrete divergences to reconcile: it
reuses the original row id for the left piece and mints a new id for the right (Migration/Integrity
C2 below explains exactly why id-reuse across a split is the dangerous case for the render
write-back).

**W3 — the timing sidecar rebuilds groups independently and will silently degrade.** It calls
`get_chapter_segments` + `build_chunk_groups` on its own and reconciles against the chapter WAV
within a 250ms ceiling; a boundary disagreement raises `FileNotFoundError` on a swallowed exception
path — the reader-sync feature degrades with no visible error.

**W4 — orphan GC is filename-keyed and will delete a split's surviving audio in the window between
invalidating the parent row and the successor row owning a file.** Same root cause as
Migration/Integrity C2 and Concurrency C3 below — three independent panelists converged on this
from different angles, strong signal it's real. **The plan needs an explicit ordering rule: never
null a path before the successor row owns the file**, and/or a migration-in-progress gate that
disables GC.

**W5 — an engine change re-opens the chunk limit on already-persisted segments** that self-corrected
automatically today (grouping was always recomputed) but won't under persistence.

**W6 — `base_revision_id` hashes every row's id/order/text/casting; a split rewrites 3 rows and
renumbers everything after it, invalidating every other open editor tab's concurrency token.** A
409 storm where today most edits are row-local. Worth keying the token on content, not the full row
list.

**N3 (verified directly) — the frontend's "span" is not transient today, it IS the segment row.**
`operations.py:153`: `"segment_ids": span_ids, # In script view, span_ids ARE segment_ids`.
`ScriptView.tsx` keys DOM nodes, playback, and the per-span Generate button off those same ids.
Redefining span as UI-only (per the owner's ruling) means ScriptView needs to render **sub-row text
ranges that have no id** — a substantial rewrite, the opposite direction from "these need to move to
operating on spans instead" as currently phrased in this plan's "what this touches" section.

---

### Migration/Integrity panel

**C1 (Critical) — there is no migration versioning, no transaction boundary, and no rollback; this repo cannot currently run a destructive migration at all.** `init_db()` *is* the migration system:
idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN`, re-run on every boot, no
`schema_version`/`PRAGMA user_version` anywhere. Every migration step is individually try/excepted
and swallowed, then `commit()` runs unconditionally regardless. Boot itself swallows migration
failure and boots anyway. No DB backup exists anywhere in the codebase. **Before any schema work: a
real versioned migration runner, one transaction per migration with rollback on failure, a
pre-migration file copy, and a hard boot-time abort on failure — none of which exist today.**

**C2 (Critical) — segment GC deletes any WAV not in the DB keep-set; a mid-migration crash silently destroys all rendered audio.** GC fires on **opening a book** (a user action, not a scheduled sweep)
and only skips chapters with an active render — not chapters mid-migration. Any window where new
rows exist without correct `audio_file_path` values is a window where opening the book permanently
deletes real audio.

**C3 (Critical) — `processing_queue.segment_ids` persists old ids across restart and gets
re-hydrated verbatim into recovered jobs**, which then render audio that matches nothing in the DB
(silently, `WHERE id IN (...)` matching zero rows reports no error) — and C2's GC then deletes it.
Same underlying shape as Concurrency C1/C2 below, found independently from the migration angle.

**C4 (Critical) — segment ids are embedded in on-disk filenames and the timing sidecar; changing
ids renames or orphans every rendered artifact.** The WAV filename IS the group leader's segment id.
This is also the source of the one genuinely good news finding in this whole review:

**W1 — the migration is achievable with zero file renames, and the plan should say so as a hard
constraint.** Because the WAV is named after the leader segment id, collapsing a sentence-group
into one segment row **that keeps the leader's id** preserves every on-disk filename and every
existing timing sidecar's `group_id`. This is the safe migration path; state it as a requirement,
not an implementation detail left to whoever builds it. The sidecar's per-group `segment_ids` array
does go stale under this approach and needs its own rewrite pass or schema version bump.

**W2 — grouping is recomputed from live state, so the migration cannot just re-run `build_chunk_groups` to reconstruct original groups** — the engine's chunk limit and voice-profile state may have
changed since the audio actually rendered, producing different groups than what's on disk. **Group
by the recorded `audio_file_path` on already-rendered rows, never by re-running the grouper.**

**W3 — partially-rendered chapters produce mixed groups with no rule for handling them.** Renders
are all-or-nothing per group, but `sync_chapter_segments` can leave a newly-inserted row sitting
between two preserved (already-rendered) members of what was one group — three real input cases
(all-done, all-unprocessed, mixed), and the plan only accounts for the first two. The safe rule for
the mixed case is invalidate-to-unprocessed, but that hands the file to GC (C2), so the invalidation
and the resulting deletion need to be a deliberate, reported step, not an incidental one.

**W4 — the single-table shape has no place to record which sentences a segment came from, so
alignment loses its anchors** (same root issue as Saboteur C1, found independently from the
migration side). The plan's "reconciles against ~58 rows instead of ~402, so it's easier" is
asserted, not tested, and a one-word edit now invalidates a 400-character render unit instead of one
sentence.

---

### Concurrency panel

**C1 (Critical) — the render job holds a frozen script snapshot; nothing revalidates it against the
DB, so a mid-render split silently produces a chapter WAV stitched from stale text.** Segments are
read once at job submission, never re-read before completion — confirmed directly by the
orchestrator (`_build_script_for_chapter`, `generation_shared.py`). **The plan needs a chapter
render epoch/version, bumped by every split/regroup/resync, captured at submit time and re-checked
at dispatch and at the stitch barrier.** Without it, "only that segment's audio is invalidated" is
unenforceable across a running job.

**C2 (Critical) — the write-back is a blind `UPDATE ... WHERE id IN (...)` with the row-count
result ignored; a completed render for a split-away row is a silent no-op, and a partially
surviving id set is a silent, worse partial resurrection** (a row gets marked done pointing at a WAV
containing the pre-split, wrong-speaker text — a green, "verified" segment with wrong audio). **The
plan must add: split mints fresh ids for all resulting pieces (never reuses the original id for a
piece with different content), and the write-back asserts `rowcount == len(sids)`, failing loudly
otherwise.**

**C3 (Critical) — GC can delete a just-finished render's WAV; its only race guard is a stale read
with no lock across the check-then-scan-then-delete window.** Combined with C2: a render finishes,
write-back no-ops, the job flips done, the guard now passes, GC deletes the file. **Split/regroup
must be a single transaction, and GC must share the same lock discipline** (or a chapter-level
advisory lock both take) — a checked-then-acted-on flag is not a guard.

**W1 — no `UNIQUE(chapter_id, segment_order)` constraint and no lock spanning a full
read-modify-write; two concurrent splits can duplicate or gap the order.** Independently found from
the schema-constraint angle by Saboteur C4 above — two panelists converging on the same missing
constraint from different directions.

**W2 — `sync_chapter_segments` already does a full renumber under this exact pattern and would
collide with a concurrently-running split** unless both take the same lock — including the
caller-owned-transaction path, which currently takes no lock at all.

**W3 — the plan's "only that segment's audio is invalidated" is contradicted by existing code:
`update_segment` blanks the WHOLE chapter's audio (status/path/length, all three) on any
`character_id` write, unconditionally.** Verified directly by the orchestrator. The stitched chapter
output cannot survive a split structurally (the concatenation changed) — the plan needs to say
explicitly that "nothing downstream re-renders" applies to *segment* audio only, with a cheap
re-stitch as the recovery, because as currently written the two statements read as compatible and
are not.

**W4 — `get_chapter_segments`'s canonical-filename check is a hidden second writer to
`chapter_segments`, fired from a GET, on the request thread**, and under the new design it either
produces a false green (id-reuse case) or mass-invalidates (rename-on-regroup case) depending on
which choice the detailed design makes for W2/C2 above.

**W5 — restart mid-split is unrecoverable, and the mixed-engine recovery path marks EVERY row in
the chapter done**, including rows a split created after the job was submitted that were never
rendered. **Split/regroup need one transaction (SQLite gives atomicity for free once it's actually
one transaction), and recovery must mark done only the ids from the job's own snapshot, intersected
with rows that still exist.**

**W6 — recovered tasks lose the script snapshot entirely** (no `script` column on the persisted job
row), so pre-restart and post-restart behavior differ in exactly the dimension this plan cares
about: before a restart the job ignores splits, after one it silently adopts them. Pick one,
explicitly.

---

### Convergent findings (independently found by 2+ panelists — highest confidence)

- **GC can delete valid audio during migration or ongoing split/regroup**, found independently by
  Saboteur (W4), Migration/Integrity (C2), and Concurrency (C3) from three different angles.
- **No unique constraint on `segment_order`, no lock across renumbering**, found independently by
  Saboteur (C4) and Concurrency (W1).
- **The re-sync/alignment algorithm cannot handle the new shape**, found independently by Saboteur
  (C1) and Migration/Integrity (W4) from the correctness angle and the migration angle respectively.
- **In-flight jobs hold stale segment references across a split**, found independently by the
  orchestrator (Finding 1), Concurrency (C1/C2), and Migration/Integrity (C3).

### Recommendation

The parent synthesis of this review (a second, independent pass over all three panelists' findings)
converged on the same picture and adds one concrete, actionable recommendation worth recording as
such: **before #232 gets scoped further, build the versioned migration runner as its own
prerequisite issue.** It's independently valuable (every future schema change needs it, not just
this one), it deserves its own review, and #232 cannot be honestly estimated until it exists.
Rough cost: about a day (a version table, one transaction per migration with rollback, a
pre-migration file copy, a hard boot-time abort on failure instead of the current swallow-and-commit
pattern, a dry-run mode).

It also names three explicit statements this plan needs to make before real design work starts,
which it currently leaves implicit or contradicts elsewhere in the same document:
1. `build_chunk_groups` stops running on the read path entirely — it only runs inside the explicit
   regroup operation.
2. Split always mints fresh ids for every resulting piece — never reuses the original row's id for
   a piece whose content changed.
3. "Nothing downstream re-renders" on a split covers **segment** audio only — the stitched chapter
   WAV cannot survive a split structurally and needs its own cheap re-stitch as the recovery step.

### What this means for scope

This is no longer a "rename plus a schema tweak." Before real implementation planning starts, the
detailed design needs to resolve, at minimum: a real migration framework (doesn't exist today), a
new sentence-to-block alignment algorithm (the current one cannot express the new shape), a chapter
render epoch to protect in-flight jobs, transactional/locking discipline shared across
split/regroup/resync/GC, and reconciliation with the split/regroup code that already exists in
`operations.py` rather than a fresh design. None of this blocks keeping the plan as a preliminary
sketch — it means the "real detailed design" the owner has already said comes later has a much
longer prerequisite list than this document originally implied.

## References

- `design-docs/specs/glossary.md` — the terminology ruling this proposal implements
- `design-docs/specs/text-processing.md` Stage 5/6 — current pipeline this redesign replaces
- `app/db/segment_alignment.py` — current re-sync algorithm
- PR #231 — the progress-display fix that surfaced this as a real architectural question
- GitHub issue #232 — tracking issue, points back here
