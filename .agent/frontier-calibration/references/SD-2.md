# SD-2 — Gold reference: CLAUDE.md orchestration-task inventory vs. actual `app/orchestration/tasks/`

## Question restated

CLAUDE.md's Architecture section (CLAUDE.md:131) lists the orchestration task modules as
`synthesis, api_synthesis, assembly, bake, export, sample_build, sample_test`. The actual
`app/orchestration/tasks/` directory contains `api_synthesis.py, assembly.py, base.py,
sample_build.py, sample_test.py, segment_synthesis.py, synthesis.py` — no `bake.py`, no
`export.py`, plus an undocumented `segment_synthesis.py`. Separately,
`design-docs/plans/REMAINING_TASKS.md:53` still tracks a `mixed.py` → `composite.py` rename
decision, but no `mixed.py` exists in `tasks/`. Reconcile: renamed/moved vs. stale doc entry
vs. genuinely missing.

## What was examined

- CLAUDE.md:131 — the task-module bullet ("one module per task type: synthesis,
  api_synthesis, assembly, bake, export, sample_build, sample_test").
  `git log -L 131,131:CLAUDE.md` → the list was written in commit `fdf0b04f`
  (2026-06-05, "Add CLAUDE.md documenting Studio 2.0 architecture", PR #119).
- Directory listing of `app/orchestration/tasks/` (confirmed the seven files above).
- `git log --all -- app/orchestration/tasks/{bake,export,mixed,composite}.py`:
  - `bake.py` and `export.py` **did exist** — introduced with the orchestration
    foundations (`4db34328` PR #101 / `d20806a5`), and **deleted 2026-07-16** in
    `f0abe35e` ("Delete redundant Export/BakeTask; fix doubled .m4b.m4b M4B filename",
    landed on studio-2.0 via `85252cd0`, PR #129). The commit message records they were
    *unwired dead code* — no route, no UI, absent from the orchestrator reconstruction
    table — redundant with shipped paths.
  - `mixed.py` / `composite.py`: **zero history**. Neither file ever existed anywhere in
    the repo's git history under `tasks/`.
- Where bake/export actually execute today:
  - **Bake** is not a task type; it is a **flag on synthesis**. `is_bake` parameter on
    `app/orchestration/tasks/synthesis.py:157` (stored :178, serialized :254, restored
    :306, propagated :344,:422 and into fan-out children per :386). Routes:
    `POST /generation/bake/{chapter_id}` at
    `app/api/routers/generation_chapters.py:231-232` (`api_bake_chapter`), submitting
    with `is_bake=True` (:291, :333); enqueue path sets `is_bake=has_bakeable_segments`
    (:156, :197). Engine capability gate `supports_bake_rendering` from
    `app/engines/behavior.py` (import at generation_chapters.py:25; bake forced onto the
    `mixed` engine when unsupported, :280).
  - **Export** splits into two shipped, wired paths (both named in `f0abe35e`'s message,
    verified in current code):
    1. M4B audiobook export = `AssemblyTask(is_audiobook=True)` —
       `app/orchestration/tasks/assembly.py:19` (class), :31/:73/:140 (is_audiobook
       branches); submitted from `app/api/routers/projects_assembly.py:258`.
    2. Chapter WAV→MP3 export = synchronous route, not a task:
       `POST /chapters/{chapter_id}/export-audio` at
       `app/api/routers/chapters_assets.py:66-67` → `export_chapter_audio()` in
       `app/domain/chapters/assets.py:10`. (Also `/export-sample` :269 and
       `/export-video` :336, likewise route-level.)
- `segment_synthesis.py`: first added in `b87e1890` (Phase 12.5, PR #126) — the
  per-segment fan-out child of `SynthesisTask` (synthesis.py:386 documents the fan-out
  relationship). Post-dates CLAUDE.md's 2026-06-05 inventory, which was never updated.
- The mixed→composite paper trail:
  `design-docs/plans/active/final_release/06_code_organization_cleanup.md:181-187` (§3.6)
  already ran this to ground on 2026-06-10: **no `mixed.py` ever existed**; the rename
  target in `master_agnostic_tasks.md:48` / `phase_12_polish_and_cleanup.md:63` /
  doc 01 §P-3 (`01_discrepancies_and_corrections.md:130-137`) points at a file that was
  never there. Doc 06 flags the likely origin as a misnamed reference to the mixed-engine
  plugin (now `tts_engines/tts_mixed/`) or to mixed-*generation* identifiers in
  `app/engines/behavior.py` / `app/db/queue.py` / `app/db/models.py` — identifiers, not a
  module. `REMAINING_TASKS.md:53` still carries it as an open "decision".

## Reconciliation

| Item | Verdict |
|---|---|
| `bake` in CLAUDE.md list | **Stale doc entry.** `bake.py` existed when the list was written (2026-06-05) but was deleted 2026-07-16 (`f0abe35e`) as unwired dead code. The bake *capability* is real and shipped, but it lives as `is_bake` on `SynthesisTask` + the `/generation/bake/{chapter_id}` route — it was never dispatched as a `BakeTask`. Not missing functionality; wrong inventory. |
| `export` in CLAUDE.md list | **Stale doc entry**, same commit. Export capability ships via `AssemblyTask(is_audiobook=True)` (M4B) and the synchronous `export_chapter_audio()` route (chapter MP3). The deleted `ExportTask` duplicated these with fewer safeguards. Not missing functionality; wrong inventory. |
| `segment_synthesis.py` | **Real module, undocumented.** Added in Phase 12.5 (`b87e1890`), after CLAUDE.md's inventory was written. It is the per-segment fan-out child of `SynthesisTask`; CLAUDE.md should list it. |
| `mixed.py` → `composite.py` (REMAINING_TASKS.md:53) | **Stale/phantom tracker entry.** `mixed.py` never existed in git history; the rename was never performable. Doc 06 §3.6 already reached this conclusion on 2026-06-10 and prescribed closing the item as N/A (pending human confirmation it wasn't a misnamed reference to the mixed plugin). REMAINING_TASKS never absorbed that finding. |
| Genuinely missing task types | **None.** Every capability CLAUDE.md's list implies (bake, export) is shipped and wired — just not as the named modules the doc claims. |

**Correct current inventory** for CLAUDE.md:131: `synthesis`, `segment_synthesis`,
`api_synthesis`, `assembly`, `sample_build`, `sample_test` (plus `base.py`), with bake as a
synthesis flag and export split between `AssemblyTask(is_audiobook=True)` and route-level
`export_chapter_audio`.

## Confidence

**High** on every verdict. Module existence checked against the working tree; the
bake/export deletion, its rationale, and the never-existence of `mixed.py` checked against
git history (`f0abe35e`, `--all --follow` returning nothing for mixed/composite); the live
bake/export execution paths read directly in current code, not inferred from the deletion
commit's message.

## What couldn't be determined

- Whether the original `mixed.py` reference was a misnamed pointer to the mixed-engine
  plugin (doc 06's hypothesis) or to a planned-but-never-created module — the intent behind
  the phase-12 line item isn't recoverable from the repo; doc 06 flags it as needing human
  judgment.
- Whether the omission of `segment_synthesis` from CLAUDE.md was deliberate (treating it as
  an internal detail of `synthesis`) — no evidence either way; the simpler explanation is
  the inventory was never revisited after 2026-06-05.
