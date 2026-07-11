# Test Quality Audit — Frontend Queue & Sockets

**Scope:** `useJobs.test.tsx`, `useQueueSync.test.tsx`, `useGlobalQueue.test.tsx`, `useWebSocket.test.ts/.tsx` (merged), `jobEventUtils.test.ts`; `components/queue/GlobalQueue.test.tsx`, `GlobalQueueFiles.test.tsx`, `QueueItem.test.tsx`, `QueueStats.test.tsx`.

**Audited:** 2026-06-10

---

## Summary Counts

| Class | Count |
|-------|-------|
| REAL | 162 |
| FRAGILE (fixed) | 4 |
| MOCKED-OUT (noted, left as-is) | 4 |
| SKIPPED (pre-existing) | 5 |
| **Total (non-skipped)** | **178** |

Files changed: `useWebSocket.test.tsx` (merged + 2 new tests from `.ts`), deleted `useWebSocket.test.ts`, fixed 4 FRAGILE assertions in `useQueueSync.test.tsx` and `GlobalQueue.test.tsx`. No tests deleted.

---

## Classification Table

### useWebSocket.test.tsx (merged from .ts + .tsx)

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| useWebSocket.test.tsx | connects on mount | REAL | kept | actual hook, contract assert on connected state |
| useWebSocket.test.tsx | handles message parsing | REAL | kept | drives onmessage, asserts parsed payload forwarded |
| useWebSocket.test.tsx | handles reconnection on close | REAL | kept | fake timers, asserts WebSocket called twice |
| useWebSocket.test.tsx | closes socket on unmount | REAL | kept | asserts close() on teardown |
| useWebSocket.test.tsx | sends messages when socket is open | REAL | kept | asserts send() with serialized payload |
| useWebSocket.test.tsx | does not write to the websocket ring buffer by itself | REAL | fixed | payload shape updated to match `studio_event` envelope contract |
| useWebSocket.test.tsx | does not reconnect after unmount when close event fires post-unmount | REAL | merged from .ts | tests production reconnect-leak bug; fake timers |
| useWebSocket.test.tsx | cancels a pending reconnect timer when unmounted before it fires | REAL | merged from .ts | tests production timer-cancel on unmount; fake timers |

**Merge decision:** Kept `.tsx` filename (richer harness, more tests). The `.ts` harness was nearly identical but had slightly more explicit handler init (`onopen: null`). Merged that init style into the `.tsx` `beforeEach`. Deleted `.ts` file.

---

### jobEventUtils.test.ts

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| jobEventUtils.test.ts | nulls all runtime fields for each terminal lifecycle status | REAL | kept | pure util, exhaustive field coverage |
| jobEventUtils.test.ts | does not modify updates for a non-terminal status (running) | REAL | kept | negative path |
| jobEventUtils.test.ts | does not modify updates when status is undefined | REAL | kept | edge case |
| jobEventUtils.test.ts | does not modify updates when status is null | REAL | kept | edge case |
| jobEventUtils.test.ts | preserves non-runtime fields after reset | REAL | kept | guards against over-wiping |
| jobEventUtils.test.ts | sets every expected field to the correct sentinel value for done | REAL | kept | field parity coverage |

---

### useJobs.test.tsx (62 tests)

