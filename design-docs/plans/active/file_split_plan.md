> **RETIRED 2026-07-01 — folded into [simplification/04](simplification/04_large_file_splits.md).**
> Audit found 3 of 5 ranked items already right-sized by unrelated work: `useJobs.ts` = 288 lines,
> `useQueueSync.ts` = 196, `scriptViewProgress.ts` = 95 — no split needed. Still live:
> **`ChapterHeader.tsx` (615 lines)** — the `segmentProgressSelection` extraction remains worthwhile
> and is now tracked under simplification/04. `QueueItem.tsx` (556) is borderline and mid-edit by
> W-MIX-LA. The doc's premise that splits must wait for the "in-flight P1–P6 perf agent" is long
> resolved. Kept for provenance; do not execute from this file.

# Purpose-driven file splits — ranked execution plan

*From the 2026-06-11 read-only audit (full seam maps with line cites in the audit transcript; line numbers drift — re-grep before cutting). Owner motivation: "queue issues could be because things are doing too many things and it's hard to test them." Every split extracts data-derivation into pure, unit-testable modules; rendering stays where it is. Splits follow `.agent/rules/modular_architecture.md`: cohesive responsibilities along existing seams, never mechanical.*

## Ranked queue (testability gain × entanglement risk ÷ effort)

1. **QueueItem.tsx → `utils/queueItemEtaSelection.ts`** — `selectEtaSource()` (~30 lines of source-priority/timestamp-comparison conditionals) + `selectEtaSourceTimestamp()` as pure functions; also extract the debug-payload builder (`queueItemDebugPayload.ts`). Pure, low risk, ~30 edge cases become unit-testable.
2. **useJobs.ts → `utils/jobUpdateReducer.ts`** — `applyJobUpdatedEvent` body (~200 lines: stale guard, segment field rules, status-priority regression protection, progress/timestamp/ETA-epsilon guards) as `applyJobUpdated(oldJob, updates, sourceTopic, isOverlayOnly)`; sub-extract `detectNewerRun()` and `applySegmentFieldRules()`. THE core queue-correctness logic; currently untestable in isolation. Also extract the segments.progress projection (`segmentsProgressProjector.ts`).
3. **ChapterHeader.tsx → `utils/segmentProgressSelection.ts`** — provenance-vs-direct field selection (pure) + `useQueueStatusHoldTimer` hook extraction.
4. **useQueueSync.ts → `queueEventDispatcher.ts`** — the ~85-line topic-routing switch as a dispatcher with per-topic handlers, testable without React/WebSocket mocks.
5. **ScriptView.tsx → `scriptViewProgress.ts`** — `computeSpanRenderProgress()` (batch % → per-span lit chars) + `batchEngineStatus()` as pure functions.
6. **useChapterStatus hold-timer** — covered by #3's hook extraction.

## Backend (second wave)

- `app/db/state_jobs.py` — update_job guard logic (status regression, stale detection, field normalization) extracted from broadcast routing.
- `app/db/speakers.py` — profile path resolution vs speaker-name inference into two modules.
- `app/tts_server/plugin_loader.py` — discovery vs validation vs import seams.
- `app/tts_server/server.py` — plugin lifecycle init out of the HTTP route module.
- Leave alone: events.py (schema only), progress/service.py (clear boundary), orchestrator_helpers (already split).

## Execution rules

- One split per commit; behavior-identical (the extracted function's new unit tests PLUS the existing component tests unchanged).
- Each extraction lands WITH the unit tests that motivated it (the edge cases the audit lists).
- Frontend splits 1–5 must wait for the in-flight P1–P6 perf agent (ScriptView/LiveOutputTable overlap).
