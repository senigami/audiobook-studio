# Engine-Agnostic Conversion Backlog

Phases 1–11 and nearly all of Phase 12 (directory cleanup, storage abstraction, declared plugin
contract, config/model generalization, plugin relocation, orchestration registry, API/routing
generalization, state/metrics cleanup, docs/audit) are **shipped** — see
[COMPLETED_WORK.md](../COMPLETED_WORK.md) for the record; not reproduced here. Release-blocker
tracking lives in [REMAINING_TASKS.md](../REMAINING_TASKS.md).

The former "Deferred Architecture: Namespace Rename" section is retired from this file: the
`plugins/` → `tts_engines/` rename fully shipped (COMPLETED_WORK.md "Backend namespace &
code-org"; `PLUGINS_DIR` resolves to `tts_engines/` by default, confirmed in
`app/core/config.py`). The remaining namespace items (voice bundle rename, reserving `plugins/`
for app-behavior extensions) are tracked once, in REMAINING_TASKS.md's "Code still to write" →
Milestone 3 backend namespace (006).

## Still open here (not tracked elsewhere)

- **Phase 1: Delete `uploads/`** — deferred on `/out/covers` compatibility and shared-cover
  migration source; not yet safe to remove.
- **R6-T7 device verification** — responsive CSS fixes landed (VoiceModals min-width, manuscript
  workspace grid collapse ≤768px), but need a manual sweep at 1280/768/420px in a real browser.
  In particular: Studio CastPalette at 420px (flex-row with fixed CastPalette width could be
  tight), Voice Lab SamplesSection stacking order at 390px. (MobileNavDrawer's focus-trap/Escape
  gap, previously tracked alongside this, already shipped — see COMPLETED_WORK.md.)
- **R6-T10 dead-code retirement — SUPERVISED FOLLOW-UP.** Remove the legacy ProjectDetail/
  ChapterEditor page chain now that all routes redirect into the book pipeline. Scope (verify
  each is import-dead in `src` first; do WITH the owner / a focused session that can run the full
  suite to confirm):
  - `frontend/src/pages/ProjectDetail/` (`ProjectDetailPage.tsx`, `ProjectViewRoute.tsx`,
    `components/*`) — no live route mounts `ProjectDetailPage` (`App.tsx` only references it in a
    comment).
  - `frontend/src/pages/ChapterEditor/ChapterEditorPage.tsx` + `components/CharacterSidebar.tsx`
    — imported only by `ProjectDetailPage`. KEEP `EditorTabs.tsx` (shared with the live
    `useStudioChapter` hook) and `ScriptView.tsx` (used across Studio). KEEP `NarratorCard.tsx`
    (consumed by `frontend/src/demo`).
  - Delete the 14 coupled test files (`ProjectView*`, `ChapterEditor*`, `EditorTabs
    CharacterSidebar` specs, `ProjectViewTestHelpers`, `ProjectViewRoute` test) per R-D since
    their code is removed.
  - Owner answer 2026-06-14: removal is still needed, but only after confirmed validation, one
    deletion checkpoint at a time. Verify each checkpoint: build + lint + full vitest suite green
    (capped workers, watch memory).
- **Post-release / opportunistic:**
  - Frontend bundle code-splitting follow-up — revisit only if bundle analysis shows a new
    regression.
  - Voice Lab stage caption override — static stages show the shared timeline scene caption;
    `DemoStage` could accept a caption override for non-timeline stages.

## Known Constraints

- **ChapterEditor at 390px (tablet-minimum):** The ChapterEditor layout stacks columns below
  1100px (sidebar moves below content, capped at 40vh). At 390px the editor is functional but
  dense — full usability at that viewport is not a target for the current release. The Library,
  Queue, Settings, and Voices pages are fully functional at 390px. Accepted constraint, documented
  in [07_frontend_themes_and_responsive.md](final_release/07_frontend_themes_and_responsive.md)
  §3.4.