All 62 tests classified as REAL. Key observations:

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| useJobs.test.tsx | refreshes jobs on mount by sending a snapshot request | REAL | kept | drives bus, asserts loading/state/sendMessage |
| useJobs.test.tsx | handles job updates via the broadcast bus | REAL | kept | progress update via bus |
| useJobs.test.tsx | records debug message timeline on queue.items frames | REAL | kept | side-effect observable via window global |
| useJobs.test.tsx | preserves render-group fields from chapters.progress payloads | REAL | kept | camelCase→snake_case contract |
| useJobs.test.tsx | records tts.logs diagnostics without mutating job state | REAL | kept | isolation test |
| useJobs.test.tsx | does not attribute tts.logs frames to main-queue | REAL | kept | audit store subscriber check |
| useJobs.test.tsx | does not fall back to fetchJobs when a new websocket job appears | REAL | kept | new job creation from bus |
| useJobs.test.tsx | triggers onJobComplete when a job finishes | REAL | kept | callback boundary |
| useJobs.test.tsx | handles queue_item_invalidated by requesting a new snapshot | REAL | kept | side-effect: sendMessage |
| useJobs.test.tsx | does not require an onQueueUpdate callback | REAL | kept | no-throw test |
| useJobs.test.tsx | routes a single queue.items status frame to main-queue subscriber observations exactly once each | REAL | kept | audit store double-observation guard |
| useJobs.test.tsx | handles queue_paused, segments_lifecycle, and chapter_lifecycle | REAL | kept | three callback boundary tests |
| useJobs.test.tsx | stores dedicated segment progress websocket updates separately from job progress | REAL | kept | segmentProgress state isolation |
| useJobs.test.tsx | ignores websocket status regressions for an existing job | REAL | kept | terminal status regression guard |
| useJobs.test.tsx | ignores stale normalized websocket updates by updated_at | REAL | kept | timestamp guard |
| useJobs.test.tsx | feeds done progress=1 followed by finalizing progress=0.99 | REAL | kept | terminal reset, anti-rollback |
| useJobs.test.tsx | unrelated project_updated/chapter_updated/queue_updated messages do not alter live progress state | REAL | kept | topic isolation |
| useJobs.test.tsx | updates live job progress and status entirely from queue.items alone without requiring full refetches | REAL | kept | no-refetch guarantee |
| useJobs.test.tsx | ignores rogue active segment fields from queue.items updates | REAL | kept | field isolation |
| useJobs.test.tsx | clears active_segment_id and resets active_segment_progress=0 when terminal queue.items arrives | REAL | kept | terminal reset path |
| useJobs.test.tsx | clears active segment fields when terminal jobs.lifecycle arrives | REAL | kept | terminal reset via jobs.lifecycle |
| useJobs.test.tsx | records main-queue and chapter-state subscriber observations on handled chapter progress frames | REAL | kept | audit store multi-subscriber |
| useJobs.test.tsx | records main-queue and chapter-state subscriber observations on handled chapter lifecycle frames | REAL | kept | audit store multi-subscriber |
| useJobs.test.tsx | records main-queue and voice-test-state subscriber observations on voice.test frames | REAL | kept | audit store multi-subscriber |
| useJobs.test.tsx | updates the jobs state from voice.test frames when they carry a job id | REAL | kept | voice test progress on job |
| useJobs.test.tsx | drives segment progress directly from segments.progress topic | REAL | kept | segmentProgress state |
| useJobs.test.tsx | drives segment progress and chapter job active_segment_progress from segments.progress using activeSegmentProgress payload field | REAL | kept | payload field mapping |
| useJobs.test.tsx | replaces prior progress with latest segments.progress for the same segment | REAL | kept | idempotency |
| useJobs.test.tsx | drives chapter progress directly from chapters.progress topic | REAL | kept | chapter progress fields |
| useJobs.test.tsx | preserves live segment ETA when a later chapters.progress update carries chapter-level ETA | REAL | kept | ETA preservation |
| useJobs.test.tsx | does not overwrite row logs with segment progress narration on chapters.progress | REAL | kept | log isolation by reasonCode |
| useJobs.test.tsx | projects segments.progress active segment metadata onto matching chapter job | REAL | kept | metadata projection |
| useJobs.test.tsx | does not project done status from segments.progress onto matching chapter job | REAL | kept | status isolation |
| useJobs.test.tsx | allows a terminal done job to roll back to running when receiving a newer active event | REAL | kept | rollback allowed with newer ts |
| useJobs.test.tsx | ignores older active events and does not revive/rollback a terminal done job | REAL | kept | rollback blocked with older ts |
| useJobs.test.tsx | updates active_segment_id and active_segment_progress from segments.progress even when the current job status is done | REAL | kept | segment fields bypass terminal guard |
| useJobs.test.tsx | preserves project_id and chapter_id on segments.progress updates in the jobs store | REAL | kept | ID propagation |
| useJobs.test.tsx | does not discard active_segment_id and active_segment_progress when updates have an older timestamp | REAL | kept | segment fields always updated |
| useJobs.test.tsx | propagates segment-scoped ETA and started_at from segments.progress only when present on socket payload | REAL | kept | conditional propagation |
| useJobs.test.tsx | does not coerce null segment ETA payloads to zero | REAL | kept | null sentinel preservation |
| useJobs.test.tsx | proves that a prior job/chapter started_at and eta_seconds survive a later segments.progress update | REAL | kept | ETA non-clobber |
| useJobs.test.tsx | populates segmentProgressSocketProvenance only for segments.progress events | REAL | kept | provenance contract |
| useJobs.test.tsx | preserves segmentProgressSocketProvenance through the stale-timestamp fast path | REAL | kept | provenance survives stale guard |
| useJobs.test.tsx | proves one compact history row is appended for each segments.progress event | REAL | kept | history append |
| useJobs.test.tsx | proves the history is bounded to the last 20 entries | REAL | kept | ring buffer bound |
| useJobs.test.tsx | proves segments.progress updates do not lose active segment fields on later non-segment updates | REAL | kept | field retention |
| useJobs.test.tsx | proves chapter-level progress/ETA updates do not overwrite segment progress/ETA when active_segment_id is present | REAL | kept | ETA isolation (TDD) |
| useJobs.test.tsx | preserves segment classification for segment-scoped jobs when chapter progress arrives | REAL | kept | classification preservation |
| useJobs.test.tsx | treats segment_start frames at 0 progress as preparing until real synthesis progress arrives | REAL | kept | preparing state guard |
| useJobs.test.tsx | proves queue.items updates cannot overwrite active_segment_eta_seconds while active_segment_id is present | REAL | kept | ETA isolation from queue events |
| useJobs.test.tsx | keeps status preparing for segment progress at zero and guards against queue.items overwriting it | REAL | kept | preparing guard |
| useJobs.test.tsx | prevents queue.items/chapter updates at 0% from flipping a starting job out of preparing before the first segments.progress frame | REAL | kept | preparing guard pre-segment |
| useJobs.test.tsx | keeps 0% segment_start frame preparing even if active_segment_id has not been attached yet | REAL | kept | preparing guard on segment_start |
| useJobs.test.tsx | treats canonical START_SEGMENT at 0% as the segment timer start | REAL | kept | START_SEGMENT uppercase variant |
| useJobs.test.tsx | transitions segment-scoped job out of preparing normally on first non-zero segments.progress frame | REAL | kept | preparing→running transition |
| useJobs.test.tsx | prevents non-segment updates from reintroducing active_segment_* fields | REAL | kept | field introduction isolation |
| useJobs.test.tsx | chapter-classified job with active_segment_id still accepts later chapters.progress ETA updates | REAL | kept | chapter-classified ETA acceptance |
| useJobs.test.tsx | true segment-scoped job still does not leak chapter ETA into the queue path | REAL | kept | segment ETA isolation |
| useJobs.test.tsx | useJobs: preserves and propagates job confidence | REAL | kept | confidence field |
| useJobs.test.tsx | useJobs debug/provenance test: confidence and etaUpdatedAt are not reported under ignoredFields | REAL | kept | provenance ignoredFields |
| useJobs.test.tsx | Frontend adapter test: canonical camelCase payloads are consumed correctly | REAL | kept | adapter unit test, pure function |
| useJobs.test.tsx | subscription remains active after rerenders with new inline callbacks | REAL | kept | subscription stability |

