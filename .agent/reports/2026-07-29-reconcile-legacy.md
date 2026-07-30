# Legacy branch reconciliation — 2026-07-29

Scope: rule on 4 old branches. No PRs/pushes/deletes/merges performed — assessment only.

---

## 1. `bark-and-tortoise-integration` (4 commits, 2026-02-12)

**Claim checked:** "touches v1 module paths that no longer exist."

Files touched: `app/config.py`, `app/engines.py`, `app/jobs.py`, `app/state.py`, `app/tts_inference.py`, `app/web.py`.

Verified on `studio-2.0` HEAD:
```
fatal: path 'app/engines.py' does not exist in 'studio-2.0'   MISSING
fatal: path 'app/jobs.py' does not exist in 'studio-2.0'      MISSING
fatal: path 'app/web.py' does not exist in 'studio-2.0'       MISSING
fatal: path 'app/state.py' does not exist in 'studio-2.0'     MISSING
```
All four core v1 modules this branch patches are gone, replaced by the Studio 2.0 plugin/orchestrator architecture (`tts_engines/`, `app/orchestration/`, `app/db/state.py` facade).

**Is Bark/Tortoise wanted anywhere in current plans?**
```
grep -ril "bark\|tortoise" design-docs/plans/  → only design-docs/plans/reference/site_redesign_rollout/99_progress_log.md
```
That single hit (line 179) reads:
> "R5-T11 intentional deviation — mock shows 3 fake store cards (WhisperTTS/CoquiLocal/**BarkPlugin**) with Install buttons; these are NOT rendered... Fake install buttons on non-functional placeholder cards would violate 'do not build'."

This is an explicit *placeholder* name in a UI mock, not a real feature ask — the plan author deliberately did NOT wire it up. No hit anywhere in `design-docs/plans/active/`. The engine registry (`tts_engines/`) currently ships `tts_xtts`, `tts_voxtral`, `tts_mixed` only — no Bark/Tortoise plugin folder exists or is scaffolded.

**VERDICT: OBSOLETE — DELETE.** The v1 modules it patches (`app/engines.py`, `app/jobs.py`, `app/web.py`, `app/state.py`) are gone under the clean-break directive, and Bark/Tortoise support is not requested by any active or reference plan — the one mention found is a deliberately-unbuilt placeholder. Nothing to salvage: the `app/tts_inference.py` Bark/Tortoise glue code is architecturally incompatible with the current plugin-manifest + HTTP-server engine contract, so even the algorithmic content wouldn't port without a full rewrite anyway.

---

## 2. `professional-voice-production` (13 commits, 2026-02-23/24)

**Claim checked:** "features reimplemented in Studio 2.0."

Commits (`studio-2.0..professional-voice-production`):
```
3237a3c6 Data Model & Segmentation
3e75492b added per voice TTS
a901bd32 optimize TTS
91315524 optimize voice output
bc202f40 script layout for voices
4b914633 added color picker to voices
9daf41bd character color picker
8032b0ae added a performance section
5aefa287 trying to get consecutive text to render together
4225da6c restore preview text
85a8033e fix preview
8506a232 fixed segment voices
3c37b1ec fix linting
```

Files touched (`app/db.py`, `app/engines.py`, `app/models.py`, `app/textops.py`, `app/xtts_inference.py`) — all v1 paths:
```
fatal: path 'app/db.py' does not exist in 'studio-2.0'            MISSING
fatal: path 'app/engines.py' does not exist in 'studio-2.0'       MISSING
fatal: path 'app/models.py' does not exist in 'studio-2.0'        MISSING
fatal: path 'app/textops.py' does not exist in 'studio-2.0'       MISSING
fatal: path 'app/xtts_inference.py' does not exist in 'studio-2.0' MISSING
```

