# Roadmap

## Workloads

**Workload A — housekeeping (no functional dependency, do first, low risk)**
- Task 001 — Rename the demo's colliding `DirectorsConsole` export.

**Workload B — mount the (still-stub) console (unblocks live comparison during ports)**
- Task 002 — Mount `DirectorsConsole` into `BookLayout.tsx`'s `ChapterWorkspace`, replacing the Studio/Review toggle. At this point Cast/Booth/Revise still render "coming soon" stubs — acceptable, temporary regression, immediately fixed by Workload C. Do this early so each subsequent port (003-006) can be live-verified against the mounted console directly, instead of verified in isolation and integrated at the end.

**Workload C — fill in the four tools (independent of each other; do NOT parallelize — see note)**
- Task 003 — `CastTool`: port `StudioStage.tsx`'s paint UI.
- Task 004 — `BoothTool`: port `ReviewStage.tsx` + its sub-files.
- Task 005 — `ReviseTool`: new in-place paragraph edit (quality-sensitive).
- Task 006 — `WriteTool`: new folder wrapping `ChapterTextPanel`/`useChapterText`; register it in `registry.ts`.

**Note on parallelizing Workload C:** Tasks 003-006 touch different tool folders (no file overlap) so they are conceptually independent — but 003 and 004 both read from `useBookDataContext()`/route params in the same way and both are large, close reads of `StudioStage.tsx`/`ReviewStage.tsx`; running them in parallel is fine. Task 006 is small and safe to parallelize with either. **Task 005 should run after at least one of 003/004 lands**, purely so its implementer has a real, already-ported tool body to match code style/conventions against (not a hard dependency, a quality one — note it in the task but don't hard-block).

**Workload D — cleanup**
- Task 007 — Delete `StudioStage.tsx`/`ReviewStage.tsx`(+folder)/the old toggle; full green gate; live verification of all four modes.

## Dependency graph

```
001 (demo rename) ──────────────┐
                                 │ (no real dependency, just do first)
002 (mount console) ────────────┼──> 003 (Cast) ──┐
                                 ├──> 004 (Booth) ─┼──> 007 (cleanup + green gate)
                                 ├──> 005 (Revise) ┤     (needs ALL of 003-006 done)
                                 └──> 006 (Write)  ┘
```

## Milestones

1. After 001+002: console is mounted, rail visible, all four tools show stubs, zero regression to anything else in `BookLayout`.
2. After 003+004: Cast and Booth are at functional parity with the old `StudioStage`/`ReviewStage` — the two highest-value, lowest-new-risk ports are done.
3. After 005+006: all four tools are real. This is the point to do a full manual walkthrough before cleanup.
4. After 007: dead code removed, full green gate, plan complete → archive.
