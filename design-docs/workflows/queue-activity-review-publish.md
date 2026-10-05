# Queue, Activity, Review, And Publish Workflows

Source: queue components, activity page, live output, progress/debug, and review/publish surfaces.

## 1. Render queue

- Approx clicks: 4-8
- Complexity: high
- Path: queue chapters from Manuscript or chapter rows, open queue drawer/page, pause/resume/clear/reorder
- Pain points:
  - Queue entry points are duplicated across several surfaces.
  - Management actions are split across header buttons, row controls, drag handles, and history collapse.
  - Debug and cancel affordances change by job state.

## 2. Activity

- Approx clicks: 1-2
- Complexity: low
- Path: open Activity, toggle filters or queue pause, scan the page
- Pain points:
  - The page is mostly monitor-only.
  - Stats and history are visually separate.
  - The page exposes little drill-down.

## 3. Live Output

- Approx clicks: 2-6
- Complexity: medium
- Path: open the dev-only live output view, toggle filters, pause autoscroll, copy JSON, expand provenance
- Pain points:
  - It is dev-only in the main nav.
  - Filtering, clearing, copying, and provenance inspection are split apart.
  - The table is dense and wide.

## 4. Progress debug

- Approx clicks: 4-7
- Complexity: high
- Path: open Studio chapter view, read analysis, commit changes, confirm resync, queue or stop, copy debug state
- Pain points:
  - Progress state is split across several surfaces.
  - The toolbar changes shape by context.
  - Commit/resync adds another modal step.

## 5. Review and publish

- Approx clicks: 8-14
- Complexity: high
- Path: open Review, seek and annotate, regenerate if needed, then switch to Publish and assemble/export
- Pain points:
  - Review uses a chapter rail plus text surface plus annotations drawer.
  - Publish splits assembly, metadata, export, and backups.
  - Multiple confirmations slow the handoff.

## Recommendation

- Unify queue entry points and make one primary path obvious.
- Group progress/debug actions into fewer, consistently visible controls.
- Make the next task explicit at each Review/Publish step.

