# Queue and Jobs

Audiobook Studio processes audio in the background so you can keep working.

## Monitoring the Queue

There are two places to watch active and recent work:

- **Queue Drawer**: A slide-out panel accessible from the top bar queue button, available from any page without losing your place. Shows Processing Now, Up Next, and recent completions at a glance.
- **Activity Page**: A dedicated full page reached from the left rail under **MONITOR > Activity**. Shows current queue depth, job history, and production statistics.

Job types visible in both surfaces:

- **Queued**: Tasks waiting for their turn.
- **Running**: The current task being processed by the AI engine. You will see a predictive progress bar here.
- **Done/Failed**: History of recent work.
- **Chunk Labels**: Segment jobs use displayed Performance/Production chunk numbers, so the queue can show titles like `overview: segment #7`.

## Reordering Tasks

You can drag and drop items in the **Up Next** section of the queue drawer to re-prioritize your work. The system will immediately synchronize the background worker to follow your new order as soon as the current job finishes.

## Performance Metrics

The system tracks **Characters Per Second (CPS)** and uses it to provide:

- **ETA**: Estimated time remaining for the current job. Includes a **total queue estimate** at the top of the Activity page, summing up all pending and active work in minutes.
- **Predicted Length**: How long the final audio chapter will likely be based on character count.
- **Render Metadata**: Voice builds and synthesis rows can show elapsed render time, duration, character count, and segment count when the engine reports enough timing data.

### Predictive Progress Behavior

- Queue and project-level chapter bars treat backend progress as an authoritative floor, not a visual snap target.
- Between websocket updates, the bar keeps moving locally using the current ETA model so long chapter renders do not look frozen.
- When a new checkpoint arrives, the ETA model changes future pacing and eases toward the new estimate instead of directly teleporting the bar to a new width.
- Grouped chapter renders use weighted render-group progress, so a short final group contributes less than a much larger earlier group.
- Progress starts at synthesis start, not model load or queue preparation. The `START_SYNTHESIS` event should line up with the engine beginning audio generation.
- Per-segment timing works the same way: when a segment is announced, the editor shows "Preparing engine for segment..." with no countdown while the engine loads its model. The segment's ETA clock and pacing begin only when the engine confirms it has started. Model-load time never counts against the segment estimate.
- Group counters read as a 1-based position everywhere: a four-group chapter shows 1/4 through 4/4 on both segment and chapter frames.
- When a job completes, the visible bar is allowed to finish its final move to 100% before the row leaves the active queue.

## Job Types

- **XTTS Generation** (`synthesis`): Creating audio for a segment using the local XTTS engine.
- **Voxtral Generation** (`synthesis`): Creating preview or render audio through the optional Mistral-backed Voxtral path.
- **Mixed Generation** (`mixed`): Rendering displayed chunk groups that may contain XTTS or Voxtral sections depending on the assigned voice profiles.
- **Baking**: Not a separate job type — baking is the `is_bake` flag on a synthesis job. It means the job will stitch completed segments into a chapter WAV when it finishes.
- **Assembly** (`assembly`): Creating the final `.m4b` file.
- **Voice Build** (`voice_build`): Building an XTTS speaker profile (latent) from uploaded voice samples. Appears in the queue when you trigger a profile rebuild from the Voice Lab.
- **Voice Test** (`voice_test`): Generating a voice preview clip to audition a profile. Appears in the queue and reports progress on the `voice.test` websocket topic.

## Chunk-Aware Rendering

- Performance and Production views now work from displayed chunk groups instead of fragile sentence-by-sentence queue items.
- A chapter can mix XTTS and Voxtral as long as the assigned voices resolve cleanly.
- Queue refresh also repairs certain stuck or orphaned queue states automatically, so a restart is needed less often than before.

## Live Event Stream Contract

Studio 2.0 uses named websocket topics so plugins, orchestration, and the frontend agree on who owns each piece of live state.

The full set of stable topics (authoritative spec: `docs/specs/live-events.md`):

| Topic | What it carries |
|---|---|
| `jobs.lifecycle` | Job-level lifecycle: `queued`, `preparing`, `running`, `finalizing`, `done`, `failed`, `cancelled`. |
| `queue.items` | Authoritative queue-row creation, status updates, refresh invalidation, and pause state. This is the sole authority for queue rows; other topics are overlay-only. |
| `chapters.lifecycle` | Chapter-level create/update/delete events. |
| `chapters.progress` | Chapter-level render progress only. |
| `segments.lifecycle` | Segment-level create/update/delete events. |
| `segments.progress` | Segment-level progress, segment-started, and segment-saved events. |
| `voice.test` | Voice preview/test progress only. |
| `tts.logs` | Diagnostics and live engine log output. Queue rows must not infer status from these logs. |
| `system.events` | System-level events (server health, plugin state changes). |
| `projects.lifecycle` | Project-level invalidation events. |
| `plugins.<id>.<area>` | Plugin-defined events; shape is declared by each plugin via `build_plugin_event`. |

The documented-intent ordering for any queue-visible render path is:

1. Create or refresh the queue row as `queued` on `queue.items`.
2. Emit `JOB_PREPARING` on `jobs.lifecycle`.
3. Emit `START_SYNTHESIS` on `jobs.lifecycle` when synthesis actually begins.
4. Emit runtime progress on the correct scoped topic.
5. Emit a terminal state on `jobs.lifecycle`.
6. Emit a terminal `queue_item_status` on `queue.items`.
7. Emit `queue_item_invalidated` only when a snapshot refresh is needed.

In practice the exact ordering may vary slightly; consult `docs/specs/live-events.md` for the authoritative contract.

Voice preview/test jobs follow the same queue visibility rules, but their scoped progress belongs on `voice.test`, not `chapters.progress`. They still need a `jobId` so the frontend can connect the voice-test frame to the visible queue row.

Diagnostics are deliberately separate. A plugin may send model-load lines, setup logs, progress text, and synthesis messages to `tts.logs`, but the queue must not infer row state from those logs.

## Pausing and Controls

- **Global Pause**: You can pause the entire queue if you need to free up system resources. The pause button is in the queue drawer.
- **Cancel**: Stop a specific job. If it is the 'Running' job, it may take a few seconds to terminate the subprocess.

## Output Quality Checks

Engines can validate their own rendered audio before a job completes. If an engine rejects its output (for example, XTTS detecting audio far too short for the text, which usually means truncation), the file is discarded and the job fails with the engine's reason shown verbatim in the queue row. The job is not retried automatically; requeue it once you have addressed the cause.

## Queue Priority (API vs Studio)

When both Studio renders and external API synthesis jobs are running, the `TTS_API_PRIORITY` environment variable controls ordering: `studio_first` (default) keeps your own renders ahead of API callers, `equal` interleaves them, `api_first` inverts it. See **PLATFORM > Integrations** for the API documentation.

---

[[Home]] | [[Troubleshooting and FAQ]] | [[File Formats and Audio Guidance]]