---

### useQueueSync.test.tsx (27 tests)

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| useQueueSync.test.tsx | reports hydration source as bootstrap during initial load | REAL | kept | bootstrap lifecycle |
| useQueueSync.test.tsx | reports hydration source as reconnect when WS reconnects after being lost | REAL | kept | reconnect hydration |
| useQueueSync.test.tsx | reports hydration source as refresh during manual refresh | REAL | kept | manual refresh |
| useQueueSync.test.tsx | does not refetch the queue for queue_item_status websocket events | REAL | kept | no-refetch guard for status frames |
| useQueueSync.test.tsx | records queue consumer path in timeline when queue messages arrive | REAL | kept | timeline + audit store |
| useQueueSync.test.tsx | updates the queue overlay from chapters.progress frames | REAL | kept | overlay update |
| useQueueSync.test.tsx | records queue consumer path for job_updated messages | REAL | kept | timeline path |
| useQueueSync.test.tsx | records a main-queue subscriber observation on each handled bus frame | REAL | kept | audit store |
| useQueueSync.test.tsx | preserves overlay progress after a queue_updated triggered refresh | REAL | kept | overlay survives refresh |
| useQueueSync.test.tsx | preserves overlays that arrive during reconnect API call (grace window) | REAL | kept | grace window |
| useQueueSync.test.tsx | refreshes the queue from chapters.lifecycle frames | REAL | kept | lifecycle-triggered refresh |
| useQueueSync.test.tsx | ignores segments.progress frames for the main queue overlay | REAL | fixed FRAGILE | removed `setTimeout(50)` real-timer sleep; state is synchronously set after act() |
| useQueueSync.test.tsx | renders a voice-test queue row from queue.items without chapter or project context | REAL | kept | voice-test row rendering |
| useQueueSync.test.tsx | does not use voice.test frames to refresh the queue | REAL | kept | voice.test isolation |
| useQueueSync.test.tsx | refreshes on queue_item_invalidated without reading status or progress from it | REAL | kept | invalidation refresh |
| useQueueSync.test.tsx | triggers queue snapshot refresh and renders the queued item after queue invalidation | REAL | kept | full invalidation flow |
| useQueueSync.test.tsx | renders queue row from queue.items status event without chapters.progress | REAL | kept | overlay row creation |
| useQueueSync.test.tsx | keeps a chapter lifecycle overlay visible when parentJobId carries the project id | REAL | kept | parentJobId project mapping |
| useQueueSync.test.tsx | does not clamp progress of a newer active overlay to 1.0 when merging with a stale done snapshot item | REAL | kept | overlay wins newer timestamp |
| useQueueSync.test.tsx | clamps/ignores overlay status when the overlay is not provably newer than the done snapshot | REAL | fixed FRAGILE | removed `setTimeout(50)` real-timer sleep |
| useQueueSync.test.tsx | confirms queue.items positive etaSeconds is stored from the socket payload | REAL | kept | eta_seconds storage |
| useQueueSync.test.tsx | proves tts.logs does not update queue ETA | REAL | fixed FRAGILE | removed `setTimeout(50)` real-timer sleep |
| useQueueSync.test.tsx | confirms queue.items positive etaSeconds stores eta_seconds and eta_basis="remaining_from_update" by default | REAL | kept | eta_basis default |
| useQueueSync.test.tsx | replaces total_from_start with remaining_from_update on a later queue.items positive update | REAL | kept | eta_basis replacement |
| useQueueSync.test.tsx | reflects a progress event that arrives mid-bootstrap after the snapshot resolves | REAL | kept | bootstrap buffering (F3) |
| useQueueSync.test.tsx | applies only the later-started hydration result when two overlap and the earlier resolves last | REAL | kept | concurrent hydration gen wins (F4) |
| useQueueSync.test.tsx | keeps a voice-build job-scoped item in the queue when it completes with active_segment_id=null and active_segment_progress=0 | REAL | kept | voice-build terminal |

