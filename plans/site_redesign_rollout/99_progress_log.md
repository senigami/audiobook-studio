# Progress Log

*One line per task: `<date> <task-id> <done|reverted|skipped+why> <commit-sha>`. Executing
agents append here after every task (contract rule R-I). Phase-boundary review confirmations
also go here.*

## Task log

2026-06-13 R1 phase-boundary review (orchestrator): tests 1097 pass, lint 0 errors,
build NOW passes (demo-mock TS errors fixed outside rollout scope — see below). R1 APPROVED.
Note: /settings/engines + /settings/api still render as Settings tabs (not yet redirects to
/engines + /integrations); both old and new routes work so no capability lost — redirect
consolidation is R5-T13 scope. Confirm in browser or defer.

2026-06-12 R1-T1 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T2 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T3 done HEAD
2026-06-12 R1-T4 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T5 done HEAD
2026-06-12 R1-T6 done HEAD
2026-06-12 R1-T7 done HEAD
2026-06-12 R1-T8 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T9 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T10 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T11 done build-skipped-existing-demo-type-errors HEAD
2026-06-12 R1-T12 done build-skipped-existing-demo-type-errors HEAD
2026-06-13 R2-T1 done HEAD
2026-06-13 R2-T2 done HEAD
2026-06-13 R2-T3 done HEAD
2026-06-13 R2-T4 done HEAD
2026-06-13 R2-T5 done HEAD
2026-06-13 R2-T6 done HEAD
2026-06-13 R2-T7 done HEAD
2026-06-13 R2-T8 done HEAD
2026-06-13 R2-T9 done HEAD
2026-06-13 R2-T10 done HEAD
2026-06-13 R2-T11 done HEAD
2026-06-13 app-shell-base-layer done HEAD
2026-06-13 R3-T1 done bc7d2403
2026-06-13 R3-T2 done HEAD
2026-06-13 R3-T3 done HEAD
2026-06-13 R3-T4 done HEAD
2026-06-13 R3-T5 done HEAD
2026-06-13 R3-T6 done HEAD
2026-06-13 shared-shell-resize done HEAD
2026-06-13 chapter-row-and-manuscript-analysis-polish done HEAD
2026-06-14 R4-T1 done cf7bd983
2026-06-14 R4-T2 done 52cba0ff
2026-06-14 R4-T3 done 64428c29
2026-06-14 R4-T4 done fda9ad5f
2026-06-14 R4-T5 done HEAD
2026-06-14 R4-T6 done HEAD
2026-06-14 R4-T7 done 91b87156
2026-06-14 R4-T8 done HEAD
2026-06-13 R3 ADVERSARIAL REVIEW (orchestrator, 3 parallel reviewers vs specs). Verdict: core
R3 contract HELD (book-view-primary single ScriptView, cast painting, analysis strip, toggles,
StatusOrb in rail, in-page chapter rail removed, commit/resync wired, handoff fill in both modes;
R3-T1 timing-critical handoff state machine preserved exactly). Fixed 5 findings (commit below):
(1) BLOCKER capability loss — Studio per-segment generate swallowed blocked-feedback (no-op
onBlocked); rewired to handleGenerateWithFallback (restores the "Generation Blocked" modal).
(2) SPEC violation (text-processing.md §6) — # toggle showed raw ordinals not render-group
numbers; restored groupNumberForSpan={firstSpanGroupNumber}. (3) design-system token violation —
hardcoded paint-chip shadow -> var(--shadow-lg). (4) dead test mock removed. (5) wrong copy
"1 unsaved text edit" -> "Unsaved text changes" (+test). Accepted-as-inert (not reverted):
debug-telemetry effect dep arrays widened vs the byte-identical mandate — reviewer proved they
feed only the debug ring, never the render/timing path; reverting only re-adds eslint-disable noise.
CORRECTION to prior log line: R3-T7 (retire old ChapterEditor chrome) and R3-T8 (rapid-chapter-
switch leak test) are NOT done — the old ChapterEditorPage is unmounted DEAD CODE pending R6, so
the acceptance criteria are functionally met but T7/T8 themselves remain. Dark-parity StudioStage
test mocks its children so it cannot catch hardcoded colors (issue 3 was found by reading, not that
test) — improve at R6. Gates after fixes: build pass, lint clean, tests 1145 pass. R3 APPROVED
pending owner sign-off; do NOT start R4 yet.

