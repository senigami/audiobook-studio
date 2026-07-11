# Task 005 — Build the real `ReviseTool` body (new: in-place paragraph edit)

Status: done (see completion note for one flagged, confirmed scope narrowing)
Risk: quality-sensitive — genuinely new logic touching real chapter segment text and triggering re-renders. Gets adversarial review regardless of diff size, per plan-run's gating rules.

## Goal

Replace `ReviseTool`'s stub with real in-place paragraph editing, per `design-docs/workflows/chapter-editor-modes.md` §7. Unlike Cast/Booth, there is **no existing UI to port** — this is new frontend code. The backend already supports it fully; no backend changes are needed (verified — see Contracts below).

## Design doc contract (§7, quoted)

> Click a paragraph → only that paragraph's text becomes editable inline. Tints fade to subtle but stay visible; spans in other paragraphs remain read-only. A slim banner appears: "Editing — save to re-render this section."
>
> On commit: only the edited segment's audio is invalidated and queued for re-render.
>
> **Segment overflow and balanced split:** if an edit causes the segment text to exceed the engine's character buffer (~500 chars for XTTS), split at the nearest sentence boundary (`.`/`?`/`!`/`;`) to the midpoint; both halves must be above an ~80-100 char floor; if no clean boundary exists near the midpoint and a half would fall below the floor, do not split — let the segment run long and show a passive (non-blocking) indicator. Both split segments inherit the original speaker assignment.

## First step — resolve the paragraph↔segment mapping question (do this before writing any UI code)

