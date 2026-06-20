# Phase 1A — Restore functionality lost/orphaned in the redesign (owner-confirmed)

> Map: [00_overview.md](00_overview.md). This doc supersedes the naive "delete the dead trees"
> framing in [02_frontend_dead_code_removal.md](02_frontend_dead_code_removal.md). An owner-reviewed
> investigation (2026-06-19) found the redesign **lost real functionality** and left several
> **built-but-never-wired** features. The dead `ProjectDetail`/`ChapterEditor` trees are now a
> **harvest source**, not garbage: extract the wanted features, restore them into the live Book
> pipeline, and only then delete the husks. Every item below was confirmed against live code and
> **confirmed wanted by the owner.**

**Hard rule:** no deletion of the old trees until the matching RST-* task has restored the feature.
See [02](02_frontend_dead_code_removal.md) for the gated deletion list.

---

## A. Restore into the chapter list (ChapterTable)

### RST-1 — Per-row live render progress bar
**What:** while a chapter renders, its `ChapterTable` row shows a live `PredictiveProgressBar`
(ETA, phase, render-group checkpoints), as the old `ChapterList.tsx:236` did. Today the row shows
only a `StatusOrb`.
**How:** add `PredictiveProgressBar` to `ChapterTable.tsx`, fed by the live queue/progress store for
that chapter's job. Reuse the existing component — no new progress logic.
**Files:** `frontend/src/pages/Book/components/ChapterTable.tsx`; reference `ProjectDetail/components/ChapterList.tsx:234-267`.
**Effort:** M · **Risk:** low.

### RST-2 — Play chapter from the list → drive the GLOBAL player
**Owner note (binding):** *"we now have a global player, but we should still be able to trigger the
chapter play from the list, just not hosting the bar itself."*
**What:** a play/pause affordance on each `ChapterTable` row that calls the global `playerBus`
(`loadAndPlay`/`play`/`pause`) with the chapter's audio. **Do NOT** re-host a player bar in the list
(the old `ChapterList.tsx:269-313` hosted its own — that part is intentionally gone).
**How:** row button → `playerBus.loadAndPlay({ scope:'chapter', audioUrl, ... })`; reflect
playing/paused state by reading `playerBus` (scope==='chapter' && audioUrl match), mirroring how the
old list derived `isChapterPlaying`.
**Files:** `frontend/src/pages/Book/components/ChapterTable.tsx`, `frontend/src/store/playerBus.ts`.
**Effort:** S–M · **Risk:** low.

### RST-3 — Direct audio download from the list row
**What:** "Download Audio (WAV/MP3)" item in the `ChapterTable` row action menu (old
`ChapterList.tsx:340`). Today download exists only via Studio export.
**How:** add the menu item; reuse the same download endpoint `StudioHeaderActions.tsx:27-38` uses.
**Files:** `frontend/src/pages/Book/components/ChapterTable.tsx`.
**Effort:** S · **Risk:** low.

### RST-4 — Restore destructive-action guards (data safety) ⚠️
**What:** two confirmations that were dropped:
- **Rebuild-audio confirm** — queuing an already-fully-rendered chapter currently overwrites the
  render with **no warning** (`ManuscriptStage` calls `handleQueueChapter` directly). Restore the
  `isFullyRendered` check → destructive `ConfirmModal` (old `ProjectDetailPage.tsx:491`).
- **Large-chapter warning** — warn before queuing a chapter with `char_count > 50000` (old
  `ProjectDetailPage.tsx:492`).
- Also confirm **delete-chapter** and **reset-audio** from `ChapterTable` show a destructive confirm
  (the old code wrapped both in `ConfirmModal`; `ManuscriptStage` currently has none — verify and add).
**Files:** `frontend/src/pages/Book/stages/ManuscriptStage.tsx`, `frontend/src/pages/Book/components/ChapterTable.tsx`, reuse `components/overlays/ConfirmModal`.
**Effort:** M · **Risk:** low — but highest user-value (prevents silent data loss). Recommend doing first.

---

## B. Restore into the Studio stage

### RST-5 — In-Studio source-text quick edit
**What:** edit chapter text from within Studio. Today `StudioStage` hardcodes
`canCommitSourceText = false` (StudioStage.tsx:347) and users must leave to the Manuscript stage.
**How:** surface a quick-edit panel/affordance in Studio that reuses `ChapterTextPanel`'s
lock/edit/resync flow (already built); wire `canCommitSourceText` true with the existing resync
preview path (which IS live — `ResyncPreviewModal` is reachable in both StudioStage and ChapterTextPanel).
**Files:** `frontend/src/pages/Book/stages/StudioStage.tsx`, `frontend/src/pages/Book/components/ChapterTextPanel.tsx`.
**Effort:** M · **Risk:** med (text edit + resync interplay) — characterize with tests first.

### RST-6 — Chapter-level default-voice picker in Studio
**What:** the chapter default voice (`localVoice` in `useStudioChapter`) is currently invisible in
the live UI; the old `CharacterSidebar` had a "Default Voice" `VoiceProfileSelect`. Surface it in
Studio (CastPalette or StudioStage header).
**Files:** `frontend/src/pages/Book/studio/CastPalette.tsx` or `stages/StudioStage.tsx`; reuse the now-shared `VoiceProfileSelect` (see DC-1a in doc 02).
**Effort:** S–M · **Risk:** low.

