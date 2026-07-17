# 04 — Roadmap (ordered, self-contained tasks)

Each task is independently verifiable. TDD per repo standard
(`.agent/rules/verification.md`, testing-standards R1–R4): failing test first,
confirm red, implement, confirm green. Revert-check every bug-fix/behavior test.

Order: backend contract → generation → serving → portability/restore → frontend.
Tasks 1–6 (backend) can land before any frontend work; Task 1 gates all others.

---

## Task 1 — Pin the chapter-WAV finalization site(s) and the group-ordering source
**(gates everything; do this first)** — **DONE, see `01-findings.md`**

> **Resolution summary (supersedes the bullets below where they conflict):**
> the hook point is **not** inside `_persist_mixed_chapter_output` or its
> three plugin callers. It's `TaskOrchestrator._emit_chapter_peaks_sidecar`'s
> sibling: add `self._emit_chapter_timing_sidecar(context)` right after
> `self._emit_chapter_peaks_sidecar(context)` at
> `app/orchestration/scheduler/orchestrator.py:273` — a single, core,
> engine-agnostic hook already proven to fire for all three finalization
> paths. Group ordering is reconstructed fresh at hook time via
> `build_chunk_groups(get_chapter_segments(chapter_id),
> context.payload["voice_profile_id"])`, keyed by each group's leader segment
> id (`group["segments"][0]["id"]`), resolving
> `chapter_dir/"segments"/f"{leader_id}.wav"`. `audio_generated_at` is read
> back from `get_chapter(chapter_id)`, not recomputed. No plugin code changes
> at all. Full detail and evidence in `01-findings.md`.

- Confirm the finalization funnel Fable identified: sequential rendering via
  `handle_mixed_job` → `_persist_mixed_chapter_output`
  (`tts_engines/tts_mixed/handler.py:~457-590`), parallel-render `stitch_fn`
  (`app/api/routers/generation_shared.py:288-306`), and crash-recovery
  `_stitch_recovered_chapter` (`app/orchestration/scheduler/orchestrator.py:574-612`)
  — verify these three genuinely funnel through one shared finalization point
  (not three independent call sites to hook separately), and pin the exact
  function/line. **Do not re-anchor on `AssemblyTask`/`stitch_segments` in
  `app/orchestration/tasks/assembly.py`** — confirmed to have no chapter-stitch
  caller (it's the M4B book-assembly path, submitted only with
  `is_audiobook=True` from `projects_assembly.py:254`).
- Confirm whether a core (non-plugin) "chapter WAV finalized" helper already
  exists that `_persist_mixed_chapter_output` (a plugin file,
  `tts_engines/tts_mixed/handler.py`) delegates into — timing generation
  should hook there, not be called from plugin code directly (boundary rule,
  `modular_architecture.md`). If no such helper exists, this task proposes
  introducing one (used by Task 4).
- Determine the **authoritative ordered list of chunk-group WAV paths** the
  stitcher actually concatenates, and how each maps back to its member
  `chapter_segments.id`s. Prefer driving off the stitcher's own ordered
  path list (not a fresh DB query) so timing and audio can never disagree.
- Identify the **global player bus** (`frontend/src/store/playerBus.ts`,
  driven by `app/layout/PlayerBar.tsx`) fields for scope/audio-URL gating
  (confirm exact names) and its `seek(seconds)` signature. Confirm whether the
  Book tab already sets bus scope to this chapter when its player is active.
  Confirm no fullscreen helper exists elsewhere worth reusing (Fable confirmed
  none does — this is a check for accuracy, not a search that's expected to
  find one).
- **Acceptance:** a short written finding in this folder (`01-findings.md`)
  naming: the confirmed shared funnel (file:line), the core-vs-plugin hook
  point, the authoritative group-ordering source, the player-bus field names +
  seek signature, and confirmation no fullscreen helper exists. No code yet.

## Task 2 — Timing contract model + validator (backend) — **DONE**