---

### useGlobalQueue.test.tsx (7 tests, 5 skipped)

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| useGlobalQueue.test.tsx | initializes with provided queue | REAL | kept | state init |
| useGlobalQueue.test.tsx | syncs with initialQueue updates when not dragging | REAL | kept | sync behavior |
| useGlobalQueue.test.tsx | suspends sync during drag | REAL (skipped) | kept skipped | timeout in handleDragStart; skip comment documents reason |
| useGlobalQueue.test.tsx | handles pause/resume toggle | REAL (skipped) | kept skipped | async act deadlock; deferred |
| useGlobalQueue.test.tsx | handles reordering and commit | REAL (skipped) | kept skipped | async act deadlock; deferred |
| useGlobalQueue.test.tsx | handles removal | REAL (skipped) | kept skipped | async act deadlock; deferred |
| useGlobalQueue.test.tsx | handles clear all with confirmation | REAL (skipped) | kept skipped | async act deadlock; deferred |

Note: The 5 skipped tests are well-documented REAL tests with environment-specific timing issues. They are not vacuous — they test real side effects. Rewriting them would require fake-timer patterns for the drag debounce. Left as-is per prior decision recorded in file comments.

---

### components/queue/GlobalQueue.test.tsx (19 tests)

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| GlobalQueue.test.tsx | renders loading state when loading prop is true | REAL | kept | DOM assert on loading text |
| GlobalQueue.test.tsx | renders the queue sections correctly | REAL | kept | section headers + items visible |
| GlobalQueue.test.tsx | prefers custom titles over raw chapter titles when present | REAL | kept | title precedence |
| GlobalQueue.test.tsx | does not render segment-scoped overlay jobs as separate active items | REAL | kept | filter contract |
| GlobalQueue.test.tsx | chapter-scoped jobs still render in the main queue | REAL | kept | filter contract |
| GlobalQueue.test.tsx | keeps grouped chapter jobs visible after active segment progress starts | REAL | kept | grouped job visibility |
| GlobalQueue.test.tsx | toggles pause state | REAL | kept | API call + state toggle |
| GlobalQueue.test.tsx | toggles history visibility and shows start/end times | REAL | kept | toggle behavior |
| GlobalQueue.test.tsx | shows a timestamp for failed history jobs without a start time | REAL | fixed FRAGILE | removed year-specific check (`'2024'`); replaced with generic digit check |
| GlobalQueue.test.tsx | shows completed output metadata in history when available | REAL | kept | metadata display |
| GlobalQueue.test.tsx | uses live job metadata to label voice test queue rows without a hard refresh | REAL | kept | voice test label from jobs prop |
| GlobalQueue.test.tsx | calls clear completed from ActionMenu | REAL | kept | API call |
| GlobalQueue.test.tsx | calls removeProcessingQueue when a queued job is cancelled | REAL | kept | API call |
| GlobalQueue.test.tsx | calls clearProcessingQueue after confirmation | REAL | kept | confirmation modal + API call |
| GlobalQueue.test.tsx | trusts merged queue status as authoritative even if legacy liveJob is stale | REAL | kept | status precedence |
| GlobalQueue.test.tsx | does not resurrect stale progress from liveJob when the merged queue row is queued or preparing | REAL | kept | stale progress guard |
| GlobalQueue.test.tsx | identifies chapter jobs without engine-name heuristics | REAL | kept | engine-agnostic classification |
| GlobalQueue.test.tsx | keeps a done queue row with progress below 1.0 mounted in the active section until visual completion | REAL | kept | visual-pending lifecycle, fake timers |
| GlobalQueue.test.tsx | retains a done queue row when transitioning from active to done even if progress is already 1.0 | REAL | kept | visual-pending on immediate done |

