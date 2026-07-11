# Library / Chapter Import Usability

```
status: active
owner: Steven
scope: project creation + chapter import UX
created: 2026-07-08
```

## Problem

Creating a new project is slower than it should be because series entry is purely manual,
series order is not modeled, and chapter import still relies on a single-file picker plus paste.

## Goal

Make the create-project flow and chapter import flow more ergonomic without expanding support
for file types beyond what already works in the current app.

## Boundaries

- Do not add support for new import formats.
- Keep series position optional.
- Preserve existing manual entry and paste flows.
- Keep the change scoped to the current project/library/book editor surfaces.

## Done means

- Series can be chosen from existing library series with suggestions while typing.
- New series can still be entered in the same control.
- Series position can be entered optionally and is used for series-aware sorting.
- Chapter import supports drag-and-drop of multiple files for the already-supported formats.
- The plan is reflected in `design-docs/plans/TASKS.md`.