The design doc's user-facing unit is "paragraph"; the backend's editable unit is "segment." Before building, check `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` for however it currently groups spans into paragraphs/render-groups (search for `groupNumberForSpan`, referenced from `StudioStage.tsx`'s `ScriptView` usage — see Task 003) to determine: does one paragraph reliably correspond to exactly one segment in this codebase's chunking today? If yes, "click a paragraph" and "edit one segment's `text_content`" are the same operation — proceed as scoped below. If a paragraph can span multiple segments, narrow this task's v1 scope explicitly to **"click a segment, edit its text"** (still a real, useful feature — just don't claim paragraph-level granularity the data model doesn't actually have) and note the discrepancy in this task's completion note for `TASKS.md`.

## Contracts (already live — no backend work)

```
PUT /api/segments/{segment_id}
  body: { text_content: string, audio_status: "unprocessed" }
```
`app/api/routers/chapters.py:197-216` → `app/db/segments.py:295 update_segment(segment_id, **updates)`. No whitelist; `text_content`/`audio_status="unprocessed"` already trigger correct stale-audio cleanup (`segments.py:303`).

Re-render trigger (reuse the exact pattern from `ReviewStage.tsx:78-91`'s `handleReRenderSegment`, now ported into `BoothTool` by Task 004 — read that file for the working call shape): `api.generateSegments([segmentId])`.

## Exact files

- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/index.tsx` — replace stub.
- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/SegmentSplitter.ts` — pure function implementing the balanced-split algorithm above (no React, easily unit-testable in isolation). Signature: `splitSegmentText(text: string, maxChars: number, minFloor?: number): { segments: string[] } | { segments: [string] }` (returns one segment unchanged if no valid split exists — do not throw).
- `frontend/src/api/index.ts:254` — add `text_content?: string` to `updateSegment`'s `data` type parameter.

## Steps

- [x] Resolve the paragraph↔segment mapping question above first. **Resolved: NOT 1:1.** `app/domain/chapters/operations.py::get_script_view_payload` accumulates `current_paragraph_span_ids` across multiple segment rows until a paragraph-break is detected on a row, so one `ScriptParagraph` can legitimately contain several segment ids. v1 scope is narrowed to **"click a segment, edit its text"** — same unit `BoothTool` already uses — per INV-5's explicit instruction to narrow rather than assume.
- [x] Build `SegmentSplitter.ts` per the algorithm, with unit tests covering: text under the limit (no split), text over the limit with a clean sentence boundary near the midpoint (splits there), text over the limit with no clean boundary near the midpoint and one half would be under the floor (does not split, returns original text unchanged). The passive indicator is a `ReviseToolBody` (UI) concern, not inside the pure function.
- [x] Build `ReviseToolBody`: renders chapter segments via `api.fetchSegments` (same fetch pattern as `BoothTool`, not duplicated/re-invented). Click a segment → inline `<textarea>` for just that one (read-only elsewhere) → banner "Editing — save to re-render this section" → commit calls `api.updateSegment(id, { text_content, audio_status: 'unprocessed' })` then `api.generateSegments([id])`. Engine char limit hardcoded to 500 (no existing frontend source for `text_chunk_limit` found — checked `useStudioChapter`/`StudioStage`, neither sources it; flagged as a follow-up, not new backend plumbing).
- [x] Add `ReviseTool.test.tsx` covering click-to-edit/single-segment-editable, commit's API call sequence+ordering, cancel-discards-draft, and a failed-commit error path. **Deviation flagged:** the "split-needed case invokes SegmentSplitter and produces two updateSegment/generateSegments-worthy pieces" bullet as originally written is not implemented literally — see completion note below. The test instead asserts the actual (safe) v1 behavior: a clean split is detected but the edit still commits as ONE `updateSegment`/`generateSegments` call pair, with a passive overflow hint shown.
- [ ] Live preview: open a chapter with existing text, enter Revise mode, edit a paragraph, save, confirm only that segment shows as re-queued/re-rendering (not the whole chapter). **Not run** — no live app instance available in this execution; flagging per the acceptance criterion below rather than silently marking done.

## Acceptance criteria

- [x] Clicking a segment (per the resolved mapping — see note above, this is segment-level, not paragraph-level) makes only that unit editable; everything else stays read-only.
- [x] Commit updates `text_content` via the existing endpoint, resets `audio_status`, and triggers re-render of only that segment — verified by `ReviseTool.test.tsx` (API-mocked); **not verified against a live running app** (no live instance available this session) — flagging rather than assuming; live-app verification is still outstanding.
- [x] `SegmentSplitter` unit tests cover all three branches (no-split / clean-split / no-clean-boundary-so-no-split) — the clean-split test explicitly asserts the split point differs from a naive "always split at the character limit" cut (which would land mid-word), proving it exercises the balanced-split logic and not just character counting.
- [x] `npx tsc -b --force` clean.
- [x] Append a `docs/code-map/queue/` entry.

## Completion note — confirmed backend gap on the two-segment split (flag for `TASKS.md`)

The design doc's overflow behavior calls for the second half of a clean split to become its **own segment**, inheriting the original speaker assignment. Checked `app/db/segments.py` (`update_segment`, `update_segments_bulk`) and `app/api/routers/chapters*.py`: there is no endpoint to insert a new segment row into an existing chapter. `sync_chapter_segments` (`/chapters/{chapter_id}/sync-segments`) is the only segment-recomputation path, but it's a whole-chapter resync (the same mechanism Write mode's resync-preview flow gates behind an explicit, destructive-change-warning modal) — reusing it here would blow past Revise mode's "only that segment's audio is invalidated" blast-radius contract and is explicitly out of this task's scope. Given no way to persist a genuine two-DB-row split without new backend plumbing, `SegmentSplitter.ts` is built and fully unit-tested per spec (a real, reusable, well-tested piece of the eventual feature), but `ReviseToolBody`'s commit path does not yet call it to create a second segment — an overflowing edit is always persisted as one (possibly long) segment with a passive, non-blocking indicator, whether or not a clean split point exists. Completing the two-segment behavior needs a new backend segment-insert endpoint — tracked here as follow-up work, not silently dropped.

## Dependencies

Task 002 (mounted console). Should run after at least one of Task 003/004 lands (quality dependency — match established conventions in the new folder structure), but is not file-overlapping with either, so this is a soft, not hard, ordering constraint.

## Map links

- Part: `ReviseTool` — `01-map.md`, "The parts"
- Invariant: INV-1 (zero-prop), INV-5 (paragraph↔segment mapping must be confirmed, not assumed)
- Risk: `quality-sensitive` (new logic against real chapter text + render triggering — mandatory adversarial review per plan-run's gating rules regardless of how small the diff looks)

## Out of scope

- Any change to `ChapterTextPanel.tsx`/`useChapterText.ts` (that's Write mode, Task 006 — a different, full-source editing concept, not this one).
- Building a persistent notes/annotation system for Revise edits (none specified in the design doc for this mode).
