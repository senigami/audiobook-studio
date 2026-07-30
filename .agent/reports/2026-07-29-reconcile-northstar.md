# North Star Screen Parity — 7-branch reconciliation
Assessed 2026-07-29 against `origin/studio-2.0` @ `70f6d964` (docs: add Adversarial-Execution Gate to the code-review checklist (#173)).

Governing plan (`design-docs/plans/active/north_star_screen_parity/`) does **not exist on studio-2.0** —
it was deleted in the 2026-07-17 plans-cleanup pass (`design-docs/plans/README.md:100`, cleanup-pass note)
as "confirmed complete with no spec citing its path." The plan content quoted below was recovered from
branch `worktree-agent-abdb864ccddb97223` (task 010's branch), the only one of the seven that still
carries the full plan tree.

**Method:** for each branch, `git show <sha>` for the branch's own diff, then read the current content of
each touched file on `origin/studio-2.0`, and judge by content (never by SHA/subject reachability — this
repo squash-merges, so no branch commit ever appears verbatim in studio-2.0 history even when it fully
landed).

---

## Branch 1 — `worktree-agent-a1bcac34ee9e502e0` (task 008: chapter dropdown status orb)

**Commit:** `50666106` (wip, 2026-07-29 preservation commit; underlying work dated 2026-07-11 per task ref)
**Files:** `frontend/src/pages/Book/BookLayout.tsx`, `frontend/src/pages/Book/components/ChapterWorkspaceHeader.tsx`, new test `frontend/tests/unit/pages/Book/ChapterWorkspaceHeaderStatusOrb.test.tsx`, code-map queue entry.

**Verdict: LANDED.** Safe to delete.

Evidence — branch adds to `ChapterDropdown` in `ChapterWorkspaceHeader.tsx`:
```
+            <StatusOrb
+              chap={ch}
+              activeJob={activeJob}
+              queuePending={queuePending}
+              doneSegments={ch.done_segments_count}
+              totalSegments={ch.total_segments_count}
+              size={16}
+            />
```
`origin/studio-2.0:frontend/src/pages/Book/components/ChapterWorkspaceHeader.tsx` (current) contains the
identical block inside its chapter-dropdown row renderer, plus the same `pickChapterJob`/`pickRelevantJob`
helper, the same `jobs?: Record<string, Job>` prop threaded from `BookLayout.tsx`'s `ChapterWorkspace`
(`const { chapters, jobs } = useBookDataContext();` → `<ChapterWorkspaceHeader ... jobs={jobs} />`) — an
exact content match to the branch's diff. Task 008's acceptance criteria (StatusOrb per row, no duplicate
data fetch, reuses existing `jobs` context) are fully met on studio-2.0 today.

No PR-description draft needed (nothing to land).

---

## Branch 2 — `worktree-agent-a7183d5186e631cc5` (t003: library card Open + hover-play)

**Commit:** `2ef16947` (wip, 2026-07-29 preservation; underlying work 2026-07-11)
**Files:** `frontend/src/pages/ProjectDetail/components/ProjectCard.tsx`, new test `ProjectCard.test.tsx`.

**Verdict: LANDED** (in an evolved form — the underlying feature was subsequently generalized, not just
copy-pasted). Safe to delete.

Evidence — branch's `ActionMenu` call:
```
-  <ActionMenu onDelete={...} />
+  <ActionMenu items={[
+      { label: 'Open', icon: FolderOpen, onClick: () => onClick(project.id) },
+      { label: 'Delete', icon: Trash2, onClick: () => onDelete(...), isDestructive: true }
+  ]} />
```
`origin/studio-2.0:frontend/src/pages/ProjectDetail/components/ProjectCard.tsx` (current) line ~191:
```
<ActionMenu items={[
    { label: 'Open', ... },
    { label: 'Delete', icon: Trash2, onClick: () => onDelete(project.id, project.name), isDestructive: true }
]} />
```
"Open" + "Delete" both present, "Details" button unchanged — matches task 003's acceptance criteria (INV-1
respected).

Hover-play: the branch fetched per-card `Audiobook[]` via a new `api.fetchProjectAudiobooks` call and
`loadAndPlay`/`playerBus`. The **shipped** version on studio-2.0 uses a different, more capable mechanism —
`buildChapterQueue` / `playBookContinuous` from `@/store/bookContinuousPlayback`, `usePlayerBus` with
`scope === 'chapter'` — i.e. continuous chapter-queue playback rather than "play the one assembled m4b."
This is a superset of the branch's intent (play button that works even before a full-book assembly exists),
so the branch's specific hover-play implementation is superseded, not merely duplicated. Functionally, the
task's acceptance criterion ("hover-reveal play button that actually plays audio, disabled/no-fake-affordance
when nothing exists yet") is met by the shipped version's `canPlay` gate.

---

## Branch 3 — `worktree-agent-a866b2525b8a1e5ab` (north-star-002: WelcomePage CTA placement)

**Commit:** `2df832a5` (wip, 2026-07-29 preservation; underlying work 2026-07-11)
**Files:** `frontend/src/pages/Welcome/WelcomePage.tsx` + `.css`, new test.

**Verdict: LANDED** (and further improved). Safe to delete.

Branch moves the CTA block above "Getting started" and turns the secondary CTA into a `Btn`-family
element. `origin/studio-2.0:frontend/src/pages/Welcome/WelcomePage.tsx` today:
```
        {/* ── CTAs ── */}
        <div className="welcome-ctas">
          <button onClick={() => navigate('/library')} className="welcome-cta-primary">
...
          <a
            href={HANDBOOK_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="welcome-cta-secondary"
          >
            View Documentation
          </a>
        </div>

        {/* ── Getting started ── */}
```
CTA block sits immediately before "Getting started," exactly as the task demanded. The secondary CTA went
further than the branch (which only changed its element styling, keeping `href="#"`) — studio-2.0's version
wires a real `HANDBOOK_BASE` link, fixing the dead-link issue the task explicitly marked out-of-scope. Task
002's acceptance criteria are all satisfied by the current code.

---

## Branch 4 — `worktree-agent-ab31504fe072b7b48` (task 005: partial 3-state Library status pill)

**Commits:** `c1cc81c0` (wip, adds `coverSize.ts` + `ProjectCard.test.tsx`) and `a7321484` ("North Star task
005: partial 3-state Library project status pill" — committed for real at the time, 2026-07-11, not wip).

**Verdict: LANDED — both commits, in full.** Safe to delete. This is the one the task said to scrutinize for
"partial"; the partial scope it shipped is exactly and only what's on studio-2.0 today (no silent gap).

Evidence, backend (`app/db/projects.py`):
```
# Task 005 (north_star_screen_parity) — per-project workflow status, derived
# from chapter-lifecycle aggregates already in the DB (no schema change, no
# per-project round-trip, no filesystem scan). Owner-approved partial scope: ...
def _derive_project_status(chapter_count, chapters_with_segments_count, chapters_rendered_count) -> str: ...
def list_projects():
    ...
    row["status"] = _derive_project_status(...)
```
present verbatim on `origin/studio-2.0:app/db/projects.py`.

Frontend, all present on studio-2.0:
- `frontend/src/components/ui/ProjectStatusPill.tsx` + its test — exists.
- `frontend/src/pages/ProjectLibrary/lib/coverSize.ts` — exists (this is the file the *wip* commit
  `c1cc81c0` added; it landed as part of task 005/004's actual shipped work, confirmed byte-identical
  in shape to the branch's version).
- `ProjectCard.tsx:267`: `{project.status && <ProjectStatusPill status={project.status} />}`
- `ProjectListView.tsx`: adds a `<th>Status</th>` column and renders `<ProjectStatusPill status={project.status} />`.
- `LibraryControls.tsx`: wires the "In Progress" quick-filter chip to a real `statusFilter` (`drafting`/`casting`),
  exactly as task 005's commit message describes.

The scope stayed honestly partial exactly as committed — "Studio" (actively rendering) and "Published"
(assembled) states were never added on studio-2.0 either, matching the owner-approved 3-state cut. No gap
between what shipped and what's on the branch.

Note: `c1cc81c0`'s `ProjectCard.test.tsx` (adding Open/Delete + hover-play tests) duplicates content also
present on branch 2 — both branches independently carry a version of that test file; only branch 2's is the
"origin" of that content per the plan's task numbering (003), but it doesn't matter for reconciliation since
both are superseded/landed.

---

## Branch 5 — `worktree-agent-ab600178c9cc22310` (library tasks 004-007)

**Commit:** `e2d6dd60` (wip, 2026-07-29 preservation; underlying work 2026-07-11)
**Files:** `ProjectLibraryPage.tsx`, `LibraryControls.tsx`, new test, `lib/coverSize.ts`.

**Verdict: LANDED** (and iterated further post-2026-07-11). Safe to delete.

- Cover-size slider (`COVER_SIZES`, `coverSizeIdx` state, grid `gridTemplateColumns` driven by it) — present
  verbatim on `origin/studio-2.0:ProjectLibraryPage.tsx` (`coverSizeIdx`, `COVER_SIZES`, `getStoredCoverSizeIdx`
  all found at the same call sites).
- "All Books" section header + quick-filter chips — present in `LibraryControls.tsx` on studio-2.0
  ("All Books" label, "A–Z" chip, "In Progress" chip — the last one wired to task 005's real status filter,
  confirming the two tasks landed and were reconciled together).
- One deliberate later change not in the branch: the "Recent" chip was **removed** on studio-2.0
  (`LibraryControls.tsx` comment: "The 'Recent' chip was removed (2026-07-14 HIG review, item 7): it set the
  same...'Recently Updated' entry...expressed the same intent twice") — a legitimate post-landing HIG
  refinement, not evidence against landing.
- Task 007 (dead unreachable empty-state branch): branch removes the `projects.length === 0 ? ... : <>...</>`
  wrapper. `origin/studio-2.0:ProjectLibraryPage.tsx` has no `no-results`/`project.length === 0` branch left —
  confirms this landed too.

---

## Branch 6 — `worktree-agent-abdb864ccddb97223` (task 010: simplify Contents tab to a pure chapter board)

**Commit:** `4426af88` — committed for real on 2026-07-11 (not a wip-preservation commit; this one was never
at risk of loss, unlike the other six).

**Verdict: LANDED.** Safe to delete.

Branch removes `ChapterTextPanel`, `focusMode` state/toggle, and the split table+editor workspace layout from
`ContentsStage.tsx`, leaving a pure `ChapterTable` board. `origin/studio-2.0:frontend/src/pages/Book/stages/ContentsStage.tsx`
has zero references to `ChapterTextPanel` or `focusMode` — matches the simplified target exactly. Per the
commit's own message, Gate 1 (Write-mode already covers per-chapter editing) was confirmed before removal
(INV-1 respected), and Gate 2 (book-wide bookmark panel) was deliberately left unimplemented and escalated —
confirmed still absent on studio-2.0 (no `GlobalBookmarkPanel`-equivalent exists in the Book tabs today), so
nothing was silently dropped beyond what the commit already flagged.

---

## Branch 7 — `worktree-agent-afa12cd2e390aa4e6` (plan-doc-only edits to 00-overview.md / 005-library-project-status.md)

**Commit:** `05104df7` (wip, 2026-07-29 preservation; underlying work 2026-07-11)
**Files:** plan docs only, no application code.

**Verdict: OBSOLETE.** Superseded by branch 4's actual shipped implementation.

This branch records the *intermediate* research conclusion for task 005: "PARTIALLY derivable — STOPPED
without implementing UI," recommending the owner choose between shipping a partial 3-state pill or holding
the whole feature. Branch 4's `a7321484` commit (same day, later) supersedes this exact document: its
message opens "Owner-approved partial scope: ship Drafting/Casting/Rendered only" — i.e. the owner made
the call this branch was surfacing, and a later session (or the same one) implemented it. Since the plan
folder these docs belong to no longer exists anywhere on studio-2.0 (deleted 2026-07-17), and the decision
it records was already acted on and shipped, there is nothing left to land — the branch is a stale
snapshot of a question that has since been answered and closed by branch 4's landed code. No action needed.

---

## Plan-status discrepancies (explicit finding)

**`design-docs/plans/README.md` (2026-07-17 cleanup-pass note) claims `north_star_screen_parity/` was**
**"confirmed complete with no spec citing its path," and deleted it outright.** That claim was **false at
the time it was made**, in the sense that matters to the owner: as of 2026-07-17, five of these seven
branches' work (tasks 002, 003, 004-007, 008) was sitting **uncommitted, in abandoned worktrees**, not on
studio-2.0 — it only became a real commit on any branch on 2026-07-29, when it was rescued as `wip:`
preservation commits. Two tasks (005's real implementation and 010) genuinely had landed by 2026-07-11
under Steven's own authorship, so the plan folder's underlying *work* did eventually reach studio-2.0 (all
seven branches assessed above land content that now exists on studio-2.0) — but the folder was deleted
five days *before* that fact was verifiable, based on a "no spec citing its path" heuristic that never
checked branch/worktree state. The plan's own task-file annotations (e.g. task 005's checklist items
changed to `[x]`) were the only record that the work had actually happened, and that record was deleted
along with the folder.

**Net effect:** every task this plan covered did land, but the 2026-07-17 cleanup pass's completion claim
was unverified when made, and got lucky — it happened to delete a folder describing already-real work,
not (as originally feared) a folder describing only-ever-abandoned work. This is exactly the failure mode
named in the task brief: a plan claiming "done" from a snapshot in time, not from checking the git/worktree
reality behind it. **Recommendation:** no folder needs restoring (all its numbered tasks 002/003/004-007/008/010
are content-verified LANDED above), but the cleanup-pass methodology ("confirmed complete" without checking
worktree/branch state) should be tightened for the *next* deletion — cite this incident in the archivist's
plan-retirement checklist as a concrete "verify against git reality, not just spec citations" case. This is
a process gap, not a code gap; cheap to fix (one checklist line), and I'm flagging it rather than fixing it
myself since it's the archivist's (Astrid's) domain, not mine.

No task's REMAINING_TASKS.md/COMPLETED_WORK.md entry was found for any of these seven tasks specifically
(the north_star_screen_parity plan was deleted wholesale rather than having its items folded into those
files individually) — so there is no live "claims complete but isn't" entry to correct there today; the
discrepancy is entirely in the historical README.md cleanup-pass note above.

## Recommendation summary

All seven branches are safe to delete — six are content-verified LANDED (identical or superseded-by-better
implementations already on studio-2.0), and the seventh (branch 7) is an obsolete intermediate research note
whose question was already answered and shipped by branch 4. No PRs to open, no code to write. The only
outstanding action is the process note above for Astrid/archivist about tightening the plan-retirement
completeness check.