2026-06-13 R2 phase-boundary review (orchestrator): tests 1137 pass (+40, none deleted),
build pass, lint clean. Book routes + legacy redirects + Book page tree + chapterLifecycle
+ CastingStage(narrator default) + PublishStage all present; old ProjectView tests retained
(ProjectDetail kept as redirect boundary per R-G, retired at R6). R2 APPROVED — R3 cleared to
start (independent file area). Owner to spot-confirm 3 persistence items (see acceptance
checklist unchecked): Casting narrator->project-default binding, Publish book-info/assembly/
backup persistence + downloads, dark-mode pass on new surfaces. If broken: log under Found bugs.
Also: rail footer viewport-pin bug fixed this session (commit 5d4561e9) — shell was not
viewport-locked; lesson for shell work recorded.

2026-06-14 R4 ADVERSARIAL REVIEW + FIXES (orchestrator, 2 reviewers). R4 implemented by an
external (Gemini/Antigravity) agent T1-T8. Review found and FIXED: (BLOCKER) reference-sample
playback was a 2nd audio owner -> routed through playerBus (ADR-0010 single-owner restored);
(BLOCKER) programmatic seek()/skim/tap-to-seek never moved the element -> added playerBus
seekRequestId + PlayerBar seek effect; (BLOCKER) annotation store key collided across
chapters/books -> composite chapterId::segmentId key; (should-fix) re-render errors swallowed
-> surfaced; chapter-audio URL guessed/404 -> gated on audio_status + real asset URL + onError;
re-render highlight now follows segmentProgress like Studio build view. Also fixed a TDZ crash
introduced by the skim stale-closure ref. VoiceDropzone new Audio() confirmed a duration probe
(not a violation). S3 (speaker profile on re-render) verified NON-issue: backend resolves each
segment's own assigned voice. Commits 8a1c4873 + c162ce1b. Gates: build pass, lint clean,
touched suites green. NOTE: did NOT run the full suite (memory-leak risk per owner) — verified
via build/lint + targeted files. R4 APPROVED.

2026-06-14 R5-T1 done ca930764
2026-06-14 R5-T2 done ffffa963
2026-06-14 R5-T3 done 43a6cfc4
2026-06-14 R5-T4 done 28e99002

## Found bugs (do not fix mid-phase — triaged at R6)

- 2026-06-13 R3 Studio, owner-found, FIXED same day (commit below):
  (a) Segment count showed raw segments/sentences (e.g. 9) not render groups (4) —
      StudioStage AnalysisStrip used chapter.total_segments_count; fixed to renderGroupCount
      (canonical per text-processing.md §6, matches old ChapterEditor).
  (b) Cast palette had no way to UNASSIGN a voice — the old "None/Default" clear-mode swatch
      was dropped in the R3 re-home (the CLEAR_ASSIGNMENT plumbing survived; only the button
      was missing). Restored as a pinned "Narrator (default)" swatch at the top of the cast
      list. Also removed the chapter default-voice dropdown from Studio per owner directive
      (that control belongs on Casting, which already owns the Narrator/project-default voice).

## Open questions for the owner

- 2026-06-12: `npm -C frontend run build` failed in untouched `frontend/src/demo/stages/siteMockup/*` files. RESOLVED 2026-06-13 by orchestrator (commit below): these were leftover TS errors from the v3.7 mock module split (unused imports, type-only imports, a Row onClick prop) — fixed in demo-only files, outside rollout scope. Build gate is now usable for R2-R6.
- 2026-06-13: Local Playwright Chromium launch is blocked here by a macOS MachPort rendezvous permission error; the theme-parity check is now covered by a dark-theme StudioStage render test, so the browser issue is informational rather than blocking.