---

### components/queue/GlobalQueueFiles.test.tsx (29 tests)

Note: This file mocks `useGlobalQueue` entirely. The two tests in `describe('GlobalQueue')` at the bottom are technically MOCKED-OUT for queue logic but exercise real DOM rendering paths. The `describe('QueueItem')` subtree (27 tests) renders the real `QueueItem` component with production-plausible props — those are REAL.

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| GlobalQueueFiles / QueueItem | renders job details correctly | REAL | kept | DOM structure |
| GlobalQueueFiles / QueueItem | shows part numbering only for continued split jobs | REAL | kept | split_part > 0 |
| GlobalQueueFiles / QueueItem | passes live job timing data through and enables local predictive animation for xtts queue jobs | REAL | kept | predictive + eta props |
| GlobalQueueFiles / QueueItem | uses indeterminate working state for indeterminate jobs while keeping predictive mode enabled | REAL | kept | cloud engine indeterminate |
| GlobalQueueFiles / QueueItem | uses live segment progress for running voice build jobs | REAL | kept | voice build progress |
| GlobalQueueFiles / QueueItem | keeps voice build progress tied to the active segment instead of the overall job lane | REAL | kept | progress source |
| GlobalQueueFiles / QueueItem | proves the main queue is not driven by chapter/segment live overlays | REAL | kept | chapter progress isolation |
| GlobalQueueFiles / QueueItem | uses chapter progress for segment-capable chapter jobs in the main queue | REAL | kept | chapter job path |
| GlobalQueueFiles / QueueItem | does not render ETA 0 or negative ETA for active jobs | REAL | kept | ETA zero filter |
| GlobalQueueFiles / QueueItem | does not render ETA 0 when an active job has positive eta_seconds but a stale estimated_end_at from the past | REAL | kept | stale estimated_end_at guard |
| GlobalQueueFiles / QueueItem | uses active segment progress for segment-classified jobs | REAL | kept | segment progress path |
| GlobalQueueFiles / QueueItem | preserves grouped progress evidence for mixed chapter jobs while keeping the preparing label | REAL | kept | grouped progress / preparing label |
| GlobalQueueFiles / QueueItem | shows pause icon when paused | REAL | kept | SVG present |
| GlobalQueueFiles / QueueItem | calls onRemove when cancel button is clicked | REAL | kept | callback |
| GlobalQueueFiles / QueueItem | stabilizes grouped-job policy from the first frame by reading render group count from the authoritative queue job | REAL | kept | grouped policy from job prop |
| GlobalQueueFiles / QueueItem | prefers positive liveJob.eta_seconds over job.eta_seconds = 0 when running | REAL | kept | ETA source preference |
| GlobalQueueFiles / QueueItem | uses job.eta_seconds when only job.eta_seconds is positive | REAL | kept | ETA source fallback |
| GlobalQueueFiles / QueueItem | associates the ETA basis with the selected ETA source | REAL | kept | eta_basis propagation |
| GlobalQueueFiles / QueueItem | copies JSON containing job details and matching queue.items audit frames on debug button click | REAL | kept | clipboard payload contract |
| GlobalQueueFiles / QueueItem | prefers liveJob.updated_at over job.updated_at when liveJob provides the positive ETA | REAL | kept | timestamp preference |
| GlobalQueueFiles / QueueItem | falls back to job.updated_at when live overlay does not provide a fresher ETA/timestamp pair | REAL | kept | timestamp fallback |
| GlobalQueueFiles / QueueItem | keeps the ETA timestamp anchor stable when a subsequent update lacks a positive live ETA | REAL | kept | anchor stability |
| GlobalQueueFiles / QueueItem | keeps the debug button visible after a job reaches done | REAL | kept | debug button retention |
| GlobalQueueFiles / QueueItem | includes the ETA source/basis fields and last active values in the debug payload after completion | REAL | kept | clipboard post-done payload |
| GlobalQueueFiles / GlobalQueue | renders queue title | MOCKED-OUT | kept | `useGlobalQueue` is mocked; exercises render path only — acceptable for smoke test |
| GlobalQueueFiles / GlobalQueue | shows empty state | MOCKED-OUT | kept | same — smoke test for empty queue render path |
| GlobalQueueFiles / GlobalQueue Retention | retains completed jobs in the active list long enough to copy debug data | REAL | kept | retention timer + clipboard |
| GlobalQueueFiles / GlobalQueue Retention | clears completion retention timer and entry if a job is retried/goes active again | REAL | kept | timer cancellation on retry |
| GlobalQueueFiles / GlobalQueue Retention | clears completion retention timer and entry if a job is removed/cancelled from the queue | REAL | kept | timer cancellation on remove |