> `app/domain/chapters/timing.py` (`ChapterGroupTiming` model + `validate_timing_sidecar`).

- Implement `ChapterGroupTiming` typed model + `validate_timing_sidecar` in
  `app/domain/chapters/` per §01 (strict model, explicit validation, version +
  `schema` + `audio_generated_at` checks), mirroring `performance_schema.py`.
- **Acceptance / tests:** valid payload parses; wrong `version` rejected; wrong
  `schema` rejected; non-tiling ranges (gap/overlap) rejected; empty `groups`
  handled. All unit-level, no mocks of the unit under test.

## Task 3 — Timing generator (backend) — **DONE**

> `app/domain/chapters/timing_generator.py` (`build_chapter_timing`, WAV-header
> duration reads, drift reconciliation, atomic sidecar write).

- Implement `build_chapter_timing(project_id, chapter_id, chapter_wav_path, group_paths)`
  per §01/§02: order-agreeing group selection, WAV-header duration reads,
  ms-int accumulation, chapter-duration reconciliation with tolerance +
  last-group snap + drift logging, atomic write of `<stem>.timing.json`,
  `audio_generated_at` stamped from the chapter's own field.
- **Acceptance / tests:** with fixture group WAVs of **independently-known**
  durations (not re-derived from the function's own math — avoid the
  re-implements-the-unit anti-pattern), the sidecar tiles gaplessly and
  `end_ms` == chapter duration; a deliberately mismatched chapter duration
  triggers the snap + a logged warning; **a mixed-sample-rate fixture set
  triggers the hard-ceiling failure path** (Fable H2 — this is the test that
  proves the concat-exactness assumption is actually guarded, not just hoped
  for); groups with no rendered text get no entry; generator exceptions never
  propagate to the caller.

## Task 4 — Wire generation into chapter-WAV finalization — **DONE**

> `TaskOrchestrator._emit_chapter_timing_sidecar` (`app/orchestration/scheduler/orchestrator.py`),
> called right after `_emit_chapter_peaks_sidecar`. See queue entry
> `docs/code-map/queue/2026-07-17-synced-reader-task04-timing-sidecar-hook.json`.

- Add `TaskOrchestrator._emit_chapter_timing_sidecar(self, context: TaskContext) -> None`
  in `app/orchestration/scheduler/orchestrator.py`, mirroring
  `_emit_chapter_peaks_sidecar`'s guard/try/except shape (same scope guard:
  `task_type == "synthesis"`, `payload.scope == "chapter"`, `.wav` output;
  swallow all exceptions, log on failure, never block/fail the render). Call
  it right after `self._emit_chapter_peaks_sidecar(context)` at line 273.
  Inside it: rebuild the group list per Task 1's resolution, call
  `build_chapter_timing(...)` (Task 3), done. **No changes to
  `tts_engines/tts_mixed/handler.py`, `generation_shared.py`, or
  `_stitch_recovered_chapter`.**
- **Acceptance / tests:** a test that invokes the completed-branch of
  `submit()` (or directly calls `_emit_chapter_timing_sidecar` with a
  synthetic completed `TaskContext`) against fixture chapter data produces a
  valid sidecar next to the chapter WAV; re-invocation overwrites it; a
  generation failure (e.g. missing group WAV) leaves the hook swallowing the
  exception with the render still reported "completed." Revert-check: without
  the new call, no sidecar appears.

## Task 5 — Serving route — **DONE**

> `GET /api/projects/{project_id}/chapters/{chapter_id}/timing`
> (`app/api/routers/chapters_assets.py`). See queue entry
> `docs/code-map/queue/2026-07-17-synced-reader-task05-timing-route.json`.

- Add `GET …/chapters/{chapter_id}/timing` mirroring the peaks route, with the
  same containment helpers; 404 on missing file, version mismatch, **or
  `audio_generated_at` mismatch against the live chapter record** (staleness
  binding, Fable H3) — no lazy recompute.