Per-feature check against current tree:
- **Per-voice TTS / engine-per-voice**: `design-docs/specs/system-architecture.md`, `design-docs/specs/voice-bundles.md` document per-voice/per-character engine routing through `VoiceBridge` — this is a first-class, spec'd Studio 2.0 capability (and was independently re-shipped as PR #71 "Release 1.8.0: engine-per-voice support" per `git log`, well before Studio 2.0 even started).
- **Character color picker**: `frontend/src/utils/voiceProfiles.ts` exists and is the current character-color implementation (grep confirms; no `colorPicker`/`characterColor` component elsewhere needed — the utility that assigns/persists colors is present).
- **Performance section**: exists as its own module family today — `app/tts_server/performance_settings.py`, `app/db/state_performance.py`, `app/db/performance.py`, `app/domain/chapters/performance_schema.py` — a much more developed version than the single 2026-02 commit.

**VERDICT: OBSOLETE — DELETE.** Every named feature in the commit subjects (per-voice TTS, color picker, performance section, segment-voice fixes) is present in the current Studio 2.0 tree, built against the current architecture, and the v1 files this branch touches no longer exist. This is superseded-by-reimplementation, not a compatibility gap. No plan references this branch or lists any of its features as outstanding.

---

## 3. `fix-broken-fresh-install` (28 commits, ending "PR feedback", 2026-03-26)

**Claim checked:** "recover_projects_from_disk.py and the fresh-install fix are still needed / not yet landed."

`git log --oneline studio-2.0..fix-broken-fresh-install` shows 28 commits ending in `b149f4a7 PR feedback`, `1f4eb426 fix missing audio directory`, `92b86531 Create recover_projects_from_disk.py`, `d1e8d9da fix book download`, etc.

Direct check — does the recovery script exist on `studio-2.0` today?
```
git cat-file -e studio-2.0:scripts/recover_projects_from_disk.py   → EXISTS
find scripts -iname "*recover*"                                    → scripts/recover_projects_from_disk.py
```
Content-identical check:
```
git diff studio-2.0:scripts/recover_projects_from_disk.py fix-broken-fresh-install:scripts/recover_projects_from_disk.py
→ (empty diff — byte-identical)
```

GitHub history check:
```
gh pr list --state all --search "fresh install"
60  Fix broken fresh install               fix-readme-for-fresh-install   MERGED  2026-03-26
75  Audiobook Studio 1.8.2: Windows Bootstrap and XTTS Reliability Fixes  fix-windows-install-error  MERGED
```
```
git log --all --oneline -- scripts/recover_projects_from_disk.py
0acf99c5 Improve first-run setup, demo experience, and chapter generation for v1.7.0 (#60)
92b86531 Create recover_projects_from_disk.py
```
PR #60 ("Fix broken fresh install", head `fix-readme-for-fresh-install`, MERGED 2026-03-26 — same date, same purpose, a **different** local branch name than `fix-broken-fresh-install`) is the merged twin of this work; its content is on `main`/`studio-2.0` today, byte-for-byte for the one file checked.

