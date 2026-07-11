# Roadmap

## Tasks

- **001 — Author the tone/timbre fragment dictionary** (content-authoring, no code logic). Independent — do first, unblocks 002.
- **002 — Build `suggestRecordingPrompt()`** (matching + composition + unit tests). Depends on 001's data existing (even a draft) to test against.
- **003 — Wire attributes into `ScriptEditor.tsx`** (prop-threading `VoicesPage.tsx` → `VoicesModals.tsx` → `ScriptEditor.tsx` + the button). Depends on 002 (needs the function to call).
- **004 — Green gate + live verification**. Depends on 001-003.

## Dependency graph

```
001 (fragments) ──► 002 (suggester + tests) ──► 003 (wire button) ──► 004 (green gate)
```

No parallelization opportunity here — each task builds on the previous one's output directly (small, serial plan).

## Milestones

1. After 001: fragment dictionary complete, reviewable independent of any code.
2. After 002: `suggestRecordingPrompt()` fully unit-tested in isolation (can be verified without touching the UI at all).
3. After 003: the button works end-to-end in the live app.
4. After 004: plan complete → archive.
