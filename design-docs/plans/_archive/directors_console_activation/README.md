# Director's Console Activation — wire in and complete the Cast/Booth/Revise/Write scaffold

Wires the already-built-but-unmounted `frontend/src/pages/ChapterEditor/components/DirectorsConsole/` into the Chapter Workspace (`BookLayout.tsx`), replacing the ad-hoc `Studio | Review` toggle, and fills in real functionality for its three stubbed tools plus a new fourth (Write) — per `design-docs/workflows/chapter-editor-modes.md`.

## Why this plan exists (and supersedes an earlier one)

A prior plan (`design-docs/plans/_archive/chapter_workspace_merge_superseded/`) set out to hand-build a `Cast | Follow Along | Edit Text` mode switcher directly in `BookLayout.tsx`. Before dispatching it, research turned up that `DirectorsConsole/` — a left-rail tool-registry shell with `CastTool`/`BoothTool`/`ReviseTool` stubs — was already built for exactly this purpose (`design-docs/plans/TASKS.md:521`, shipped dark 2026-07-03) and its gating condition (WL1, bug fixes B1–B4) cleared the same week (`TASKS.md:508`). Building a second, parallel toggle would have duplicated a more complete, already-designed architecture. This plan builds on the real scaffold instead.

**Good news on scope:** two of the three real tools are near-mechanical ports of code that already works, not new builds:
- **Cast** → `frontend/src/pages/Book/stages/StudioStage.tsx` (419 lines) already *is* a complete paint-assignment UI: `ScriptView` span-click/drag assign, a `selectedCharacterId` "loaded brush" banner, `CastPalette` sidebar. Porting is relocation + adaptation, not invention.
- **Booth** → `frontend/src/pages/Book/stages/ReviewStage.tsx` + `ReviewStage/{FollowAlongPanel,AnnotationsPanel,useReviewPlayback}.ts` already *is* a complete listening/flagging surface: percent-based karaoke highlight, click-to-seek, regenerate-segment, notes. Same story.
- **Revise** (in-place paragraph edit) is genuinely new UI — confirmed nowhere in the codebase — but the backend already supports it end-to-end: `app/db/segments.py:295 update_segment(segment_id, **updates)` accepts `text_content` with no API-layer whitelist (`app/api/routers/chapters.py:197-216` passes the request body straight through), and already triggers the correct stale-audio cleanup when `text_content` or `audio_status="unprocessed"` is in the update. No backend work needed — only a new frontend field + UI.
- **Write** (full source editor) doesn't exist as a `DirectorsConsole` tool at all yet — not even a placeholder, despite the design doc treating it as first-class v1 (§7b, §13), not a future item. This is the plan's one wholly-new folder, and it's a thin wrapper: `frontend/src/pages/Book/components/ChapterTextPanel.tsx` + `frontend/src/pages/Book/lib/useChapterText.ts` already do exactly what Write mode needs (full raw-textarea edit, produced-chapter lock + warning, resync-preview flow) — this is what the superseded plan's Task 003 had already correctly speced, just in the wrong location (it targeted `StudioStage.tsx` directly instead of a proper `DirectorsConsole` tool module).

## Explicitly out of scope for this pass

Per the design doc, Cast mode's full catalog (Word/Sentence/Paragraph brush sizing, variation 3-way toggle, Match Voice eyedropper, Stage Direction, Performance Cue + SSML Cue Editor, mutation-batching event-collector) and Booth's annotation-gutter glyphs are real, specified features — but `StudioStage`/`ReviewStage` don't have most of them today either. This plan's bar is: **port current working functionality faithfully into the new tool shape, don't regress, don't invent the full v1 catalog in one pass.** The richer catalog is real follow-on work, tracked in `design-docs/plans/TASKS.md`, not silently dropped — see `00-overview.md`'s "Deliberately deferred" list.

## Two other findings folded in as small, contained tasks

1. **Naming collision** (flagged by a prior frontier review, `TASKS.md:521`, never resolved): `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx` already exports its own, unrelated, live-mounted `DirectorsConsole` for the North Star demo. Zero functional conflict today (no cross-imports — confirmed by grep), but two same-named exported components in one repo is a standing confusion risk once both exist "for real." Task 001 renames the demo's export.
2. Once all four tools are real, the old `StudioStage.tsx`/`ReviewStage.tsx` (+ folder) and the `WorkspaceView` toggle become dead code — Task 007 removes them, after Task 006 confirms nothing regressed.

## How to read this folder

| File | Purpose |
|---|---|
| `00-overview.md` | Task, scope, success criteria, deferred-features list |
| `01-map.md` | Parts, connections, contracts, invariants |
| `02-roadmap.md` | Ordered workloads + dependency graph |
| `tasks/NNN-*.md` | Self-contained task files |

## Status protocol

Whoever executes a task updates its `Status:` line and ticks its `- [ ]` checkboxes in the same change as the work. When every task is complete, move this whole folder to `design-docs/plans/_archive/directors_console_activation/` and update `design-docs/plans/TASKS.md`'s Chapter Editor art-program entry to reflect completion.