- **Acceptance / tests:** route returns a valid sidecar and 404s in each of the
  three cases above; path traversal rejected (CodeQL-shape preserved).

## Task 6 — Backup/export portability + restore (owner-approved scope addition) — **DONE**

> `bundle_version` on `ProjectBackupBundleModel` + backup-archive `timing_path`
> (`app/domain/projects/models.py`, `app/api/routers/projects_helpers.py`) and
> `POST /projects/{project_id}/backups/{filename}/restore`
> (`app/api/routers/projects_backups.py`). See queue entries
> `docs/code-map/queue/2026-07-17-synced-reader-task06a-backup-bundle-versioning.json`
> and `docs/code-map/queue/2026-07-17-synced-reader-task06b-backup-restore-endpoint.json`.

- **Add a `bundle_version` field** to `ProjectBackupBundleModel` /
  `ProjectExportManifestModel` (`app/domain/projects/models.py:58-80`) — Fable
  confirmed **no version field exists today**, so this is adding one, not
  bumping one. Validated at load, changelog row per versioned-contracts.
- Include `<stem>.timing.json` in `_create_backup_archive` wherever chapter
  audio is added, **using the same sanitized-stem arc naming as the WAV**
  (`stem_name = Path(text_filename).stem` at `projects_helpers.py:~293` — the
  sidecar must be written under that same stem, not the on-disk WAV's own
  name). Add `timing_path` to the chapter_map entry.
- **Build the missing backup-import/restore endpoint** (Fable confirmed none
  exists — create/list/download/delete only). Scope minimally: given a backup
  archive, restore chapter text + chapter WAV + paired `.timing.json` (when
  present) into the project's chapter audio directory. Full project
  reconstruction (characters/speakers/queue state) is out of scope unless
  trivially available from what's already read.
- Confirm orphan-segment GC (`app/db/segments.py:453-490`) does not sweep
  `*.timing.json` (Fable M4: already confirmed safe by inspection — this is a
  regression-guarding test, not new GC logic).
- **Acceptance / tests:** a backup that includes chapter audio contains the
  correctly-named sidecar; restoring that backup writes a working chapter WAV
  + sidecar even when the archive contains **no segment WAVs** (the owner's
  core portability requirement — this is the one that must actually pass,
  not just be asserted); GC test proves the sidecar survives segment-WAV
  cleanup.

## Task 7 — Frontend sync engine — **DONE**

> `frontend/src/hooks/useChapterTiming.ts` + `useReaderSync.ts`. See queue
> entry `docs/code-map/queue/2026-07-17-synced-reader-task07-frontend-sync-engine.json`.

- `useChapterTiming(chapterId)` (fetch + cache + 404→null) and
  `useReaderSync(timing, playerBus)` (scope/audioUrl-gated, binary-search
  active group + intra-group %), per §03. Contract-typed, invalidated on
  re-render.
- **Acceptance / tests (vitest fake timers, no real websocket involved so no
  R3 contract-frame requirement here):** given a fixed timing object and a
  moving bus position, `activeGroup` and `groupProgress` are correct at
  boundaries (start, mid, exact `end_ms` handoff, past end); scope/audioUrl
  mismatch correctly yields an idle state instead of tracking unrelated
  playback; 404 → null → "unavailable" path exercised.

## Task 8 — ReaderView + ReaderContainer (three display states) — **DONE**

> `frontend/src/components/reader/{ReaderView,ReaderContainer,ReaderPage}.tsx`,
> `frontend/src/hooks/useFullscreen.ts`. See queue entry
> `docs/code-map/queue/2026-07-17-synced-reader-task08-reader-view-container.json`.

- Build the player-piano `ReaderView` (upper-third focal block, fade in/out,
  progress-driven position, reduced-motion fallback, "unavailable" state) and
  the `ReaderContainer` with embedded / expanded-full-browser / OS-fullscreen
  states + controls, per §03. The fullscreen escalation is **net-new code**
  (no existing helper to reuse, per Task 1/Fable) — budget accordingly.
