# Reconcile 2026-07-09 parallel batch — 10 abandoned branches

Method: for each commit, read `git show <sha>` in full, then read the CURRENT content of every
touched file on `origin/studio-2.0` via `git show origin/studio-2.0:<path>`, and judge by content
match (studio-2.0 squash-merges, so SHA/subject reachability is useless here — this report never
relies on it). All 10 branches sit on the same already-landed 240-commit trunk; only the one named
commit per branch was assessed.

Overall result: **9 of 10 LANDED**, 1 (**#3**) is a doc-only triage with no code change, whose own
bookkeeping edits were later superseded by the `design-docs/plans/` consolidation (Aug/July
restructure into REMAINING_TASKS.md/COMPLETED_WORK.md/FUTURE_WORK.md) — verdict OBSOLETE, nothing to
land. **All 10 branches are safe to delete** (either landed, or nothing left to land).

---

## 1. `worktree-agent-a442337be601e8060` — a5381475 "Decide: defer generic plugin setup loop"

**Files touched:** `design-docs/plans/TASKS.md`, `design-docs/plans/active/master_agnostic_tasks.md`

**Verdict: OBSOLETE** (decision content never made it into the current source of truth, and the
underlying plans files it edited were later fully rewritten/restructured — not worth re-landing as
a docs PR; the decision itself is still sound and can simply be noted directly against
`REMAINING_TASKS.md` in-line by whoever next touches that item)

**Evidence:**
- Current `design-docs/plans/TASKS.md` on `origin/studio-2.0` is now a thin pointer/shim (post
  plans-consolidation): "This file used to hold the full status checklist; it's now a thin pointer
  ... actual content lives in `REMAINING_TASKS.md`/`COMPLETED_WORK.md`/`FUTURE_WORK.md`." The line
  this commit edited no longer exists in any form.
- Current `design-docs/plans/active/master_agnostic_tasks.md` no longer contains a "generic plugin
  setup loop" section at all — file was restructured; grep for "setup loop" / "DECIDED" / "Phase 12"
  in it returns only a top-of-file "Phases 1–11 and nearly all of Phase 12 ..." pointer.
- Current `design-docs/plans/REMAINING_TASKS.md` **still lists this as an open item**, not yet
  decided in the tracked source of truth:
  > "**Generic plugin setup loop** in `run.sh`/`run.ps1` — implement or defer with rationale
  > (carried over from `road_to_v2.md`, retired 2026-07-18)"
  So the branch's *decision* (defer) never actually got carried into current tracking — the commit's
  literal content is NOT landed.
- The underlying technical analysis is still valid today: `run.sh` still special-cases XTTS's
  separate `~/xtts-env`, and `app/tts_server/server.py` still has the generic
  `POST /engines/{engine_id}/install` endpoint (`install_dependencies`, line 393-394) that the
  analysis cites as already covering the "generic setup loop" ask.
- **Recommendation (cheap, doc-only):** don't resurrect this dead branch's diff (it targets files
  that no longer exist in that shape). Instead, in a future pass over `REMAINING_TASKS.md`, replace
  the "implement or defer with rationale" line with a one-line resolution citing this same
  reasoning: defer until Phase 10 standalone plugin repos. Rough cost: 10 minutes, doc-only, no
  code risk.

---

## 2. `worktree-agent-a67e54d78fed15fd8` — 9243bafd "Add plugin lifecycle section to CONTRIBUTING.md"

**Files touched:** `CONTRIBUTING.md`, `docs/plugin-sdk/plugin-submission-guidelines.md`,
`docs/plugin-sdk/plugin-template/README.md`, `docs/plugin-sdk/plugin-template/plugin/studio/handler.py`

**Verdict: LANDED**

**Evidence:**
- `origin/studio-2.0:CONTRIBUTING.md` contains the full "### Contributing a new TTS engine plugin
  (lifecycle)" section verbatim, including the 6-step list ("Folder structure", "Manifest declares
  the contract, not the app", "Register via manifest, never via engine-ID branches", "Versioned
  contracts are required, not optional", "Test your plugin in isolation", "Submit it").
- The one difference: the branch commit predates the `plugins/` → `tts_engines/` rename, so its
  diff says `plugins/tts_myengine/` — current studio-2.0 has the *same* section but with paths
  already updated to `tts_engines/tts_myengine/` (confirms the content landed and was
  subsequently kept current through the rename, not that it's missing).
- `origin/studio-2.0:docs/plugin-sdk/plugin-submission-guidelines.md` line 30 and 36 contain the
  exact "Versioned manifest" and "Test suite" bullets this commit added (test-suite line updated
  to say `tts_engines/tts_<name>/tests` post-rename).
- `origin/studio-2.0:docs/plugin-sdk/plugin-template/plugin/studio/handler.py` contains the exact
  docstring rewrite this commit made (module docstring "Template studio job handler — illustrates
  the SDK facade, not the wiring", the two numbered caveats about `worker_logic`/legacy dispatch
  signature), again with the `plugins/` → `tts_engines/` path reference updated.
- Branch is safe to delete; nothing to land.

---

## 3. `worktree-agent-a684d90cf44eb5b4d` — 357d9c8e "Triage Vite ws ECONNRESET: confirmed benign"

**Files touched:** `design-docs/plans/TASKS.md`, `design-docs/plans/active/master_agnostic_tasks.md`
(no application code — this commit is a doc-only triage record, as expected)

**Verdict: OBSOLETE — there was never any code to land, and the doc bookkeeping it performed
(marking a plans-checklist line done) has since been superseded**

**Evidence:**
- Diff is 2 files, 3+2 lines — purely marking checklist lines done in the two plans files, no
  application code touched (confirms the triage finding itself: "no code change needed").
- Both files it edited (`TASKS.md`, `master_agnostic_tasks.md`) were later fully restructured (see
  branch #1's evidence) — the specific checklist line this commit ticked off no longer exists in
  either its old or the commit's edited form.
- Grepped current `REMAINING_TASKS.md`, `COMPLETED_WORK.md`, `FUTURE_WORK.md` on `origin/studio-2.0`
  for "econnreset", "websocket.*proxy", "vite.*ws" — **zero matches in any of the three**. The item
  isn't tracked as open OR done anymore; it simply isn't tracked, which is consistent with "no code
  change needed, nothing to track."
- Nothing to land — the triage conclusion (StrictMode double-invoke artifact, harmless, already
  covered by existing reconnect logic in `useWebSocket.ts`/`useQueueSync.ts`) is a standing fact
  about the dev environment, not a deliverable. Safe to delete.

---

## 4. `worktree-agent-a6e1d70cababf50b7` — 190c6708 "Fix Integrations API guide content"

**Files touched:** `design-docs/plans/TASKS.md`, `design-docs/plans/active/master_agnostic_tasks.md`,
`frontend/src/pages/Integrations/components/ApiGuidePanel.tsx`

**Verdict: LANDED**

**Evidence:** `origin/studio-2.0:frontend/src/pages/Integrations/components/ApiGuidePanel.tsx`
contains this commit's corrected copy verbatim:
- Header line: "Studio can act as a local TTS gateway for other applications via the external
  `/api/v1/tts` API."
- "External TTS Gateway" panel: "All external integrations should go through `/api/v1/tts/*`. It is
  disabled by default, guarded by an optional API key, and rate limited. Studio's other `/api/*`
  routes power the built-in web UI only — they are unauthenticated and not a supported external
  integration surface."
- Security note about the disabled-by-default gateway, Bearer key, and the 30 req/min rate limiter —
  present verbatim.
- Endpoint list (`GET /api/v1/tts/engines`, `.../engines/{engine_id}`, `POST /synthesize`,
  `POST /preview`, `GET /jobs/{job_id}`, `GET /jobs/{job_id}/audio`) all present, matching the
  commit's replacement of the old made-up `/api/processing_queue` + WebSocket doc.
- Only cosmetic drift since: inline `style={{...}}` on some elements replaced by a `className`
  (`api-endpoint-grid`, `api-endpoint-chip`) in a later styling pass — the prose/content is
  unchanged. Confirms landed, not merely coincidentally similar.
- Branch safe to delete.

---

## 5. `worktree-agent-a7593f052171e0293` — 4ded8cc3 "Phase 12 cleanup batch"

**Files touched:** `master_agnostic_tasks.md`, `frontend/src/demo/DemoApp.tsx`,
`demoApiShim.ts`, `demoStages.ts`, 4x `stages/*Stage.tsx` + 4 new `*StageDescriptor.tsx` files,
`useDemoTransport.ts`, `theme/tokens.css`, plus test files.

**Verdict: LANDED**

**Evidence (three independent fixes, all confirmed present on `origin/studio-2.0`):**
1. **react-refresh split:** `frontend/src/demo/stages/progressStageDescriptor.tsx` (and the sibling
   `queueStageDescriptor.tsx`/`siteMockupStageDescriptor.tsx`/`voiceLabStageDescriptor.tsx`) all
   exist as separate files today, confirming the descriptor-object extraction landed.
2. **Demo transport nits:** `useDemoTransport.ts` on studio-2.0 contains the exact comment and logic
   this commit added — `restart()` at line 232-233: "Preserve the playing state across a restart —
   restarting mid-playback should keep playing from the top, not silently pause." `play()` at
   lines 201-218 contains the "At the end of a non-looping timeline ... pressing Play there would
   otherwise be a no-op. Restart from the top" logic with the `atNonLoopingEnd` check.
   `demoApiShim.ts` line 16 confirms `warnedRoutes` is a local `const warnedRoutes = new Set<string>()`
   scoped inside the install function (not module-global), matching the fix.
3. **`--z-drawer` token:** `theme/tokens.css` line 51 defines `--z-drawer: 400;` exactly as this
   commit added.
- Branch safe to delete.

---

## 6. `worktree-agent-a7bc57e3a34176985` — f40344f1 "Relocate per-voice plugin settings out of Script Editor popup"

**Files touched:** `TASKS.md`, `master_agnostic_tasks.md`, `VoicesModals.tsx`,
`useVoicesTabState.ts`, `VoicesPage.tsx`, `ScriptEditor.tsx`, `VoiceCatalogCard.tsx`, new
`VoiceSettingsPanel.tsx`, `VoicesTabContent.tsx`, `components/index.ts`, plus tests.

**Verdict: LANDED** (subsequently relocated again by a later, independent redesign task — the
substance of this branch's extraction survives)

**Evidence:**
- `origin/studio-2.0:frontend/src/pages/Voices/components/VoiceSettingsPanel.tsx` exists, and its
  docstring still traces back to this exact fix: "the dedicated home for plugin-defined per-voice
  controls ... Relocated per the Phase 12 backlog note: the settings previously lived inside the
  'Edit Recording Script' popup, which is about test-script text, not per-voice synthesis tuning."
- `ScriptEditor.tsx` on studio-2.0 no longer contains the per-voice plugin settings UI that this
  commit removed (grep for "plugin"/"settings" only turns up unrelated engine-enablement copy).
- `VoiceSettingsPanel` is not orphaned — it's actively imported and rendered by
  `frontend/src/pages/Voices/components/VariantEditor.tsx` (line 429) today. A later task
  (006, "voice-card-consolidation") moved its *entry point* from the catalog card's action menu
  into a "Variants" tab on a consolidated voice detail page (per `VoiceCatalogCard.tsx`'s own
  header comment: "'Voice Settings' (→ Variants tab) were relocated to the consolidated voice
  detail page (task 006, voice-card-consolidation plan)") — but the actual extraction out of
  `ScriptEditor` that this branch performed is still exactly what's live; only the surrounding
  navigation shell moved on top of it.
- Branch safe to delete; nothing further to land.

---

## 7. `worktree-agent-a88edfd34bf926233` — df7c381e "Add focus trap + Escape close to MobileNavDrawer"

**Files touched:** `TASKS.md`, `master_agnostic_tasks.md`, `MobileNavDrawer.tsx`, test file.

**Verdict: LANDED**

**Evidence:** `origin/studio-2.0:frontend/src/app/layout/MobileNavDrawer.tsx` contains, verbatim:
- `import { useFocusTrap } from '@/hooks/useFocusTrap';` (line 6)
- `useFocusTrap(drawerRef, open);` (line 22)
- The `onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}` handler (line 43) on the `<aside>`.
- Branch safe to delete.

---

## 8. `worktree-agent-a8de81377460ee43b` — 9dbe1c76 "Fix auth gap on TTS gateway docs/openapi routes" — **SECURITY FIX, verified first/highest priority**

**Files touched:** `app/api/tts_api.py`, `design-docs/plans/TASKS.md`,
`design-docs/plans/active/final_release/12_security_and_opportunities.md`,
`design-docs/plans/active/master_agnostic_tasks.md`, `design-docs/specs/README.md`,
`design-docs/specs/security.md`, `tests/api/test_api_tts_api.py`.

**Verdict: LANDED — confirmed fixed on studio-2.0 today**

**Evidence:**
- `origin/studio-2.0:app/api/tts_api.py`: the `FastAPI(...)` sub-app constructor has
  `docs_url=None`, `openapi_url=None`, `redoc_url=None` (lines 38-40) — the auto-generated
  dependency-bypassing routes are disabled, exactly as this commit's fix does. The NOTE comment
  above it (lines 26-33) explaining *why* (`add_route()` bypasses FastAPI DI, so
  `dependencies=[...]` on the constructor doesn't protect `/docs`/`/openapi`) is present verbatim.
- Replacement routes `get_openapi_schema()` (line 317) and `get_docs()` (line 322, using
  `root_path` + `get_swagger_ui_html`) are present on the same `router` as every other endpoint,
  so they inherit `verify_api_key` + `rate_limit` via the router's shared dependencies — matching
  the fix's intent exactly.
- `origin/studio-2.0:tests/api/test_api_tts_api.py` contains `test_docs_requires_auth` (line 258)
  and `test_openapi_requires_auth` (line 264) — the regression tests this commit added are present
  and would catch a reintroduction of the gap.
- This was flagged as highest priority; confirmed it does not need re-landing — the vulnerability
  this branch fixed is already closed on the current studio-2.0 tip. No action needed beyond
  deleting the now-redundant branch.

---

## 9. `worktree-agent-ab0e56f677e8136ac` — ac3495d4 "Resolve axe baseline rollout decision, expand a11y scan to 3 pages"

**Files touched:** `TASKS.md`, `final_release/08_release_sequence.md`, `master_agnostic_tasks.md`,
`frontend/tests/e2e/a11y/axe.spec.ts`.

**Verdict: LANDED**

**Evidence:**
- `origin/studio-2.0:frontend/tests/e2e/a11y/axe.spec.ts` (258 lines total) contains
  `setupVoicesPage` (line 82) and `setupChapterWorkspacePage` (line 104), plus the three-page
  scan structure (home, "voices page (empty state)" at line 195, Chapter Workspace at line 204) —
  confirming the expansion from 1 page to 3 pages × 2 themes landed exactly as described.
- The spec-header comment block recording the "Owner decision 2026-07-09 ... resolved as CI-now,
  non-blocking" and the known-violations list (color-contrast, aria-required-parent, select-name on
  ScriptView) is present in the current file header.
- `origin/studio-2.0:design-docs/plans/active/final_release/08_release_sequence.md` line 50-62
  contains the "Axe baseline rollout decision (resolved 2026-07-09)" note and the concrete Stage 5
  gate criterion this commit added: "'axe clean' for this gate means: the known-violations list in
  the spec header is empty."
- Branch safe to delete; nothing further to land.

---

## 10. `worktree-agent-ad8e0d6eed7f8327f` — 5ff2bcce "Fix chapter editor's redundant full-chapter-list refetch"

**Files touched:** `app/db/chapters.py`, `TASKS.md`, `master_agnostic_tasks.md`,
`frontend/src/hooks/chapter/useChapterLoader.ts`, several chapter-editor test files,
`tests/db/test_chapters_crud.py`.

**Verdict: LANDED** (subsequently refactored on top, but the fix's substance is intact)

**Evidence:**
- `origin/studio-2.0:app/db/chapters.py`'s `get_chapter()` (now at a slightly different location,
  refactored to also take an optional `project_id` and to share a `_segment_counts_sql()` helper
  with `list_chapters`/`get_chapter_segments_counts`) still carries this exact commit's comment
  verbatim: "Mirrors list_chapters' segment-count subqueries so single-chapter callers (e.g. the
  chapter editor loader) don't need to re-fetch the whole project chapter list just to get these
  counts." — and the SQL still joins in `total_segments_count`/`done_segments_count` subqueries on
  a single-row `WHERE c.id = ?` query, which is the actual performance fix.
- `origin/studio-2.0:frontend/src/api/index.ts` line 166 has
  `fetchChapter: async (chapterId: string, projectId?: string): Promise<Chapter> => {...}` — the
  single-chapter endpoint this commit switched `useChapterLoader` to call exists and is used
  (`useChapterLoader.ts` line 68: `const target = await api.fetchChapter(chapterId, projectId);`),
  replacing the old `fetchChapters(projectId).find(...)` pattern the commit removed.
- Branch safe to delete; nothing further to land.

---

## Summary table

| # | Branch | Verdict |
|---|--------|---------|
| 1 | a442337be601e8060 | OBSOLETE — decision content superseded by plans-consolidation; underlying REMAINING_TASKS.md item still open but this diff can't apply cleanly |
| 2 | a67e54d78fed15fd8 | LANDED |
| 3 | a684d90cf44eb5b4d | OBSOLETE — doc-only triage, no code change, its own bookkeeping superseded |
| 4 | a6e1d70cababf50b7 | LANDED |
| 5 | a7593f052171e0293 | LANDED |
| 6 | a7bc57e3a34176985 | LANDED |
| 7 | a88edfd34bf926233 | LANDED |
| 8 | a8de81377460ee43b | LANDED (security fix confirmed closed) |
| 9 | ab0e56f677e8136ac | LANDED |
| 10 | ad8e0d6eed7f8327f | LANDED |

**All 10 branches are safe to delete.** No PRs needed. The only residual, cheap, optional follow-up
is updating one line in `design-docs/plans/REMAINING_TASKS.md` to reflect branch #1's already-made
defer decision on the generic plugin setup loop — a 10-minute doc edit, not a code change, and not
done here per the task's "assess and recommend only" instruction.
