# Library, Book, And Chapter Workflows

Source: repo structure and frontend route/stage code.

## 1. Library entry / resume

- Approx clicks: 1-2
- Complexity: low
- Path: open Library, click a project card or row
- Pain points:
  - Open and delete live in the same row/card affordances.

## 2. Contents / Manuscript

- Approx clicks: 3-5
- Complexity: medium
- Path: open the book's Contents/Manuscript stage, select a chapter, then add/import/queue/focus as needed
- Pain points:
  - The surface combines chapter table, preview editor, import row, and publish readiness.
  - Focus mode hides the table and adds a mode switch.
  - Chapter creation is split across add modal and import row.

## 3. Chapter workspace navigation

- Approx clicks: 2-4
- Complexity: medium
- Path: open a chapter, move back to Contents, switch chapters, or jump to the next unrendered chapter
- Pain points:
  - Chapter selection exists in multiple places.
  - Bookmarks and Lexicon add more chrome to the workspace.
  - Route/query state is hidden from the user but still drives the chapter workspace.

## 4. Studio authoring

- Approx clicks: 4-8
- Complexity: high
- Path: open Studio, toggle book/script/safe-text helpers, assign voices, queue/export when ready
- Pain points:
  - Several toggles share one toolbar row.
  - Voice assignment is split between default casting and per-chapter controls.
  - Analysis strip, header actions, cast palette, and resync flow all compete for attention.

## 5. Review / Publish

- Approx clicks: 3-7
- Complexity: medium-high
- Path: switch to Review or Publish, seek and annotate, then assemble and export
- Pain points:
  - Review depends on chapter selection plus text-level seeking.
  - Publish splits assembly, metadata, export, and backups into separate blocks.
  - Multiple confirmation points slow the handoff.

## Recommendation

- Align live Library handoff with the book pipeline.
- Collapse chapter navigation to one primary control per surface.
- Reduce Studio toolbar density by demoting secondary toggles.