- **Acceptance / tests:** state-transition and reduced-motion-fallback logic
  covered with vitest fake timers (not "verify in browser" alone — Fable
  flagged the original draft's all-manual acceptance here); then confirm
  visually in the browser preview: renders the active group and advances with
  the bus in all three states; expand and fullscreen controls transition
  correctly; Esc exits OS fullscreen; no manual scroll; focus management on
  state change.

## Task 9 — Entry points + bidirectional seek — **DONE**

> Standalone reader route + Book-tab embed/link wired under
> `frontend/src/app/` and `frontend/src/pages/Book/`. See queue entry
> `docs/code-map/queue/2026-07-17-synced-reader-task09-entry-points-seek.json`.

- Add the standalone reader route (`frontend/src/app/`) and a Book-tab
  link/button + the embedded card (`frontend/src/pages/Book/`) — all on the
  Book tab, nothing in the chapter editor. Wire the Book tab's group detail/list
  clicks to `playerBus.seek(group.start_ms / 1000)` (seconds — reader follows
  automatically via the bus-is-source-of-truth invariant).
- **Acceptance:** clicking a group in the detail view seeks audio and the
  reader jumps to match; navigating to the reader route works; embedded →
  expand → fullscreen chain works from the Book page. Browser-verified.

## Task 10 — (DEFERRED / not in scope) Booth follow-along real timing

- **Not part of this plan.** Owner decision: the chapter editor / Booth keeps
  its existing estimate-based highlight as-is. Recorded only as a possible
  small future follow-up (reuse `useChapterTiming` in `useBoothPlayback.ts`).
  Skip unless the owner opts in later.

## Task 11 — Docs / changelog / wiki — **DONE**

> Spec entry: `design-docs/specs/data-model.md` bumped to 1.12.0 (new §
> "Chapter timing sidecar" + changelog row covering the schema, the `/timing`
> route, and `bundle_version` + restore). Wiki: dated entry added to
> `wiki/Changelog.md` (2026-07-17). User guide: skipped — `docs/user-guide/`
> has no existing Book-tab/playback page to extend (only `voice-tags-icons.md`
> exists today), so no natural home was force-fitted. Code-map: queue entries
> for Tasks 4/5/6a/6b/7/8/9 confirmed present and well-formed; Tasks 2/3
> (`app/domain/chapters/timing.py`, `timing_generator.py`) have **no** queue
> entry of their own (flagged for the next consolidation/update-mode pass —
> those two new files are absent from `docs/code-map/shards/files.app-domain.json`
> today).

- Spec entry for the timing sidecar + the new bundle-version field under
  `design-docs/specs/` (bump `spec_version`, changelog row); a dated
  `wiki/Changelog.md` entry; user-facing note on the reader in the user guide
  if warranted; code-map changelog-queue entry for all mapped-code changes.

---

## Cross-cutting invariants (hold across all tasks)

- **Bus position is the single source of truth** for audio, reader, and detail
  highlight — never a second clock. Reader must gate on bus scope/audioUrl
  matching this chapter, never assume the bus is always about this chapter.
- **No estimation in the sidecar** — measured durations only, at group
  granularity. When no sidecar exists, the reader shows "unavailable," it does
  not invent a second estimate.
- **Timing and audio derive from the same ordered group list** (Task 1) —
  never independently re-derived.
- **Sidecar is durable + portable**, not a cache — survives segment-WAV loss,
  proven by an actual restore test (Task 6), not just an inclusion test.
- **Versioned contract**, validated at load (including staleness via
  `audio_generated_at`), changelogged.
- No engine-ID branching in core (route by manifest/contract, per
  `modular_architecture.md`); no import-time side effects; core sidecar
  generation is called from core code, not directly from plugin code.