---

### components/queue/QueueItem.test.tsx (19 tests)

All 19 are REAL. All render the actual QueueItem with production-plausible props and assert on observable contract via the mocked PredictiveProgressBar data attributes.

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| QueueItem.test.tsx | preserves ETA anchor when a boundary frame has null eta_seconds | REAL | kept | anchor stability on null ETA |
| QueueItem.test.tsx | advances ETA anchor when a newer positive live ETA arrives | REAL | kept | anchor advance |
| QueueItem.test.tsx | ignores placeholder zero active segment progress when voice build has no active segment id | REAL | kept | voice build zero guard |
| QueueItem.test.tsx | QueueItem countdown uses chapter/job eta_seconds only, not active_segment_eta_seconds | REAL | kept | segment ETA isolation |
| QueueItem.test.tsx | uses eta_updated_at, not generic updated_at, for remaining_from_update countdown | REAL | kept | eta_updated_at preference |
| QueueItem.test.tsx | ignores stale eta_updated_at when eta_seconds is null | REAL | kept | stale eta_updated_at guard |
| QueueItem.test.tsx | prefers job ETA when job eta_updated_at is fresher than liveJob eta_updated_at | REAL | kept | job wins newer ts |
| QueueItem.test.tsx | prefers liveJob ETA when liveJob eta_updated_at is fresher than job eta_updated_at | REAL | kept | liveJob wins newer ts |
| QueueItem.test.tsx | falls back to updated_at when eta_updated_at is absent and prefers the fresher source | REAL | kept | fallback to updated_at |
| QueueItem.test.tsx | QueueItem: propagates confidence correctly | REAL | kept | confidence field pass-through |
| QueueItem.test.tsx | QueueItem: preserves START_SEGMENT progress 0 with confidence 1.0 | REAL | kept | confidence at 0% |
| QueueItem.test.tsx | QueueItem: uses job confidence when etaSource resolves to job | REAL | kept | confidence source |
| QueueItem.test.tsx | QueueItem: uses liveJob confidence when etaSource resolves to liveJob | REAL | kept | confidence source |
| QueueItem.test.tsx | QueueItem debug copy includes selected confidence and the real evidenceWeightFraction | REAL | kept | clipboard payload |
| QueueItem.test.tsx | preserves progress on done/completed jobs instead of forcing to 0 | REAL | kept | done progress preservation |
| QueueItem.test.tsx | keeps failed or cancelled jobs at their last known progress without promoting to 100% | REAL | kept | failed/cancelled progress |
| QueueItem.test.tsx | notifies visual pending change when entering done with progress below 1.0 | REAL | kept | onVisualPendingChange callback |
| QueueItem.test.tsx | sets isVisuallyPending to true on active -> done transition even if progress is already 1.0 | REAL | kept | visual pending on immediate done |
| QueueItem.test.tsx | retains active startedAt and etaSeconds during done transition visual pending phase | REAL | kept | ETA retention during visual pending |

