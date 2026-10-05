# Workflow Pain Points

This file extracts the main friction points from the workflow audit.

## Library / Book / Chapter

- Library actions are split across card controls, row menus, and separate stage views.
- The live app and mock use slightly different handoff paths into book work.
- Contents/Manuscript mixes chapter table, preview, import, and publish readiness in one surface.
- Chapter selection exists in multiple places, so the user has to remember where the active chapter lives.
- Studio keeps too many controls in one toolbar row.
- Review and Publish both depend on prior render state, so the next action is not always obvious.

## Voices / Casting

- Voice actions are split across header controls, card menus, expanded variants, Voice Lab, and metadata modal.
- There is no single obvious “manage voice” path.
- Voice Lab spreads common tasks vertically, so scrolling cost is high.
- Per-voice settings are nested and can change form shape based on engine.
- Studio casting splits narrator override, character selection, and variant choice apart.

## Queue / Activity / Debug

- Queue entry points are duplicated across Manuscript, chapter rows, top bar, drawer, and queue page.
- Queue management actions are split across header buttons, row controls, drag handles, and history collapse.
- Activity is mostly monitor-only and does not drill down much.
- Live Output is dense and dev-only.
- Progress/debug state is split across multiple surfaces, including analysis strip, toolbar, queue notice, and modal.
- Review uses a chapter rail, text surface, and annotations drawer together.
- Publish splits assembly, metadata, export, and backups into separate blocks.

## Settings / Engines / Integrations

- Setup is split across Settings, About, Developer, Engines, and Integrations.
- Plugin installation has several separate entry points for similar end states.
- Trust confirmation is necessary but adds extra friction.
- Module Settings is a second settings surface that users must discover.
- API security controls sit beside a live request builder, which mixes production and demo intent.

