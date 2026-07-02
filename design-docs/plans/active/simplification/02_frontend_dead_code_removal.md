# Phase 1 — Frontend dead-code removal

> Map: [00_overview.md](00_overview.md). The headline item is ~4,700 LOC of unreachable page code.
> The **hard rule** here is *extract before delete*: live code imports symbols out of the dead tree,
> so those move to real homes first (separate commit), then the dead tree goes.

> ⚠️ **GATED BY OWNER REVIEW (2026-06-19).** An investigation found the redesign **lost real
> functionality** that lives in these "dead" trees, and the owner confirmed most of it should be
> **restored**, not deleted. The trees are a **harvest source**. Do **NOT** delete `ProjectDetail`/
> `ChapterEditor` (DC-1b) until the matching restore tasks in
> [07_restore_lost_functionality.md](07_restore_lost_functionality.md) (RST-1…RST-8, WIRE-1/3) have
> pulled the wanted features into the live Book pipeline. This doc now covers only (a) the
> extraction prerequisites, (b) the genuinely-safe deletions, and (c) the final husk-deletion once
> restoration is done.

> **⚠ AUDIT CORRECTION (2026-07-01):** The core premise that the `ProjectDetail/` and
> `ChapterEditor/` trees are safely deletable is **wrong as of today**. Route-level reachability
> is via the documented dead stub (`app/routes/index.tsx` `createStudioRoutes()` — itself the DC-2
> target; `App.tsx` `/chapter/:chapterId` still resolves to `<Navigate>` redirects), **but
> components inside the trees are imported by live code and actively developed** (touched
> 2026-06-28). `ProjectDetail/` = 1,735 LOC (matches plan); `ChapterEditor/` = 3,745 LOC (plan
> undercounted at ~2,983). DC-1a's 4 shared symbols now have MORE live importers than listed
> (`TempCharacterModal.tsx`, `CastPalette.tsx`, `useChapterText.ts` added since). Before DC-1b:
> re-verify the harvest gate (07_restore_lost_functionality completion + RST-8) — the trees have
> moved FURTHER from deletable, not closer. DC-2 stub routes and DC-3b targets
> (`LiveOutputTab.tsx`, `ChapterEditorRoute.tsx`) still exist untouched.

---

## Background (verified)

`App.tsx` routes the old URLs **away**:
- `/project/:projectId` → `ProjectRedirectRoute` → `<Navigate>` to the book stage.
- `/chapter/:id` → `ChapterRedirectRoute` → `<Navigate>`.
- No route element renders `ProjectDetailPage` or `ChapterEditorPage`. The only production mention
  of those names is a **comment** in `App.tsx:154`.

So the **page trees** are unreachable. But four symbols defined *inside* them are still imported by
**live** code (verified):

| Dead-tree symbol | Defined in | Live importer(s) |
|------------------|-----------|------------------|
| `VoiceProfileSelect` | `pages/ChapterEditor/components/VoiceProfileSelect.tsx` | `components/CharactersTab.tsx:7`, `pages/Book/stages/CastingStage.tsx:3` |
| `useChapterStatus` | `pages/ChapterEditor/components/ChapterHeader.tsx:16` | `pages/Book/studio/useStudioChapter.ts:7` |
| `ResyncPreviewData` (type) | `pages/ChapterEditor/components/ResyncPreviewModal.tsx` | `pages/Book/studio/useStudioChapter.ts:14` |
| `ChapterEditorTab` (type) | `pages/ChapterEditor/components/EditorTabs.tsx` | `pages/Book/studio/useStudioChapter.ts:15` |

This coupling is exactly why a prior session (R6-T10) deferred deletion to a "supervised session."

---

## DC-1a — Extract shared symbols to real homes (do first)

**Goal:** sever live→dead coupling so the trees become fully orphaned.

**Moves:**
1. `VoiceProfileSelect.tsx` → `frontend/src/components/forms/VoiceProfileSelect.tsx` (it's a ~74-line
   `<select>` wrapper — genuinely shared UI). Update the two live importers + the dead-tree importers
   (the latter will be deleted anyway, but keep the build green between commits).
2. `useChapterStatus` → `frontend/src/hooks/useChapterStatus.ts` (~190-line hook). Note
   `segmentProgressSelection.ts:3` already says *"Extracted from ChapterHeader.tsx / useChapterStatus"* —
   finish that extraction. Update `useStudioChapter.ts`.
3. `ResyncPreviewData` → `frontend/src/types/` (or co-locate with the live resync flow). The
   *modal component* `ResyncPreviewModal` is used only by the dead tree — check whether the live
   Studio resync flow needs a modal; if it has its own, only the **type** moves.
4. `ChapterEditorTab` (a string-union type) → `frontend/src/types/` or inline into
   `useStudioChapter.ts` if it's only used there now.

**Verify:** `npm -C frontend run test -- --run` + `build` green **with the dead tree still present**
(this commit changes imports only). This isolates "extraction" from "deletion" for clean bisecting.
**Effort:** M · **Risk:** med (touches a live hook). **Spec:** update `code-organization.md` source
refs if it pins these paths.

---

## DC-1b — Delete the dead `ProjectDetail` + `ChapterEditor` trees