Other touched files (`app/api/routers/projects.py`, `app/api/utils.py`) have since diverged structurally (330-line diff on `run.sh`, full rewrite of `app/api/utils.py`'s imports from the old flat-module layout to the current package layout) — evidence the branch predates the Studio 2.0 restructure and its remaining non-script fixes were superseded by that restructure, not merely aged.

`app/config.py` and `app/demo_bundle.py` are both MISSING on `studio-2.0` (confirmed via `git cat-file -e`) — further v1-era paths.

**VERDICT: OBSOLETE — DELETE.** The one item worth salvaging (`scripts/recover_projects_from_disk.py`) already landed via merged PR #60 and is byte-identical on `studio-2.0` today. The remaining fixes target file layouts (`app/api/utils.py`, `run.sh`) that have since been substantially rewritten under Studio 2.0's boot/config restructure — the defects they patched no longer exist in that form. No outstanding gap found.

---

## 4. `studio2/site-redesign` (26 commits, 2026-06-13)

**Claim checked:** "R2 stage of site-redesign — landed elsewhere / superseded / still outstanding?"

`git log --oneline studio-2.0..studio2/site-redesign` shows 26 commits covering R1 (nav rail, shell, T1-T12) and R2 only (book route skeleton, book data provider, topbar identity, rail book block, manuscript table/import/text-panel/focus-mode, casting stage, publish book-info/assemblies/backups) plus a `memory` commit touching the retired `Memory/` dir.

Current tree check — do R1/R2 surfaces exist under their new names?
```
find frontend/src/pages -maxdepth 1 -type d
→ ... Book, Engines, Integrations, VoiceLab, Activity, ProjectLibrary, ...
find frontend/src -iname "*CastingStage*" -o -iname "*BookLayout*" -o -iname "*ManuscriptStage*"
→ frontend/src/pages/Book/BookLayout.tsx
→ frontend/src/pages/Book/stages/ManuscriptStage.tsx
→ frontend/src/pages/Book/stages/CastingStage.tsx
```
All exist, exactly as named in the branch — but built out much further.

**Plan-tree check:** the plan folder itself has already moved to `reference/` (retired location), not `active/`:
```
find design-docs/plans -iname "*site_redesign*" -o -iname "*quiet_studio*"
→ design-docs/plans/reference/quiet_studio_migration
→ design-docs/plans/reference/site_redesign_rollout
```
Reading `design-docs/plans/reference/site_redesign_rollout/99_progress_log.md` (405 lines) shows the rollout went **far past R2** — R1 through R7 all logged as APPROVED/COMPLETE with adversarial reviews, capability-inventory audits (120/120 verified), dark-mode passes, a11y fixes, responsive passes, and an owner-validation checklist (R6/R7, dated 2026-06-13/14). This is the *actual, completed* execution record for the same rollout this branch only carries through R2 — i.e., the branch is an early, partial, now-superseded snapshot of work that continued and finished on a different (squash-merged) path.

**Release-ledger cross-check:**
```
design-docs/plans/active/final_release/21_release_consolidation_ledger.md:85
| W-QS Quiet Studio redesign (token re-skin, forms, status/progress, glass audit) | 2026-06-20, 07-11 (North Star parity) ✓ | ... | Retires: reference/quiet_studio_migration/, reference/site_redesign_rollout/, reference/site_experience_north_star.md (B1 — repoint specs first) | Verify [ ] |
```
The active release plan lists `site_redesign_rollout/` as a **retire-candidate** citing it complete (✓, dated 2026-06-20 and 07-11), pending only a spec-repoint (B1) and a verification checkbox — not pending any code work. `20_stale_docs_retirement.md:68` maps its provenance forward into `specs/{voice-bundles, design-system, site-shell-and-book-pipeline}` and `decisions/ADR-0010`.

The `Memory/session_logs.md` / `Memory/state.json` files this branch touches are confirmed retired per this session's own memory record ("legacy `Memory/` capital-M directory... retired 2026-07-04") — that directory does not exist in the current worktree.

**VERDICT: OBSOLETE — DELETE.** This branch is a stale partial (R1-R2-only) checkpoint of a rollout that continued past it (through R7) on a different route and is already tracked as complete in the active release-consolidation ledger, pending only a documentation repoint that is Astrid's own open task (B1 in doc 21), not a code gap. Nothing here is unshipped.

---

## Still-outstanding-in-a-plan check (all four branches)

**No.** For all four branches, every feature/fix/script the branch introduces either (a) targets v1 module paths that no longer exist under the Studio 2.0 clean break, or (b) has a verified, functionally-equivalent-or-superior counterpart already on `studio-2.0` / already logged as shipped in `design-docs/plans/active/final_release/21_release_consolidation_ledger.md`. Nothing in `design-docs/plans/active/final_release/` (doc 08's execution order or any numbered doc) names a gap that only one of these four branches fills. The one loose thread — `site_redesign_rollout/` and `quiet_studio_migration/` still needing their citing specs repointed and a verification checkbox ticked (ledger row 85, item B1) — is pre-existing documentation debt independent of this branch's deletion; it is not blocked by keeping or deleting `studio2/site-redesign`, since the plan folder itself already sits at `reference/`, not this git branch.

No owner-facing product decision is pending from this audit; all four verdicts rest on static disk/plan evidence, not inference.