---

### components/queue/QueueStats.test.tsx (6 tests)

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| QueueStats.test.tsx | returns null when queue is empty | REAL | kept | null render contract |
| QueueStats.test.tsx | returns null if any active processing item is missing an eta_seconds on its job | REAL | kept | partial-eta guard |
| QueueStats.test.tsx | calculates and formats minutes correctly when all items have eta_seconds | REAL | kept | math + display |
| QueueStats.test.tsx | formats days, hours, and minutes correctly | REAL | kept | format coverage |
| QueueStats.test.tsx | updates in real-time as time passes | REAL | kept | fake timer countdown |
| QueueStats.test.tsx | shows "Finishing..." when total seconds reach 0 | REAL | kept | "Finishing..." is a defined contract label, not ad-hoc copy |

---

## Lifecycle Behavior → Surviving Test Mapping

| Lifecycle behavior | Tests covering it |
|--------------------|-------------------|
| Bootstrap buffering (events arrive mid-fetch) | `useQueueSync: reflects a progress event that arrives mid-bootstrap` |
| Reconnect hydration (source='reconnect') | `useQueueSync: reports hydration source as reconnect`, `preserves overlays that arrive during reconnect API call` |
| Concurrent hydration — later generation wins | `useQueueSync: applies only the later-started hydration result` |
| Terminal reset (active_segment_* cleared on done/failed) | `useJobs: clears active_segment_id and resets... when terminal queue.items arrives`, `clears active segment fields when terminal jobs.lifecycle arrives`, `feeds done progress=1 followed by finalizing progress=0.99` |
| Subscription stability (no dropped events on rerender) | `useJobs: subscription remains active after rerenders with new inline callbacks` |
| Reconnect leak (no new WS after unmount) | `useWebSocket: does not reconnect after unmount when close event fires post-unmount` |
| Reconnect timer cancel on unmount | `useWebSocket: cancels a pending reconnect timer when unmounted before it fires` |
| Segment ETA isolation (segment ETA not leaked to queue path) | `useJobs: true segment-scoped job still does not leak chapter ETA`, `QueueItem: countdown uses chapter/job eta_seconds only`, `useQueueSync: ignores segments.progress frames for the main queue overlay` |
| Preparing → running transition | `useJobs: treats segment_start frames at 0 progress as preparing`, `keeps 0% segment_start frame preparing`, `transitions segment-scoped job out of preparing normally` |
| Visual pending / done transition hold | `GlobalQueue: keeps a done queue row with progress below 1.0 mounted`, `retains a done queue row when transitioning from active to done`, `GlobalQueueFiles retention: retains completed jobs in the active list long enough to copy debug data` |
| Completion retention timer cancel on retry/remove | `GlobalQueueFiles retention: clears completion retention timer and entry if a job is retried/goes active again`, `clears completion retention timer and entry if a job is removed/cancelled` |