**Preconditions (BOTH required):**
1. **Restoration complete** — all owner-confirmed RST-*/WIRE-* tasks in
   [07_restore_lost_functionality.md](07_restore_lost_functionality.md) that *harvest* from these
   trees have landed (per-row progress bar, chapter-play-via-global-player, audio download, the
   destructive-action guards, in-Studio source edit, default-voice picker, engine banner, and — most
   carefully — RST-8's segment-aware-player logic port). Until then these files are the source of
   truth for that logic.
2. DC-1a merged; `grep -rn "ProjectDetailPage\|ChapterEditorPage" frontend/src` shows only the
   `App.tsx:154` comment; no live file imports anything under `pages/ChapterEditor/` or
   `pages/ProjectDetail/`.

**Delete (verified members):**
- `pages/ProjectDetail/` — `ProjectDetailPage.tsx` + `components/` (ChapterList, ProjectHeader,
  ProjectCard, ProjectBreadcrumbs, AssemblyPanel, AssemblyProgress, ProjectModals, ProjectSubnav).
  ~1,732 LOC / 11 files.
- `pages/ChapterEditor/` — `ChapterEditorPage.tsx`, `ChapterHeader.tsx`, `ScriptView.tsx`,
  `ScriptView.css` (701), `CharacterSidebar.tsx`, `ResyncPreviewModal.tsx`, `EditTab.tsx`,
  `PlaybackControls.tsx`, `QueueNotice.tsx`, `LiveOutputTab.tsx`, `ScriptViewFallback.tsx`,
  `EditorTabs.tsx`, `scriptViewProgress.ts`, `VoiceProfileSelect.tsx` (now moved). ~2,983 LOC.
- The **31 test files** under `frontend/tests/` that target these pages — they test dead code, so
  they go with it. Identify them: `grep -rln "ChapterEditor\|ProjectDetail" frontend/tests`.
  Cross-check none of them also assert live behavior; if one does, split that assertion into a
  test of the live module before deleting.

**Steps:** delete in one commit (or two: src then tests), then run the **full** suite. Manually
smoke `/library`, book stages, casting, characters — the surfaces that absorbed these features.

**Verify:** `npm -C frontend run test -- --run` + `build` green; manual smoke; `App.tsx:154`
comment updated/removed so it no longer references a deleted page.
**Effort:** L · **Risk:** med. **Spec:** `code-organization.md` layout table (remove the two page
dirs); `wiki/Changelog.md`.

> ⚠️ Run the vitest suite **targeted + `--maxWorkers=1`** and reap runaways — this repo's vitest
> suite is memory-heavy (see project memory `test-run-memory-safety`).

---

## DC-2 — Delete stub route infrastructure

**Why:** never imported / never executed null-stubs left from an earlier routing scheme.

- Delete `frontend/src/app/routes/index.tsx` (`createStudioRoutes()` returns `[]`; imported nowhere).
- Delete `frontend/src/pages/ProjectLibrary/ProjectLibraryRoute.tsx` (`createProjectLibraryRoute()`
  → null; only `routes/index.tsx` imported it).
- Delete `frontend/src/pages/VoiceModules/VoiceModulesRoute.tsx` + `pages/VoiceModules/index.ts`.
- In `QueueRoute.tsx` and `ProjectViewRoute.tsx`, remove **only** the dead `createX()` null-stub
  exports — the real `QueueRoute` / `ProjectViewRoute` components in those files are **live** (used by
  `App.tsx`) and must stay.

**Verify:** `grep -rn "from.*app/routes\|createStudioRoutes\|createProjectLibraryRoute\|createVoiceModulesRoute" frontend/src` → empty; build + tests green.
**Effort:** S · **Risk:** low. **Spec:** none.

---

## DC-3 — Dead components: RESOLVED by owner review (do NOT delete VoiceDropzone/SearchableSelect)

Owner confirmed (2026-06-19) that the two "unused" form components were **meant to be wired in**, not
deleted:
- `VoiceDropzone.tsx` → **wire into voice creation** (see WIRE-1 in doc 07). Keep.
- `SearchableSelect.tsx` → **replace plain `<select>`s** (see WIRE-3 in doc 07). Keep.

Their test files stay too. This task is therefore **removed** from the delete set.

## DC-3b — Safe deletions (owner-confirmed not wanted / inert)

These have no restoration claim and are genuinely safe to delete:
- `frontend/src/pages/ChapterEditor/components/LiveOutputTab.tsx` — owner did **not** want an
  in-editor live log; the standalone `/event-stream` page is sufficient. One-line re-export, never
  wired even in the old editor. Delete. (Goes with the ChapterEditor tree in DC-1b anyway, but is
  safe to drop independently.)
- `frontend/src/pages/ChapterEditor/ChapterEditorRoute.tsx` — `createChapterEditorRoute()` returns
  null; never imported; scaffolding for an architecture that the Book pipeline replaced. Delete.
- The obsolete `export {}` stubs and `app/routes/index.tsx` `createX()` null-stubs (covered by QW-5
  and DC-2). Delete.

**Verify:** `grep -rn "LiveOutputTab\|ChapterEditorRoute\|createChapterEditorRoute" frontend/src` →
only the files themselves; build + tests green.
**Effort:** S · **Risk:** low. **Spec:** none.

---

### Phase 1 done-check
Full frontend suite green (memory-safe run), `build` green, manual smoke of `/library` + book
stages + casting + characters. `code-organization.md` layout updated. Dated `wiki/Changelog.md`
entry noting ~7.5k LOC removed (4,700 page trees + tests + stubs).