### RST-7 — Engine-unavailable warning banner in Studio
**What:** show the disabled-engine warning in `StudioStage` (today only Manuscript/Casting show it),
so a user in Studio sees why a render would fail before clicking Queue.
**How:** reuse the same `projectVoiceStatus.enabled/message` alert already rendered in
`ManuscriptStage:72-80` / `CastingStage:22-29`.
**Files:** `frontend/src/pages/Book/stages/StudioStage.tsx`.
**Effort:** S · **Risk:** low.

### RST-8 — Make the universal player SEGMENT-AWARE (preserve segment logic) ⚠️
**Owner note (binding):** *"the playback is in the universal player and contains the skim etc.
however that player does not currently address segments and is holding the entire chapter. we need
to know how to keep track of segments, so be careful removing this if there is any logic we might
need."*
**What:** the old `PlaybackControls` transport bar UI is superseded by the global player, **but** the
**segment-tracking logic is not** — `useStudioChapter` still exports `playbackQueue`,
`playbackBlockStartIds`, `currentPlaybackBlockIndex`, `activePlaybackLabel`, `playSegment`,
`startSkim`/`stopSkim`, etc. The universal player currently treats a chapter as one opaque blob.
**How:**
1. **Preserve** the segment-playback logic in `useStudioChapter` — do NOT delete it during the
   `useStudioChapter` split (LF-1) or the ChapterEditor deletion (DC-1b). Inventory exactly which
   exports drive segment-awareness before touching anything.
2. Port that logic so the **global player** can map playback position → active segment and support
   block (segment) navigation — i.e. teach `playerBus` a segment model, fed by the chapter's segment
   timing.
3. Only after segment-awareness lives in the global player may the old `PlaybackControls.tsx` be
   deleted.
**Files:** `frontend/src/store/playerBus.ts`, `frontend/src/pages/Book/studio/useStudioChapter.ts`, reference `ProjectDetail`/`ChapterEditor/components/PlaybackControls.tsx`.
**Effort:** L · **Risk:** med-high — this is the most delicate item; segment timing + player sync.
Treat as its own mini-project; characterize current behavior with tests before moving logic.

---

## C. Wire in built-but-never-connected features

### WIRE-1 — VoiceDropzone → voice creation
**What:** the `NewVoiceModal` asks name+engine only; `VoiceDropzone` (sample upload with 3–15s
duration validation) was built and tested but never mounted. Owner confirms it was meant to be live.
**How:** mount `VoiceDropzone` in `NewVoiceModal` (`pages/Voices/components/VoiceModals.tsx`) so users
supply samples at creation; ensure the create flow accepts the sample files. Cross-check against
`SampleManager` (post-creation upload) to avoid duplicate/duration-validation drift — ideally share
the duration-validation logic.
**Files:** `frontend/src/components/forms/VoiceDropzone.tsx`, `frontend/src/pages/Voices/components/VoiceModals.tsx`, `pages/Voices/components/SampleManager.tsx`.
**Effort:** M · **Risk:** med (file upload + creation API). **Removes** VoiceDropzone from doc 02's delete list.

### WIRE-2 — VoiceModules → a live page
**What:** `VoiceModules` (per-engine settings + diagnostics) returns `null` and its route is never
mounted. Owner confirms it was meant to be live. Engines page covers health but not schema-guided
per-engine settings.
**How:** decide placement (recommend a tab on `/engines` or `/settings/voice-modules`), then build
the surface against the live engine/plugin APIs (schema-driven settings already exist for plugins).
This is the largest "wire-in" — effectively finishing an unbuilt feature, so scope it as its own
plan if it grows.
**Files:** `frontend/src/pages/VoiceModules/`, `frontend/src/app/App.tsx` (route), engines API.
**Effort:** L · **Risk:** med. **Removes** VoiceModules from doc 02's delete list. *Open question:
confirm desired placement (Engines tab vs Settings) with owner before building.*

### WIRE-3 — SearchableSelect → replace plain selects
**What:** the searchable, keyboard-nav speaker dropdown (with create-new) was built/tested but unused;
live speaker-assignment surfaces use plain `<select>`. Owner confirms it was meant to be used.
**How:** swap `SearchableSelect` into the speaker-assignment surfaces (e.g. `MoveVariantModal`,
character/voice pickers) where a searchable dropdown improves UX. Verify keyboard a11y.
**Files:** `frontend/src/components/forms/SearchableSelect.tsx` + the select call-sites.
**Effort:** M · **Risk:** low. **Removes** SearchableSelect from doc 02's delete list.

---

## Sequencing
1. **RST-4 first** (data-safety guards — silent overwrite is the worst current regression).
2. RST-1/2/3 (chapter-list affordances — small, high visible value).
3. RST-5/6/7 (Studio restores).
4. RST-8 (segment-aware player — the careful one; its own mini-project).
5. WIRE-1/3 (bounded), WIRE-2 (scope separately; confirm placement first).
6. **Only after** the relevant RST/WIRE tasks land, return to [02](02_frontend_dead_code_removal.md)
   DC-1b to delete the now-truly-dead husks.

Each task: behavior added → relevant tests + **owner visual verification** (styling/UX can't be
caught by unit tests). Specs to touch: `site-shell-and-book-pipeline.md` (Studio/Manuscript/Publish
capabilities), `audio-player.md` (segment-aware player, RST-8), `voice-bundles.md` (voice creation
with samples, WIRE-1).