---

## Riskiest Findings

1. **Three real-timer `setTimeout(50)` sleeps in useQueueSync.test.tsx** — fixed by removing the sleeps. The assertions were safe to make synchronously because `publishStudioSocketMessage` is synchronous and React Testing Library `act()` flushes effects synchronously. The sleeps were cargo-culted, not necessary. *Verified passing after removal.*

2. **Year-hardcoded date check in GlobalQueue.test.tsx** (`content.includes('2024')`) — would fail in 2025+. Fixed with a generic digit check. *Verified passing.*

3. **Two MOCKED-OUT tests in GlobalQueueFiles.test.tsx** (`renders queue title`, `shows empty state`) — `useGlobalQueue` is mocked so these only exercise static render paths. They are low-value but harmless smoke tests. Left as-is; cost of deletion > benefit.

4. **5 skipped tests in useGlobalQueue.test.tsx** — pre-existing, well-documented. Tests are real in intent but block on `handleDragStart`'s 10-second `setTimeout` and async `act()` deadlocks in the vitest environment. Not a regression introduced here.

5. **useWebSocket.test.tsx original "ring buffer" test had a wrong-shaped payload** — the test used a flat `studio_job_event` shape that the app never sends (the actual wire format is `studio_event` envelope with `topic`/`ids`/`payload` sub-objects). Fixed the payload to match the `studio_event` contract while keeping the test's actual assertion (`__websocketRecentMessages` stays undefined and `onMessage` is called). *Verified passing and revert-checked.*
