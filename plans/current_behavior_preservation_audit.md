# Current Behavior Preservation Audit

This document records the current product behaviors that Studio 2.0 must preserve or intentionally replace. It exists to reduce the risk of losing product purpose while refactoring implementation.

## 1. Core Product Behaviors To Preserve

### Project And Library

- Users can create, edit, and delete projects.
- Projects carry meaningful metadata such as title, author, series, narrator/default voice, and cover art.
- Voice profiles are reusable and may have profile-level defaults and preview/test behavior.

### Chapter Editing And Generation

- Users can work at chapter scope and segment scope.
- Users can trigger generation for a whole chapter, selected segments, and repair/bake-style work.
- The app preserves the concept of grouped rendering for adjacent compatible segments rather than requiring every line to render in total isolation.
- Playback and preview are integral to the editing workflow.

### Queue And Processing

- The queue supports active visibility, manual clearing, pausing, cancelation, and reordering.
- Jobs surface meaningful phases such as `queued`, `preparing`, `running`, and `finalizing`.
- Mixed-engine work, audiobook assembly, voice build, and voice test are distinct functional concepts.
- Voice preview/test should remain usable as a distinct lightweight flow and should not accidentally inherit full batch-publishing behavior just because it shares engine infrastructure with synthesis.

### Recovery And Reconciliation

- The system attempts to recover from restart, missing outputs, and stale queue state.
- The UI expects recovery to remain understandable, not just technically possible.
- App startup currently performs meaningful operational work, including DB initialization, base-profile normalization, legacy cover migration, stuck-job cleanup, queue reconciliation, listener registration, and pause-state restoration.
- Background worker startup currently exists as a real behavior boundary and must not be lost accidentally during migration.

### Progress UX

- Progress should feel smooth and monotonic during active work.
- Backend progress acts as an authoritative floor while the UI may smooth between sparse updates.
- The app protects against stale live updates regressing active state casually.
- If preview/test is temporarily unavailable because an engine is not configured, not ready, or already resource-constrained, the system should surface that reason clearly instead of failing with an opaque execution error.

### Settings

- There are real global app settings today, including safe mode, default engine behavior, MP3 generation, and Voxtral/cloud configuration.
- Voice preview/test behavior also has settings-like inputs that are distinct from project metadata.
- Legacy middleware currently syncs config paths into router modules for compatibility with existing tests and monkeypatch patterns.

### Export And Audiobook Assembly

- Audiobook assembly carries chapter-title, author, narrator, and cover-art intent.
- Backfill or repair flows for derivative outputs such as MP3s are part of the current product concept.

### App Boot And Runtime Side Effects

- Importing legacy queue modules may start worker threads outside explicit route calls.
- Startup hooks currently register WebSocket/job listeners and reconcile persistent queue state.
- These behaviors should be preserved behind explicit application-entry boundaries until replacement systems are ready, not copied into new domain or orchestration modules.

## 2. Behaviors To Intentionally Replace

- Raw file existence as completion truth should be replaced with revision-safe artifact validation.
- Worker-local queue and progress coupling should be replaced with domain and orchestration boundaries.
- Flat settings ownership should be replaced with explicit global/project/module/profile ownership.

## 3. Non-Negotiable Migration Principle

If Studio 2.0 cannot preserve a current behavior immediately, the migration must either:

- leave the legacy path in place for that behavior, or
- document the intentional replacement before the implementation lands

We should not lose behavior accidentally through omission.
