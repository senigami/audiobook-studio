# Task 009 — Booth annotation glyphs (gutter consumer)

Status: pending

Risk: none

## Goal

Render each of Booth mode's existing (localStorage-backed) annotations as a glyph in the shared annotation gutter component built by task 007, instead of leaving those notes discoverable only via the `AnnotationsPanel` flat-list side drawer. The gutter becomes a visual index/quick-jump into the notes; the side drawer stays as the actual create/edit surface.

## Why this matters

Today a Booth-mode user has no way to see, at a glance, which lines have notes — they have to open the `AnnotationsPanel` drawer and scan a flat list. `chapter-editor-modes.md` §13's "Annotation gutter" decision explicitly extends to Booth's own signals (it's one of four glyph types listed: ⊘ Stage Direction, ⚡ Performance Cue, 🏴 session flag, and a colored tick for variation — this task adds Booth's persistent-note glyph to that same shared surface, per task 007's generic contract, so Cast and Booth never grow two incompatible gutter implementations (INV-3 in `01-map.md`)).

## Exact files

- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/index.tsx` — mount the shared gutter, build the glyph-entry array from existing annotations.
- `frontend/src/store/annotations.ts` — read-only consumer via the existing `useAnnotations` hook; **do not modify this file** (this plan's map defines only INV-1 through INV-5 — there is no "INV-6"; the intent is simply "no new persistence mechanism," in the spirit of INV-1's "no second data model," not a separately numbered invariant).
- Task 007's shared gutter component — `design-docs/plans/active/chapter_editor_catalog_completion/tasks/007-shared-gutter-component.md` now exists (it was drafted in parallel with this task) — read its actual final prop contract (e.g. the exact `GutterGlyph[]` shape) before wiring this task's glyph-entry array; do not assume the prop names guessed here are final.
- `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/BoothTool/BoothTool.test.tsx` — existing suite, must stay green; extend with gutter-entry coverage.
- `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/BoothTool/AnnotationsPanel.test.tsx` — existing suite, must stay green (this task does not change `AnnotationsPanel.tsx`'s behavior).

## Current shape (verified)

- `AnnotationsPanel.tsx` is a flat-list + text-editor side panel (280px, `AnnotationsPanel.tsx:96-175`), reading/writing via `useAnnotations`/`saveAnnotation`/`deleteAnnotation` from `@/store/annotations` — localStorage-only, no backend persistence (comment at `AnnotationsPanel.tsx:1-9`: "ported verbatim... no backend persistence"). There is **no gutter anywhere today** — no narrow left-edge margin column, no glyph rendering.
- `useAnnotations(chapterId)` (`annotations.ts:104-111`) returns `Annotation[]` — `{ segmentId, chapterId, notes, updatedAt }` — sorted by `updatedAt` descending. No glyph-type field exists on this shape; any glyph type must be derived/added at the mapping step in this task, not in the store.
- `BoothTool/index.tsx` (318 lines) renders segments as plain `<div>`s inside `.review-text-view` (lines 257-289) with `review-text-view__segment[--active|--pulse]` class toggles — no left-margin column of any kind exists to mount a gutter into.
- **Task 007 (shared gutter component) may not exist yet as a task file.** As of this task's drafting pass, `design-docs/plans/active/chapter_editor_catalog_completion/tasks/007-shared-gutter-component.md` was not found on disk. Task 007 is a hard dependency (see roadmap: `009 depends: 007`) — its component is designed once for both Cast's ⊘/⚡ glyphs and this task's annotation glyphs, per `01-map.md` Part F/G and the Connections section ("F is shared infrastructure for E and G... build F once... before either E or G's glyph-rendering pieces").

## Target shape

1. Read `tasks/007-shared-gutter-component.md` in full for the component's exact import path, export name, and prop contract before writing any code here. If 007 has not landed yet, do not start this task — pick it up once 007 merges.
2. Expected prop contract per the map's design intent (confirm exact field names against 007's actual file): an array of entries shaped roughly like `{ segmentId: string; glyphType: string; tooltip?: string; onClick?: () => void }`, rendered as a narrow (~12–16px) left-edge column beside the prose, one glyph per matching segment, stacking vertically when a segment has multiple glyph types (`chapter-editor-modes.md` §13: "Multiple glyphs on one line stack vertically in the gutter").
3. In `BoothToolBody`, call `useAnnotations(resolvedChapterId || '')` (already imported one level down in `AnnotationsPanel.tsx`; import it directly in `index.tsx` too) and derive a memoized `glyphEntries` array: one entry per annotation, `segmentId: anno.segmentId`, a glyph type distinct from Cast's `⊘`/`⚡` (e.g. `'note'` — use whatever enum/string 007's component expects), `tooltip: anno.notes` (truncate for legibility, e.g. first ~60 chars), `onClick: () => seekToSegment(anno.segmentId)`.
4. Mount the shared gutter component inside `.review-main__body`, positioned so glyphs row-align with each segment's rendered position — match whatever placement pattern 007's own Cast-mode usage establishes (read Cast's consumer of 007 if it has landed, so Booth and Cast don't invent two different mounting conventions).
5. Keep `AnnotationsPanel` mounted exactly as today (unconditionally, still gated by `showAnnotations`) — the gutter is an additional, always-visible index, not a replacement for the side drawer. Clicking a gutter glyph seeks to the segment, matching the existing behavior of clicking an `AnnotationsPanel` card (`AnnotationsPanel.tsx:134`).
6. No changes to `@/store/annotations` — reuse `useAnnotations`/`saveAnnotation`/`deleteAnnotation` exactly as-is.

## Steps

1. Read `tasks/007-shared-gutter-component.md` fully; note the exact component path, prop names, and glyph-type enum/convention it establishes. If it doesn't exist yet, stop here and wait for it to land (do not speculatively build against an assumed contract).
2. In `BoothTool/index.tsx`, import `useAnnotations` from `@/store/annotations` and the shared gutter component from 007's confirmed path.
3. Inside `BoothToolBody`, build `glyphEntries` from `useAnnotations(resolvedChapterId || '')`, memoized on the annotations array and `seekToSegment`.
4. Render the gutter component in the JSX in the same relative position Cast's consumer uses (once available), so Booth and Cast read consistently.
5. Manually verify: type a note in the existing `AnnotationsPanel` textarea and save it, confirm a glyph appears in the gutter next to that segment; delete the note, confirm the glyph disappears.
6. Run `npm -C frontend run test -- --run` and confirm `BoothTool.test.tsx` and `AnnotationsPanel.test.tsx` still pass; add new assertions to `BoothTool.test.tsx` covering glyph rendering and click-to-seek.

## Acceptance criteria

- [ ] Every existing localStorage annotation for the open chapter renders as one glyph in the shared gutter component from task 007 — no second, bespoke gutter implementation built for Booth (INV-3).
- [ ] Clicking a gutter glyph seeks the player to that segment (same behavior as clicking the `AnnotationsPanel` card today).
- [ ] `AnnotationsPanel` side-drawer still functions unchanged — create/edit/delete notes exactly as before; it is not removed or replaced in this task.
- [ ] No new persistence layer added — `@/store/annotations` untouched.
- [ ] `npm -C frontend run test -- --run` clean, including `BoothTool.test.tsx` and `AnnotationsPanel.test.tsx`.
- [ ] Live-verify: open Booth mode on a chapter with at least one saved annotation, confirm a gutter glyph renders next to the correct segment and is clickable.

## Map links

Part G in `01-map.md` ("Booth: gutter + speed + pins" — reuses F's gutter component for Booth's own glyphs). Workload 4, task 009 (`[G-glyphs] depends: 007`) in `02-roadmap.md`. Invariant INV-3 ("One gutter, not two").

## Dependencies

Hard dependency on task 007 (shared gutter component) — do not start until 007's component exists on disk and its task file's contract is readable. Not blocked by, and does not block, tasks 010 or 011.

## Out of scope

- Do not build the session-only margin pins (011) or the playback speed control (010) here — those are independent siblings in Workload 4.
- Do not change the Stage Direction/Performance Cue data model or Cast's own gutter glyphs (⊘/⚡) — that is Workload 3 (tasks 005-008), already landed by the time this task starts per the dependency ordering.
- Do not add backend persistence to annotations — they remain localStorage-only per the repo convention already documented in `AnnotationsPanel.tsx`'s header comment.
