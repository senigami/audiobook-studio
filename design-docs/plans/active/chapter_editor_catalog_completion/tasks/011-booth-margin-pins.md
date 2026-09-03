# Task 011 — Session-only margin pins (line flags)

Status: pending

Risk: none

## Goal

Let a user drop a lightweight, non-destructive "flag" on the currently-playing line in Booth mode (keyboard shortcut `F`, per the design doc), visible as a small marker next to that line, reviewable via a counter — and have it vanish completely on reload. No note/description field, no persistence of any kind (not localStorage, not the backend).

## Why this matters

`chapter-editor-modes.md` §6: *"Flag a line (hold `F` / long-press) drops a non-destructive margin pin; a counter lets you review flagged lines afterward. This absorbs what the old 'Review tab' was for — review happens inside reading, not as a separate place."* §13 decision #4 makes this explicit for v1: **"Session-only margin pins ship in v1 (lightweight, no persistence). Written notes and persistent flags are post-v2 (see §16)."** This is a distinct feature from the existing `AnnotationsPanel` (which is persistent, localStorage-backed, and carries a text note) — the two must not be conflated or merged into one mechanism.

## Exact files

- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/LineFlags.tsx` — named explicitly in `chapter-editor-modes.md` §17's file layout (`LineFlags.tsx  # Session-only margin pins`); does not exist on disk yet.
- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/index.tsx` — mount the flag store, wire the `F` keydown handler, render the marker per segment, add a flagged-count indicator to the topbar.
- New test: `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/BoothTool/LineFlags.test.tsx` (or extend `BoothTool.test.tsx` if the logic stays small enough to inline).

## Current shape (verified)

- `BoothTool/index.tsx` (318 lines, read in full) has **no** `F`/long-press key handler anywhere and **no** margin-pin rendering. The only existing keyboard handling is the per-segment `Enter`/`Space` seek handler at lines 274-279.
- `LineFlags.tsx` does not exist on disk.
- `DirectorsConsole/index.tsx` renders only the active tool's component tree (`const ActiveToolBody = activeTool?.component;`, `index.tsx:42`, then conditionally rendered) — **`BoothToolBody` unmounts when the user switches to another mode (Cast/Revise/Write) and remounts on return.** Plain `useState` inside `BoothToolBody` would therefore silently lose all flags on a mode switch within the same session, which would defeat "a counter lets you review flagged lines afterward" the moment the user glances at Cast mode and comes back. Confirmed by reading `DirectorsConsole/index.tsx` — this determines the storage shape below, not left as an open question.
- The existing `AnnotationsPanel.tsx` + `@/store/annotations` is the **persistent** (localStorage) note system — it must stay completely separate. Do not write flags through `@/store/annotations`; that store persists to `localStorage`, and reusing it would make a "session-only" pin indistinguishable from a saved annotation and would violate the "must not survive reload" requirement.
- Design doc's glyph reference (`chapter-editor-modes.md` §13) lists a `🏴`/pin icon for "session flag from Booth mode" as one of several gutter glyph types, alongside Cast's ⊘/⚡ (tasks 005-008) and the annotation-note glyph (task 009, via the shared gutter from task 007). **This task deliberately does NOT route through that shared gutter component** — per the roadmap, task 011 is independent with no dependency on 007/009/010; keep this self-contained (a per-row inline marker, not a shared-component integration) rather than blocking on 007's landing.

## Target shape

1. `LineFlags.tsx` exposes a tiny in-memory-only store — a module-scoped `Set<string>` of flagged segment ids plus a listener `Set`, wrapped in a `useSyncExternalStore`-based hook (mirror `@/store/annotations`'s subscribe/emit shape, but with **no `localStorage` calls anywhere** — this is the one structural difference that makes it session-only). Exports: `useFlaggedSegments(chapterId): Set<string>`, `toggleFlag(chapterId, segmentId): void`, `clearFlagsForChapter(chapterId): void`.
2. Module-scoped (not component `useState`) so flags survive a Booth-mode exit/return within the same tab session (per the unmount finding above), but are naturally wiped by a full page reload (module state resets — nothing to read back from storage).
3. In `BoothToolBody`, a `keydown` window listener toggles the flag on `activeSegmentId` (from `useBoothPlayback`) when `F`/`f` is pressed — guarded so it does not fire while a text input has focus (check `document.activeElement instanceof HTMLTextAreaElement || instanceof HTMLInputElement`, or an equivalent ref-based guard) so it never hijacks typing in the `AnnotationsPanel` textarea or anywhere else.
4. A visual marker per flagged segment, rendered inline in the existing `.review-text-view` segment map (`BoothTool/index.tsx:257-289`) — add a class (e.g. `review-text-view__segment--flagged`) alongside the existing `--active`/`--pulse` toggles, or a small pin icon positioned at the segment's row start. No shared gutter-component integration required.
5. A small "N flagged" counter in `review-main__topbar` (alongside the existing Annotations toggle button) — clicking it (or a flagged marker directly) calls `seekToSegment` to jump there, satisfying "a counter lets you review flagged lines afterward."
6. Flags clear when `resolvedChapterId` changes (call `clearFlagsForChapter` on chapter switch) and are gone entirely after any reload (nothing persisted).
7. Long-press (touch) is optional for this v1 pass — the design doc lists "hold `F` / long-press" as alternative gestures, not both mandatory. Keyboard-only satisfies v1 scope; if long-press is skipped, note that explicitly as a scope reduction rather than silently dropping it.

## Steps

1. Build `LineFlags.tsx`: a module-scoped `Map<string, Set<string>>` (chapterId → flagged segment ids) + a listener `Set`, exposing `useFlaggedSegments(chapterId)`, `toggleFlag(chapterId, segmentId)`, `clearFlagsForChapter(chapterId)` — model the subscribe/notify shape on `@/store/annotations.ts` but omit every `localStorage` call.
2. In `BoothTool/index.tsx`, import and call `useFlaggedSegments(resolvedChapterId || '')`; add a `useEffect` window `keydown` listener that calls `toggleFlag(resolvedChapterId, activeSegmentId)` on `F`/`f`, guarded against active-input focus.
3. Add the flagged-marker class/element to the segment map render loop.
4. Add the "N flagged" counter button/badge to `review-main__topbar`, wired to seek to the first (or most recently flagged) segment, or expand a tiny list — keep this minimal, it's a review aid, not a new panel.
5. Call `clearFlagsForChapter` in the existing chapter-change effect (or a new one keyed on `resolvedChapterId`).
6. Write `LineFlags.test.tsx` covering: `toggleFlag` adds/removes an id, `useFlaggedSegments` returns a stable snapshot per chapter, `clearFlagsForChapter` empties only that chapter's set (not others), and no `localStorage.setItem` call ever fires from this module (spy on it and assert zero calls across the test file).
7. Extend `BoothTool.test.tsx` (or add a focused test) covering: pressing `F` while a segment is active adds a flag marker; pressing `F` while a mocked text input has focus does not toggle a flag.
8. Live-verify: play a chapter, press `F` on the active segment, confirm a visible marker appears and the counter increments; switch to Cast mode and back to Booth, confirm the flag is still there; reload the page, confirm it's gone.

## Acceptance criteria

- [ ] Pressing `F` while a segment is active in Booth mode drops a visible, non-destructive marker on that segment, and the topbar counter reflects the current flagged count.
- [ ] Flags survive switching to another Director's Console mode and back (module-scoped state, not component `useState`), but never survive a full page reload — confirmed by both a live check and a test.
- [ ] Pressing `F` while a text input (e.g. the `AnnotationsPanel` textarea) has focus does NOT toggle a flag — confirmed by a test.
- [ ] No note/description field is attached to a pin — flags are id-only markers; the existing, separate `AnnotationsPanel` remains the only place with a text field.
- [ ] Zero `localStorage`/backend writes are introduced by this feature — confirmed by a test spying on `localStorage.setItem` across `LineFlags.tsx`'s code path.
- [ ] Clicking the counter (or a flagged marker) seeks to a flagged segment.
- [ ] `npm -C frontend run test -- --run` clean, including new `LineFlags` coverage and the extended `BoothTool.test.tsx` cases.
- [ ] Live-verify: flag several lines, confirm the counter updates, confirm a fresh page load clears all flags.

## Map links

Part G in `01-map.md`. Workload 4, task 011 (`[G-pins]`, independent) in `02-roadmap.md`. Design doc §6 ("Flag a line") and §13 decision #4 ("Session-only margin pins ship in v1"). §17's file layout names `LineFlags.tsx` explicitly.

## Dependencies

None — independent of tasks 007, 009, and 010 (confirmed by the roadmap's dependency graph: "010, 011 → independent, parallel-safe with everything").

## Out of scope

- Do not add persistence or a notes field to pins — that is §16's explicitly post-v2 "Session-persistent flags with notes," out of scope for this entire plan per `00-overview.md`'s Non-goals.
- Do not integrate with the shared gutter component from task 007 — this task is intentionally self-contained; do not block on or wire into 007's component.
- Do not build long-press/touch support if it isn't trivially available in the existing event-handling setup — keyboard (`F`) alone satisfies v1 scope; document the reduction if long-press is skipped rather than silently dropping it.
