# Implementation Map

## Workstream 1: Project creation series entry

- Replace the plain series text field with a combo box.
- Typeahead suggestions should come from existing series in the user library.
- The control must still allow a brand-new series to be entered.
- If the chosen series already has numbered entries, suggest the next number.

## Workstream 2: Series position metadata

- Add an optional series-position field to project creation and project editing.
- Persist the value with the project metadata.
- Make series sort order use the series position when present.

## Workstream 3: Chapter import

- Add drag-and-drop support to the new-chapter import area.
- Support multiple files at once.
- Restrict acceptance to formats the app already supports.
- Keep the paste/manual text path intact as a fallback.

## Workstream 4: Spec, tests, and task accounting

- Update the relevant spec docs before or alongside behavior changes.
- Add or adjust tests for series suggestion, series-position sorting, and multi-file import.
- Update `design-docs/plans/TASKS.md` and the plans index in the same change.

