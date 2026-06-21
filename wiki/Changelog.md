# Changelog

All notable changes to this project will be documented in this file.

## [Cleanup] - 2026-06-20

### Foundation cleanup (master fix plan — Milestone 1, W1)

Low-risk dead-weight removal and a design-system compliance pass, with no behavior change.

- **Dead dependencies removed.** Frontend: `clsx`, `tailwind-merge` (no imports; no Tailwind in the project). Backend: `mistralai`, `beautifulsoup4` (zero imports across `app/` + plugins). `package-lock.json` regenerated.
- **Legacy files deleted.** Top-level v1 utilities `audiobook.py`, `audit_routes.py`, the standalone `text_progress_demo.html`, and the redundant `.coveragerc` (its `concurrency`/`show_missing`/`exclude_lines` settings were migrated into `pyproject.toml` to preserve coverage behavior). Two obsolete `export {}` frontend stubs (`predictiveProgressBarEngine.ts`, `utils/predictiveProgress.ts`) and three empty `shared/` placeholder barrels.
- **Runtime artifacts untracked.** `plugins/*/assets/last_test.json` (runtime-written) added to `.gitignore` and removed from the index so engine tests no longer dirty the tree.
- **§2.2 color compliance (QW-7).** Converted the last five hardcoded color literals in real-app components to CSS tokens (`StatusOrb`, `LiveOutputTable`, `ColorSwatchPicker`); added `--text-on-error` and `--text-on-warning` to `tokens.css` (both themes). Light theme is visually unchanged; two intentional dark-mode effects: the `LiveOutputTable` on-accent labels now use `--text-on-accent` (dark text on the lightened dark-mode accent — a contrast *fix*, the old `#fff` was low-contrast there), and the warning glyph moved from pure `#000` to `--text-on-warning` `#1c1300`. `design-system.md` → 1.6.4.
- **Excluded as still-live** (the plan's fold-in list was stale): `app/infra/`, `frontend/src/api/client.ts`, `frontend/src/api/queries/index.ts` are imported and were kept. **Deferred:** QW-6 dead-CSS removal folds into the `components.css` split (Milestone 3 / task 005) to avoid touching the file twice and to safely relocate the styleguide-referenced rules.

Verification: `ruff`, `pytest` (1800 passed), frontend `build` + `lint` + `test` (1375 passed) all green.

## [Fix] - 2026-06-19

### Segment progress bar: confidence-gated ETA decay + per-segment confidence

The per-segment render bar surged then stalled early in each segment, and the "confidence" value never reset between segments. Both are fixed in the single-source `ProgressService.enrich()` kernel.

- **Segment ETA decay-handoff (`progress-presentation.md` §4A.10 / B11).** The per-segment ETA (`active_segment_eta_seconds`) was raw `remaining_from_update` extrapolation — a tiny first-interval velocity sample makes the implied total swing wildly early (observed in the capture: 22s→25s→13s with the bar speeding up and freezing). It now blends a grounded baseline (`seg_chars × seconds_per_char`, where `seg_chars` is the render group's character weight) with the live observed estimate on the implied-total-duration axis, weighted `w_base = c_base × (1 − progress)` — the owner's law: the baseline's influence equals its own historical confidence and decays to zero by completion. `c_base = min(engine_sample_count / N_MATURE, 1)` is the engine's historical maturity, **fixed per segment** (a freshly-verified engine ≈ 0.2 leans on the live estimate; a well-sampled engine ≈ 1.0 strongly anchors the noisy early frames, killing the surge). New pure helper `decay_segment_eta()`; new cheap reader `app.db.performance.engine_sample_count`. Only the emitted segment ETA changes — the §4A.3 chapter ETA composition still reads the raw observed value, so the chapter path is unchanged.
- **Per-segment confidence (§4A.10 / B12).** `segments.progress` frames carried the chapter-level `eta_confidence`, which legitimately rises across the whole chapter and never resets — so every segment showed the same climbing number (seg 0: 0.20→0.77, seg 5: 0.79→0.97). They now carry the per-segment `seg_confidence` (from the segment-keyed ring, surfaced via `active_segment_eta_confidence`), resetting per `segment_id`; a saved segment reports `1.0`. The correct per-segment value was already computed for the §4A.3 composition but was discarded for the wire frame.

Specs: `progress-presentation.md` → 1.5.0 (§4A.10, invariants B11/B12); `live-events.md` → 1.6.0 (segment payload semantics). All new tests R1 revert-checked.

### "Rebuild Audio" now actually re-renders everywhere (force_rerender parity)

The explicit Rebuild action is meant to delete the existing render and re-synthesize from scratch, never reusing cached segment audio. Two paths didn't honor it:

- **Bake handlers ignored `force_rerender`.** `handle_xtts_bake` / `handle_voxtral_bake` decided per-group reuse purely on file-presence + `audio_status=="done"`, with no `force_rerender` short-circuit (the standard path already had one via `_group_is_done`). A rebuild routed through the bake path (chapters with pre-baked segments) could re-stitch stale audio instead of re-rendering. Both `_group_needs_render` functions now return `True` unconditionally when `j.force_rerender` is set, mirroring the standard path.
- **Project-list "Rebuild Audio" button did a plain queue.** In the Project chapter list the action relabels to "Rebuild Audio" once a chapter is fully rendered, but it called `handleQueueChapter` with no reset and `force=false` — so it reused everything and re-rendered nothing. It now resets the chapter (deletes audio + marks segments unprocessed) and queues with `force_rerender=true`, behind a destructive-confirm, matching the Studio chapter view's Rebuild. Plain "Queue Chapter" / "Queue Remaining" are unchanged: they still preserve existing segment WAVs and only render gaps (the Book list's honestly-labeled "Queue Chapter" + separate "Reset Audio" was already correct and is untouched).

R1-verified tests added/updated for both bake handlers and `handleQueueChapter`.

### Cancelled render can no longer resurrect segment audio (lost-update race)

Chapter reset (and "Rebuild") cancels the active render, then clears the chapter's segments to `unprocessed`. But cancellation is cooperative: the engine subprocess keeps emitting `[SEGMENT_SAVED]` for its in-flight segment until it stops. Those straggler saves were re-marking segments `audio_status="done"` *after* the reset committed, so the next render saw every group "done" and reused stale audio instead of re-synthesizing (seen as a no-synthesis re-stitch).

**What changed (`docs/specs/queue-jobs.md` → 1.3.0, invariant I17):**

- `orchestrator.cancel()` now synchronously detaches the cancelled task's engine-log listener (right after `on_cancel()` sets the cancel flag), so straggler output stops reaching the orchestrator the moment the user cancels.
- Both `[SEGMENT_SAVED]` → `audio_status="done"` write sites — the orchestrator `log_listener` and the xtts handler's `chapter_on_output` — now drop the write while the task is cancelled. A save that races the listener detach is still ignored.

This complements the earlier `force_rerender` fix (which made the explicit Rebuild action authoritative) by fixing the underlying race for *all* reset flows (chapter text edit mid-render, clear-audio, etc.). Prompt subprocess-stop (so cancel also stops wasting compute) is tracked as a follow-up (spec G6).

## [Docs] - 2026-06-18

### Progress-routing unification — single-source contract at the event-builder layer

Shipped the complete §4A progress contract. `docs/specs/progress-presentation.md` bumped to 1.4.2; `docs/specs/live-events.md` bumped to 1.5.2.

**What changed:**

- **Single-source `enrich` kernel.** `ProgressService.enrich()` is the one RLock-guarded function both emit paths (orchestrated Path A via `ProgressService.publish`, and handler-direct Path B via `broadcast_job_updated`) call before building events. The event builders in `app/api/contracts/events.py` are the contract authority. The old `compute_progress_confidence` echo (which set `confidence = progress`) is deleted; builders now fail loudly if a progress-bearing frame arrives without an enriched `confidence`.
- **Numeric ETA confidence (§4A.2).** `eta_confidence ∈ [0,1]` is now a three-term metric (variance × completion × freshness) that rises monotonically toward completion. A cold-start maturity factor prevents overconfident estimates when few velocity samples exist.
- **Cold-render ETA (§4A.8 + §4A.4).** Frames that carry no observed ETA (cold render, no throughput yet) now emit a non-null, bounded ETA computed from `remaining_chars × seconds_per_char` (bootstrap `DEFAULT_BASELINE_ENGINE_CPS`), crossfaded toward the observed ETA as render velocity accumulates. The mechanical ceiling (`apply_eta_ceiling`) bounds the result.
- **Share-weighted composition (§4A.3).** When an active segment reports its own ETA with high confidence and covers the dominant remaining share, the chapter ETA blends toward it — not multiplied.
- **Snapshot enrichment (PI6).** `jobs_snapshot` and running-queue row serializers call `enrich(sample=False)` — read-only enrichment without mutating the ETA ring — so hydration frames carry the same §4A values as live frames.
- **LOADING_MODEL UX (§2.6).** During the model-load window (status `preparing`, before the first engine marker), the backend emits `indeterminate: true` + `reasonCode: "LOADING_MODEL"`. The frontend renders a pulsing indeterminate bar and "loading voice model…" copy; reverts to determinate on the next frame.
- **Two-layer floor clarification (§2.5).** Documented that the server `enrich` provides monotonically-clamped values while the client `progressMemory` is the display floor authority — the two layers are complementary, not contradictory.
- **New ADR-0012** (`docs/decisions/ADR-0012-enrich-kernel-at-event-builder-layer.md`) records the problem, rejected alternative (`broadcast_job_updated` as chokepoint), D7 lock hierarchy, and consequences.
- Five superseded progress plans marked at their heads. See `plans/progress_routing_unification/02-plan-reconciliation.md`.

---

## [Docs] - 2026-06-14

### Wiki refresh: Studio 2.0 site redesign (R1–R6)

Updated wiki pages to match the shipped Studio 2.0 UI redesign. All navigation, page structure, and workflow references have been corrected.

**What changed in the app:**

- **Left-rail navigation** replaces the old top navigation bar. Four groups: CREATE (Library, Voices), MONITOR (Activity), PLATFORM (Engines, Integrations), MANAGE (Settings).
- **Book pipeline** replaces the old project/chapter tabbed view. Opening a book navigates to `/book/:id/<stage>` with five stage tabs: Manuscript, Casting, Studio, Review, Publish. Legacy `/project/:id` and `/chapter/:id` URLs redirect automatically.
- **Engines and Integrations** are now dedicated pages under PLATFORM in the rail, not tabs inside Settings. Settings is now thin: General, About, and Developer (when Developer Mode is on). Legacy `/settings/engines` and `/settings/api` URLs redirect automatically.
- **Voices catalog** (`/voices`) shows cards for all voices. Clicking a card opens the **Voice Lab** (`/voices/:id`), a full-page per-voice editor. The old accordion-only layout is gone.
- **Casting stage** holds the narrator default (pinned first row) per book. There is no global default narrator in the Voice Library.
- **Global Player Bar**: A full-width bottom dock handles all audio playback across every stage. It replaces VCR controls and inline players in the chapter editor.
- **Activity page** (`/activity`) is a dedicated MONITOR destination for queue depth, job history, and production statistics.
- **Queue Drawer**: Still accessible from the top bar button on every page for a quick glance without leaving your place.

**Pages updated:** Home, Getting-Started, Library-and-Projects, Voices-and-Voice-Profiles, Settings, Queue-and-Jobs, Concepts, Troubleshooting-and-FAQ, Live-Demos.

**Screenshot recapture list** (images in `wiki/images/` that no longer match the shipped UI):

| Image file | Old content | New route to capture |
|------------|-------------|----------------------|
| `images/demoproject.png` | Old library card layout | `/` (Library page — new card grid) |
| `images/demochapters.png` | Old project chapters tab | `/book/:id/manuscript` (Manuscript stage) |
| `images/demovoices.png` | Old voices tab in project | `/voices` (Voices catalog page) |
| `images/project-view.jpg` | Old project-detail page | `/book/:id/manuscript` (chapter list with Status Orbs) |
| `images/characters-tab.jpg` | Old characters tab in project | `/book/:id/casting` (Casting stage) |
| `images/chapter-editor.jpg` | Old chapter editor (full page) | `/book/:id/studio` (Studio stage) |
| `images/queue-sidebar.jpg` | Old queue sidebar layout | Queue Drawer (top bar button) or `/activity` |
| `images/voice-lab-list.jpg` | Old accordion voice list | `/voices` (Voices catalog grid) |
| `images/voice-card-expanded.jpg` | Old expanded voice accordion card | `/voices/:id` (Voice Lab page) |
| `images/settings-tray.jpg` | Old settings page with Engines/API tabs | `/settings` (thin Settings — General/About/Developer) |
| `images/launch-screen.jpg` | Verify still accurate | `/` |
| `images/new-project.jpg` | Verify still accurate | New book creation flow |

Screenshots embedded inline in wiki pages were removed where the referenced image content is now outdated; the image files remain on disk pending new captures by the owner.

---

## [Docs] - 2026-06-11

### Wiki accuracy pass (W5–W20)

- Settings.md: removed nonexistent global Voxtral settings from General section; corrected Stability Mode name; added API tab, About tab, and Default Engine/Voice sections; added Voxtral pointer under TTS Engines.
- Troubleshooting-and-FAQ.md: corrected Voxtral enable steps to use TTS Engines tab; replaced nonexistent "Performance tab" reference with Script view.
- Library-and-Projects.md: added Assemblies and Backups tab sections; documented hold-to-skim, seek slider, and keyboard shortcuts for VCR playback; fixed image caption.
- Getting-Started.md: reframed demo library restore as automatic on any fresh install, not Pinokio-only.
- Queue-and-Jobs.md: added voice_build and voice_test job types; clarified baking as a flag; expanded websocket topics table from 6 to all 10 stable topics plus plugin namespace; softened lifecycle ordering to documented-intent.
- Voices-and-Voice-Profiles.md: added per-voice plugin settings workflow section.

## [2.0.12] - 2026-06-11

### Highlights

- **Dark Theme**: Settings > General now has a Theme selector (System / Light / Dark). System follows your OS preference live. The whole UI switches through semantic design tokens, so every page, the queue, and the chapter editor invert together with no flash of the wrong theme on load.
- **Developer Mode**: A toggle in Settings > General reveals a Developer tab linking the internal testing pages (progress-bar harness, live event stream, design spec sheet, TTS API docs) and enables the debug copy buttons in the chapter toolbar and queue items. Off by default.
- **Honest Segment Timing**: A segment now announces itself as "Preparing engine..." with no countdown while the engine loads its model; the ETA clock and progress pacing start only when the engine confirms synthesis has begun. Model-load time no longer pollutes segment estimates, which fixes mixed renders showing wild ETAs during the roughly 19-second XTTS model load per group.
- **Consistent Group Counters**: Render-group counters read as a 1-based position (1/4 through 4/4) on both segment and chapter frames. Previously one surface counted from 0 while another counted completed groups, which looked like an extra phantom group.
- **Output Quality Checks**: Engines can validate their own rendered audio. XTTS rejects output whose implied reading speed is impossibly fast for the text (a truncation symptom); rejected renders are discarded and the job fails with the engine's reason shown in the queue. Configurable per engine (`Max Plausible Speech Rate`, 0 disables).
- **Per-Engine Text Cleanup Categories**: Text sanitization is now split into named categories (quotes, acronyms, fractions, dashes, punctuation spacing, ASCII, terminal punctuation). Engine manifests declare which categories apply, and each declaring engine gets per-category override toggles in its settings, so engines that use brackets or braces for emotion cues can keep them.
- **Voice Lab Demo Stage + Design Spec Sheet**: The interactive demo gained a `voice-lab` stage (real NarratorCards in their key states) and a `#/styleguide` page: an auto-generated token registry, type-scale proposal, component specimens, and mockups of proposed design directions, viewable in light and dark side by side.
- **Mobile Navigation**: At narrow widths the navigation collapses behind a burger button with a slide-in drawer; the chapter editor stacks its columns below 1100px; wide tables scroll horizontally instead of overflowing.
- **Security**: All dependency advisories cleared (react-router 7.17, vitest 3.2.6, plus transitive fixes); `npm audit` reports zero vulnerabilities.

## [2.0.11] - 2026-06-11

### Highlights

- **Interactive Demo on GitHub Pages**: A separate Vite build entry (`npm -C frontend run build:demo`) outputs the real production React components to `docs/demo/`, served under `/audiobook-studio/demo/`. The demo mounts the Global Queue, PredictiveProgressBar, and Live Output Table against a scripted render session replayed through the app's pub/sub bus, with no backend required. Four stages are available: `live-output`, `queue`, `progress`, and `voice-lab`; deep-link via `#/stage/<id>`. The showcase page (`docs/v1.html`) now features a prominent "Try the Interactive Demo" CTA card and an iframe embed of the live-output stage. The `docs/index.html` nav links to both the showcase and the new demo. See [wiki/Live-Demos.md](Live-Demos) for stage deep-links and rebuild instructions.

## [2.0.10] - 2026-06-11

### Highlights

- **No Frames After Terminal (Backend Guarantee)**: The websocket broadcast layer now enforces a per-job terminal latch: after a job reports `done`, `failed`, or `cancelled`, no stale non-terminal frame for that job can reach the UI on any topic. Requeued jobs (`queued`/`preparing`) unlatch and stream normally. This makes the frontend's failure-suppression rules defense-in-depth instead of load-bearing and prevents the class of bug where a trailing progress frame re-mounted UI the app had just cleared.
- **Settings-Keyed Engines Stay Ready Everywhere**: Every engine readiness check now flows through one shared settings-aware helper. Engines whose `check_env` needs persisted settings (Voxtral's Mistral API key) no longer report "needs setup" after installing dependencies or when installed as pip plugins; the last two call sites that checked the environment without settings are fixed.
- **Reference-Cloned Voices Always Resolve**: Bridge synthesis requests now derive the voice profile directory from the profile name automatically, so engines that resolve reference audio from the profile folder work on every render path (the remaining XTTS non-script paths were still missing it). The XTTS server engine's hidden fallback into Studio storage was removed; voice inputs come exclusively from the request.
- **Completed Renders Can No Longer Flip to Failed**: All post-success bookkeeping (performance-sample recording, synthesis-duration persistence, timing derivation) is now failure-isolated at every dispatch path. A metrics or state-store error after a successful render is logged and skipped instead of converting the finished job to failed.
- **Renders Survive TTS Server Restarts**: Engine registry lookups now serve the last-known-good plugin manifests when discovery transiently fails (e.g. while the watchdog restarts the TTS server), instead of resolving valid engines to nothing mid-render ("Voice requests must include engine_id" / "No valid segment audio was available to stitch").

## [2.0.9] - 2026-06-11

### Highlights

- **WAV-First Chapter Synthesis**: Ordinary chapter renders now always finish as WAV. The hidden in-lifecycle MP3 conversion (and its `finalizing` status phase) has been removed from the XTTS and Voxtral engines; MP3 is produced only by explicit export/assembly actions or by format requests on the external TTS API.
- **MP3 Voice Previews**: Voice samples and previews now follow the standard pipeline: synthesize as WAV, then automatically convert to `sample.mp3` and remove the WAV (with WAV kept as a fallback if conversion fails). Preview URLs prefer the MP3, and exported voice bundles now always carry their `sample.mp3`.
- **Queue Row Authority**: The live queue now treats `queue.items` websocket frames as the single authority for queue rows. Progress and voice-test events can only update live overlay fields (progress, ETA, active segment) on rows that already exist; they can no longer create phantom rows or change a row's status.
- **Voxtral Voice Previews Fixed**: Testing a Voxtral voice no longer fails with "Voxtral jobs require project and chapter context"; voice previews render into the voice profile like other engines.
- **Accurate Segment Counts**: The source-text analysis footer, character sidebar, and the script-view Numbers toggle now show true render groups (the engine-sized text blocks that actually render) instead of sentence counts, served by a new read-only `render_groups` endpoint.
- **Mixed Render Metrics**: Mixed renders now record the true rendered-segment count in performance history instead of a fallback.
- **Chapter Editor Polish**: Removed the redundant status pill inside segment progress bars; the script view shows "Narrator" instead of a blank speaker column when no speakers are assigned.

## [2.0.8] - 2026-06-09

### Highlights

- **Enabled Segment Progress Predictive Interpolation**: Enabled predictive ticking animation and smooth interpolation (`predictive: true`) for segment progress bars in the Chapter Editor, so progress advances continuously between socket events.
- **Disabled Segment Progress Backward Regressions**: Enforced strictly monotonic forward progress (`allowBackwardProgress: false`) on segment progress tracking to prevent visual jumps or regressions from minor backend updates.

## [2.0.7] - 2026-06-08

### Highlights

- **Queue Rows Survive Reloads Across More Job Types**: Bake, segment-generation, voice build/test, mixed-render, and audiobook assembly jobs now use durable queue rows consistently, so active and completed work remains visible after refresh. Split-part chapter queue items also preserve their requested part number when display metadata is added.
- **Voice Test Event Streams Carry Job Identity**: Voice preview/test telemetry now emits on `voice.test` with a required job id while the actual queue row remains on `queue.items`, which makes the live queue, diagnostics, and event stream easier to reconcile.
- **Voice Previews Are WAV-First**: Voice preview generation now writes and serves `sample.wav` on the active path. MP3 generation remains an explicit export/download concern instead of a background preview side effect.
- **Mixed Rendering Uses The Shared Queue Completion Path**: Mixed rendering no longer writes directly to the queue table during completion, reducing drift between persistent queue state and live job updates.
- **Chapter Editor Segment Progress Is Segment-Only**: The Chapter Editor Segment Progress bar now renders only from active segment progress events or preserved segment progress provenance. Chapter progress, queue progress, render-batch progress, and terminal job completion no longer leak into the per-segment bar.
- **Segment Progress Starts Visibly At 0%**: Segment progress now routes through a dedicated progress-bar contract helper. Segment handoffs show the incoming `START_SEGMENT` 0% update immediately, then locally animate between exact plugin progress updates without ETA prediction or confidence-scaling the visual target.
- **Segment Progress Uses Segment ETA and Monotonic Movement**: Segment progress events now preserve their segment-support capability and active segment ETA through the frontend consumer. The Chapter Editor segment bar uses that segment ETA, defaults new segment starts to a two-minute estimate when no explicit ETA is present, and does not move backward within a segment.

## [2.0.6] - 2026-05-30

### Highlights

- **Replaced Fake Engine Speed Badge With Real Calibration Summary**: Removed the misleading `x Speed` engine badge derived from the fixed `16.7` baseline and replaced it with real calibration metadata on the Settings engine cards. Engine registry responses now expose the current calibration window count and earliest sample date, and the UI shows `N.N characters/sec, from X samples since M/D/YYYY` using the actual filtered calibration history.
- **Restored Computed CPS Display In Engine Settings**: Engine registry responses now inject the derived `computer_speed_multiplier` back into each plugin's `current_settings` payload from the calibrated SQLite metrics, so the read-only Settings form shows the computed characters-per-second value instead of falling back to "Not yet computed."
- **Restored Batch-Scoped Chapter Header Text Progress**: Fixed Chapter Editor script progress lettering so active render-batch progress is distributed across the full batch text even when only the current span is flagged as actively rendering. This keeps top-bar-driven batch progress aligned with the visible book-mode text overlay.
- **Fixed Post-START_SYNTHESIS Status Rollback**: Prevented active jobs and chapters from rolling back from `"running"` to `"preparing"` due to subsequent 0% progress events (such as segment initialization).
- **Disabled Startup Verification Synthesis**: TTS Server plugin discovery and refresh now load plugins without running plugin `run_test()` synthesis, preventing `test_output.wav` generation and `[START_SYNTHESIS]` chatter during normal chapter renders. Normal synthesis now fails closed unless the plugin has already passed verification, while explicit engine verification from Settings still runs the plugin test.
- **Enforced Status Coercion**: Coerced `"preparing"` status updates back to `"running"` in both database synchronizations (`OrchestratorHelpersMixin._publish`) and websocket emissions (`ProgressService.publish`) once synthesis has already started.
- **Event Stream Preset Alignment**: Verified the Event Stream preset mappings on the frontend (`main-queue` preset does not list `segments.progress`, and `segment-state` is focused on segment-scoped topics), supported by unit tests.
- **Hardened Queue/Segment Consumer Isolation**: Main queue consumers now reject rogue active segment fields from `queue.items`, terminal lifecycle/queue events explicitly clear stale segment state, and segment-capable chapter jobs no longer get classified as segment child jobs.
- **Fixed Segment Timing Corrections**: Segment ETA-only updates are emitted instead of being coalesced, stale-timestamp segment frames preserve segment ETA/basis/update anchors, and synthetic segment handoff completions now emit `SEGMENT_SAVED`.
- **Persisted XTTS Synthesis Duration**: XTTS bridge synthesis now reports measured `duration_sec`, allowing `generate_via_bridge()` to persist `synthesis_duration_seconds` before post-render metric training. This prevents successful renders from flipping to failed during `record_engine_sample()`.
- **Preserved Null Segment ETA Semantics**: Segment websocket consumers no longer coerce `etaSeconds: null` into `0`, preventing `START_SEGMENT` and `SEGMENT_SAVED` frames from creating false zero-ETA progress lanes.

## [2.0.5] - 2026-05-29

### Highlights

- **Decoupled Segment Timing from Job/Chapter State**: Completely isolated segment-level timing (`eta_seconds`, `eta_basis`, and `started_at` / `startedAt`) updates in `segments.progress` frames from mutating overall job-level fields in `useJobs.ts`, preventing segment timing from interfering with chapter/job timers.
- **Enhanced Segment Progress Debug Provenance**: Updated `segmentProgressSocketProvenance` to capture the segment-level ETA in `active_segment_eta_seconds` and raw segment startedAt in `selectedFields.started_at` for debugging and UI coordination without mutating job state.
- **Cleaned Up wsAudienceForType Classification**: Removed redundant classification checks for segment topics in `runtimeDebug.ts`, letting them fall back to standard non-queue/non-both `'chapter'` classification (verified as not queue and not both in tests).

## [2.0.4] - 2026-05-26

### Highlights

- **Removed Synthetic 99% Segment Completion Blip**: Previous-segment completion events now emit `progress: 1.0` instead of the legacy synthetic `0.99`, preventing a completed segment from visually dropping back to 99% after the real `segment_saved` frame.
- **Expanded Chapter Editor Segment Progress debug payload**: Expanded the Segment Progress bar debug telemetry in useChapterStatus to capture the exact raw socket event kind, raw envelope frames, ignore lists, mismatched job flags, and exact render props passed to PredictiveProgressBar.
- **Improved Clipboard Copy Debug Payload**: Exposed `segmentProgressBarDebug` directly inside the `render` section of the clipboard copy JSON payload.
- **Persistent Segment Progress Telemetry**: Added `lastTelemetryRef` to ensure the debug state survives unmounting of the visual progress bar, clearly marking whether the telemetry is currently active or persisted after unmount.

## [2.0.3] - 2026-05-25

### Highlights

- **Fixed Chapter Editor Segment Progress Highlights**: Resolved the segment progress highlighting mismatch by tying progress calculations strictly to the canonical segment progress source (without `liveBarSegmentProgress` fallback).
- **Added Standalone Rendering Span Support**: Enabled rendering of segment-local progress for standalone spans (spans not belonging to any batch) by mapping progress directly to the active span ID.
- **Prevented Silent Batch-Wide Progress Fallback**: Prevented rendering spans from silently falling back to batch-wide progress when `activeSegmentId` is provided but is not part of the active batch (ensuring mismatching spans remain 0% lit).
- **Expanded Clipboard Copy Diagnostics**: Added `activeSegmentRenderSource`, `activeSegmentResolvedToBatch`, `activeSegmentResolvedBatch`, and `canonicalSegmentProgressSource` to the copied debug snapshot in `ChapterEditorPage`.
- **Added ScriptView Debug Diagnostics**: Expanded the debug snapshot `useEffect` hook in `ScriptView` to record detailed per-span diagnostics (`spanId`, `spanIndex`, `textLength`, `litCount`, `showCursor`, `progressValueUsed`, `activeSegmentId`, `resolvedSource`) for both batched spans and standalone rendering spans.

## [2.0.2] - 2026-05-20

### Highlights

- **Stabilized XTTS Progress and ETA Projection**: Fixed a bug where progress regressions inside the XTTS standard handler caused the projected ETA to jump erratically. The orchestrator helper's `_get_grouped_progress` calculation is now strictly monotonic by tracking and clamping to the maximum progress seen so far during a task dispatch run, and the database `update_job` ETA projection now correctly uses the clamped/monotonic progress value.
- **Increased Synthesis Read Timeout**: Increased the synthesis HTTP client read timeout (`_READ_TIMEOUT`) from 60 seconds to 300 seconds to prevent slow synthesis operations (e.g., long chapters or CPU/GPU load spikes) from timing out and failing jobs at the end of the run.
- **Added Monotonic Progress & Timeout Regression Tests**: Added unit tests to `test_state_rules.py`, `test_watchdog_progress_logic.py`, and `test_tts_client.py` verifying that database-level ETA calculations, log-listener progress reporting, and read timeouts are robust.
- **Added Caller Stack-Walking for Websocket Progress Traceability**: Updated `update_job` and `ProgressService` to accept and automatically resolve the true caller's stack frame via stack walking. Websocket payloads now include the calling backend function or trigger callsite as the `source` attribute, allowing full queue chatter and progress updates to be traced back during frontend diagnostics and debugging.
- **Fixed Premature Segment Progress Jump at Startup**: Resolved an issue where initial engine progress logs (like `[PROGRESS] 100%`) before the first segment started caused `active_segment_progress` to jump to `1.0` while `active_segment_id` was still `None`. Handled by restricting segment progress updates in the orchestrator helpers to only when an active segment is running, and implementing state normalization in `update_job` to force segment and batch progress values back to default when their respective IDs are `None`. Added a new regression unit test to verify this normalization rule.

## [2.0.1] - 2026-05-19

### Highlights

- **Eliminated "finalizing" Job Status**: Sanitized all references to the legacy `"finalizing"` status throughout the backend. The database, orchestrator helpers, and progress service now automatically map any incoming `"finalizing"` status to `"running"` before persistence and websocket broadcasting.
- **Fixed Legacy Task Translation**: Fixed a translation bug in the legacy job shim (`_context_to_job`) where custom title and narrator metadata were not correctly mapped, resolving audiobook title fallback to filename during assembly.
- **Integration Test Robustness**: Made the audiobook assembly integration test robust to positional and keyword calling patterns.

## [2.0.0] - 2026-05-11

### Highlights

- **Studio 2.0 Modular Architecture**: Migrated to a decoupled plugin-based architecture where engines (XTTS, Voxtral) operate as independent services through a unified bridge.
- **Unified Settings Experience**: Redesigned the Settings interface with dedicated tabs for General, TTS Engines, About, and API, featuring a schema-driven engine configuration system.
- **Engine Registry & Fallback**: Implemented a robust engine registry that supports both remote TTS Server plugins and local in-process fallbacks, ensuring reliability even when the server is unavailable.
- **Plugin Manifest Diagnostics**: Studio now validates the `studio_tts_manifest` contract and callable references for TTS plugins, surfaces parseable manifest errors as `invalid_config`, and keeps runtime plugin crashes isolated from healthy engines.
- **Plugin Developer Scenario Validation**: Studio now validates developer scenario fixtures before the Settings UI consumes them, returning actionable errors for malformed JSON, missing fields, and invalid scenario shapes.
- **Production Tally & Diagnostics**: Added real-time production statistics and runtime diagnostics to the About panel for better visibility into system performance and health.
- **Version Migration**: Completed the transition from the 1.8.x release line to the 2.0.0 baseline with consistent branding and metadata across all surfaces.
- **Global Queue UI Alignment**: Fixed a regression in the job history display where a colon was used instead of an arrow symbol, restoring consistency with validation tests and improving history legibility.

## [1.8.5] - 2026-04-06

### Highlights

- **Chapter Content Clears Now Save Successfully**: Fixed a bug where deleting all text in a chapter (or clearing its title) failed to save because the API layer coerced empty strings to `None`. The update endpoint now explicitly checks for field presence in the form data to ensure intentional "empty" updates are persisted.
- **Large Chapters No Longer Fail to Save**: Removed the `keepalive` attribute from the frontend's chapter save request, which was causing chapters larger than ~64KB to be silently blocked by browser payload limits.
- **Save Operations Are Now Instant**: Rewrote the database segment sync logic to use bulk insertion (`executemany`) instead of sequential inserts. Saving a massive chapter now completes in milliseconds instead of seconds.
- **Background Processes No Longer Stall the App**: Moved database bulk operations and text tokenization outside the global database lock, preventing the backend from freezing other requests (like progress polling) while a large chapter is saved.
- **Increased Text Analysis Ceiling**: Raised the limit on the text analyzer endpoint from 1,000,000 to 5,000,000 characters to better support massive document inputs.
- **Python Compatibility Cleanup**: Replaced modern union type hints (`|`) with `typing.Optional` and `typing.Union` in the core configuration and database modules, resolving startup crashes in environments running older Python versions.
- **Automated Regression Coverage for Empty Saves**: Added test cases to the backend suite to ensure that clearing chapter fields through the API remains functional in future updates.
- **Unified Onboarding Funnel**: Streamlined installation paths across all surfaces (Pinokio, wiki, README) to make the onboarding process clearer for new users.
- **Windows Architecture Hardening**: Implemented self-healing Python environment logic for Pinokio/Conda, hardened `run.ps1` for robust environment provisioning, and updated the Windows start script for better compatibility.
- **Demo Bundle Restoration Fix**: Fixed an issue on macOS/Linux where the demo bundle restore executed in the wrong directory context.

## [1.8.4] - 2026-03-31

### Highlights

- **Predictive Queue Progress Finally Feels Continuous**: Grouped chapter jobs now keep local progress motion between websocket updates, ETA corrections ease toward new checkpoints instead of hard-snapping, active bars keep width transitions enabled even for larger corrections, and the queue/project bars now stay aligned with weighted render-group progress instead of getting dragged around by a single active segment.
- **Progress Instrumentation Was Cleaned Back Out After Validation**: The temporary websocket/progress debug logging used to tune the predictive bar has been removed again, and the progress-bar component now includes comments documenting the intended floor-vs-motion behavior so future updates are less likely to accidentally reintroduce snapping.
- **Backend Helper Regressions That Broke Test Validation Are Fixed**: Audiobook metadata probing and ffprobe duration parsing now tolerate mocked subprocess output correctly, command-stream readers now handle both byte and string chunks, and the backend suite no longer fails the affected `list_audiobooks`, command-stream, and audio-duration tests because of hidden type assumptions.
- **Test-Safe Database Path Handling Is More Robust**: Database connections now resolve the current `DB_PATH` dynamically, and test-mode safety checks still block obvious production paths while allowing the temporary DB locations the repo’s isolated/surgical validation tests actually use.
- **Changed-File Push Validation No Longer Breaks On Deleted Frontend Files**: The changed-file pre-push validator now skips removed frontend paths before handing them to ESLint or related-test selection, so cleanup work like deleting debug helpers no longer aborts a push with `No files matching the pattern ...`.
- **Project And Chapter Voice Overrides Now Actually Persist**: Voice selection changes from the project page and chapter editor are now saved through the API, survive refreshes, and correctly clear back to the inherited default when you choose the default option again.
- **Fallback Voice Labels Are Much Clearer**: Default voice options now show the actual effective fallback voice in parentheses using the same display-name logic as the rest of the voice picker, so users can see what “Default Speaker” or “Use Project Default” will really use.
- **Voice Queue Labels Are Much More Descriptive**: Voice preview/rebuild jobs and other standalone queue work now carry clearer titles and engine-specific context instead of falling back to generic `System Task` / `Internal Process` labels, so the queue is easier to scan while voice work is running.
- **Chapter Queue Progress Is Less Jumpy And More Honest**: XTTS chapter jobs now fold live segment updates into whole-job progress instead of treating raw segment percentages like chapter percentages, so the global queue stays aligned with chapter completion while segment views can still show segment-level progress.
- **Chapter And Segment Progress No Longer Fight Each Other**: Websocket updates now separate chapter-level job progress from live segment progress, which lets the global queue follow whole-chapter completion while Performance cards track the currently rendering segment directly.
- **Chapter Progress Now Follows Actual Chapter Segments**: XTTS chapter jobs now weight progress by the real number of chapter segments being completed instead of by internal synth-group count, so queue/project overview progress behaves like `segment 2 of 4` even when adjacent segments are merged into one XTTS pass under the hood.
- **Voxtral Regenerate No Longer Gets Stuck Acting Like Play**: Regenerating a Voxtral preview now behaves like a true rebuild action, without trying to auto-play audio before the new preview exists or leaving the button stuck in a play-state UI.
- **Windows README Startup Is Much More Forgiving**: The PowerShell launcher now checks more standard Windows Python install locations before relying on the Pinokio/conda bootstrap path, a failed conda bootstrap no longer hard-aborts local installs that should fall back to a normal Python setup, the launcher/docs now match the app’s actual Python 3.11+ compatibility, and missing `npm` or `ffmpeg` now fails early with clearer install guidance instead of surfacing later as confusing runtime breakage.
- **XTTS Windows Reference Loading Is More Reliable**: XTTS voice conditioning now reads plain WAV reference clips without depending on TorchCodec’s FFmpeg DLL chain, and generated `sample.wav` previews are no longer accidentally reused as source training references during later renders.
- **Startup And First-Run Terminal Output Are Much Less Hidden**: The launcher, worker, and more one-shot subprocess paths now stop swallowing so much install, model-load, ffmpeg/ffprobe, and download output, which makes first-run XTTS setup and other long startup work much easier to follow from the terminal.
- **First-Run XTTS Downloads Are Easier To Understand**: Worker logging now surfaces more Hugging Face and model-download progress into the terminal, which makes long first-run setup look like active work instead of a silent stall.
- **PR Validation Is Faster Without Removing Main-Branch Protection**: The CI workflow now uses a quicker PR check path while still keeping full-suite backend and frontend validation available for mainline protection.
- **Frontend Voice-Workflow Tests Are Cleaner**: The focused `ProjectView` and `ChapterEditor` Vitest coverage now avoids React warning noise from test-only motion mocks and async tab loading, so regressions are easier to spot when these tests fail for real.

## [1.8.3] - 2026-03-30

### Highlights

- **Windows Startup And Pinokio Bootstrap Are Much More Reliable**: Fresh Windows installs now handle Python bootstrap, PowerShell argument passing, and XTTS subprocess output more safely, which fixes several startup and first-render failures that did not show up on macOS/Linux.
- **XTTS No Longer Rebuilds Its Environment On Every Launch**: The launcher now only resets the XTTS environment when it positively detects a stale legacy conflict instead of treating normal modern XTTS packages or generic probe failures as reasons to reinstall everything again.
- **Long First-Run XTTS Setup Is Much Easier To Understand**: Worker logging now surfaces more model loading, latent setup, synthesis start, segment start, and throttled render progress into the server terminal, so long prepare phases no longer look like silent hangs.
- **Direct Local Startup Is Less Fragile**: The launcher no longer hard-fails at startup just because `npm` or `ffmpeg` are missing from PATH when they are not immediately needed, which makes the README startup path work more cleanly outside the full Pinokio shell.

## [1.8.2] - 2026-03-30

### Highlights

- **Windows Startup Reliability Is Stronger**: Fresh Windows installs now handle Python bootstrap and XTTS startup more safely, which fixes several first-run failures that did not show up on macOS/Linux.
- **XTTS Environment Resets Are Less Disruptive**: XTTS startup is much less likely to thrash its environment on launch, and the path for detecting stale packages is more predictable.
- **XTTS First-Run Setup Is Easier To Understand**: Better terminal-side visibility now makes it clearer when XTTS is loading models, preparing caches, or beginning synthesis instead of looking like it has silently stalled.
- **Windows XTTS Subprocess Streaming No Longer Crashes**: XTTS jobs now avoid the Windows-specific subprocess pipe crash that came from Unix-style selector handling.

## [1.8.1] - 2026-03-30

### Highlights

- **Segment Repair And Playback Are Much More Trustworthy**: Displayed performance chunks now line up more closely across the frontend, backend, and playback flow, which fixes cases where generating one block could re-render the wrong block or play the wrong audio.
- **Project Render And Chapter Performance View Stay In Sync**: Full XTTS chapter renders now leave behind the same chunk audio that the chapter Performance tab expects, so opening a rendered chapter no longer immediately asks to regenerate blocks that were already produced.
- **Chapter Editing Invalidates Less Audio**: A local sentence edit now preserves later unchanged segment audio when it is still valid, while still invalidating shared chunk audio when a changed sentence would make that chunk stale.
- **Patch-Line Stability Sweep**: This release rolls up the smaller UX, queue, chunking, and segment-state fixes discovered after the 1.8.0 launch into a safer patch release.

## [1.8.0] - 2026-03-28

### Highlights

- **Engine-Per-Voice Is Now Production-Ready**: XTTS stays local-first, Voxtral remains an optional cloud engine behind Settings, and mixed-engine chapters now render through displayed performance chunks instead of fragile sentence-by-sentence artifacts.
- **Much Clearer Segment Workflow**: Performance and Production cards now show visible segment numbers, generated blocks render and play by displayed chunk, and queued segment jobs now carry titles like `overview: segment #13` so the global queue points to the exact block being processed.
- **Queue And Progress Recovery Hardening**: Queue refresh can now recover missing in-memory jobs and orphaned rows without an app restart, chapter-side cards track the active queued/running segment group more reliably, and preparing/running visuals behave more consistently across XTTS and Voxtral jobs.
- **Safer Cleanup And Chapter Deletion**: Chapter deletes now move associated text and audio artifacts into a project-level trash folder, chunk audio cleanup covers both legacy `seg_*.wav` and modern `chunk_*.wav` outputs, and ffmpeg helper manifests no longer leak stray `out_*.list.txt` or metadata files into the repo root.

## [1.7.0] - 2026-03-26

### Highlights

- **Best New-User Starting Point Yet**: This release is the first release line intended to feel clean for brand-new users from clone to first project, with launcher scripts, startup docs, chapter generation, voice portability, and download behavior all aligned.
- **One-Command Startup on macOS/Linux and Windows**: Added a real `run.sh` bootstrap flow, a Windows `run.ps1` launcher, and startup logic that can repair stale XTTS environments automatically when older conflicting Coqui packages are present.
- **Starter Voice Support**: Voice profiles with `latent.pth` and preview audio now remain usable without bundling every original sample wav, which makes lightweight starter voices practical to ship with the repo.
- **Narrator and Mixed-Voice Generation Fixes**: Fixed narrator generation in the chapter Performance tab and full mixed-voice chapter rendering when voices rely on latent-only conditioning instead of raw wav samples.
- **Clearer Chapter Queue UX**: Chapters with partial segment progress but no final chapter render now use `Complete` instead of `Rebuild`, so users are not warned about deleting audio when they only want to finish missing work.
- **Cleaner Audiobook Downloads**: Audiobooks can still keep unique internal filenames on disk, but downloads now use a cleaner title-based filename for the user.

## [1.6.0] - 2026-03-25

### Highlights

- **Safer Chapter Editing and Rebuild Flow**: Chapters that already have rendered output now use a clearer rebuild flow, including better destructive warnings, a `Rebuild` label when queueing would replace existing audio, and stale chapter audio that remains visible until you intentionally rebuild or reset.
- **Zero-Issue Security Hardening**: Completed a large CodeQL and filesystem hardening pass that reduced code scanning issues to zero, tightened path and file handling throughout the app, reduced stack-trace exposure in API responses, and improved trusted-root/trusted-enumeration behavior across project, chapter, and voice operations.
- **More Reliable Queue and Segment Recovery**: Stale segment `processing` states are now cleaned up automatically when no active job or queue item exists, queue/rebuild behavior is more predictable after interruptions, and chapter state recovery is more consistent after edits and partial generation.
- **Clearer Voice and Variant Handling**: Voice profile normalization and default variant handling are more robust, frontend variant labeling is more consistent, worker-side profile lookup is more resilient, and empty-sample validation now prevents invalid preview or rebuild attempts earlier.
- **Much Stronger Project Presentation**: The README, wiki, and live showcase were substantially upgraded to better explain Audiobook Studio’s local-first value, including a fair comparison with hosted voice generation, a practical full-length audiobook cost breakdown, and a significantly more polished mobile showcase experience.

## [1.5.1] - 2026-03-19

### Highlights

- **Queue, Progress, and Resume Flow**: Queueing now gives immediate optimistic feedback, then re-syncs after a short delay so fast-finishing chapters do not get stuck showing `processing`. Chapter and queue progress bars once again animate from live timing data, short segment bars linger long enough to visibly reach 100%, and Listen playback resumes only the segment you clicked instead of automatically prefetching the next group.
- **Voice Profile Safety and Clarity**: Empty voice profiles can no longer enqueue failing preview/rebuild jobs, failed voice jobs now mark the queue entry as failed, and production voice selection now prefers the intended base/default profile before falling back to variants. Variant labels are also shown more clearly throughout the UI, with base profiles using `Default` and existing drifted speaker metadata being repaired automatically.
- **Consistent Voice UI Behavior**: The voices screen now uses one hover language across play, speed, script, move, samples, and delete controls, with delete keeping the destructive treatment and the other actions sharing the app’s standard subtle hover state.
- **Production Editing and Stability**: Production queueing now keeps you in place with a clear queued/rebuild flow, duplicate generate clicks are ignored while segments are already pending, and chapter text edits invalidate stale audio more conservatively so shifted text does not keep old file links alive. The backend also gained stronger regression coverage, safer SQLite migration handling, faster XTTS cache checks, and a leaner compatibility layer.

## [1.5.0] - 2026-03-18

### Highlights

- **Portable Voice Profiles**: Voice profiles now travel with their latent cache and preview assets, so renaming or moving a voice keeps it intact instead of generating a new `.pth` file.
- **Shareable Voice Bundles**: Voice profiles can be exported and imported as a single bundle, which makes it easier to move voices between app users.
- **Faster App Load**: The home, projects, and jobs views now return quickly on first load instead of waiting on cleanup work or background reconciliation.
- **Consistent Voice Previews**: Voice builds now standardize on `sample.mp3` for smaller, more consistent preview playback.
- **Voice-Friendly Queueing**: Project pages now preselect an available voice profile so chapter queuing works without requiring extra setup.
- **Safer Queue Routing**: Chapters now use the segment-bake path only when there is already segment audio to assemble, avoiding immediate stitch failures on unrendered chapters.
- **Resume-Friendly Requeueing**: Re-queuing a chapter now keeps already-rendered segment progress intact so partial chapters can pick up where they left off.
- **Immediate Stale-Audio Cleanup**: Editing chapter text now clears old chapter audio and removed segment files right away so the project list and performance views stay in sync.
- **Shift-Safe Segment Sync**: When chapter text changes in the middle, all later segments now rebuild instead of inheriting stale audio from an earlier grouping.
- **Listen-and-Resume Playback**: Clicking Listen on a missing segment now shows active generation progress and automatically starts playback as soon as the render finishes.
- **Live Segment Progress**: Chapter and queue progress bars now reflect the active segment progress reported by the worker, so websocket updates are visible while a chapter is rendering.
- **Zero-State Progress Bars**: Progress bars now stay at 0% until a job is actually running, so queued/preparing jobs no longer jump ahead before rendering starts.
- **In-Page Queueing**: Queueing a chapter now keeps you on the chapter page so you can watch the segments render in place.
- **Safe Requeue Confirmation**: Fully rendered chapters now ask for confirmation before requeueing so you don’t accidentally wipe complete audio.
- **Clearer Rebuild Action**: Completed chapters now label the primary action as `Rebuild`, making it obvious when the button will clear and regenerate existing audio.
- **Clear Queue Feedback**: Queue actions now show an immediate inline success hint and synced `Queued` / `Rendering` badges in both the editor and project views.
- **Simplified Performance Controls**: Removed the redundant chapter bake button from the performance view and kept the queue flow as the single path for rendering missing segments.
- **Stronger Regression Coverage**: The backend test suite now exercises real state changes, queue behavior, and request flow, not just response codes.
- **Operational Guardrails**: Cleanup failures now surface as warnings, the SQLite migration path uses a safer transaction flow, and stalled tests fail fast instead of hanging silently.
- **Fast Voice Cache Checks**: XTTS voice profile fingerprints now use file metadata instead of reading full sample contents, which keeps latent validation lightweight for larger voice libraries.
- **Leaner Compatibility Layer**: Removed obsolete route aliases and legacy wrappers while keeping the compatibility shims that the current frontend still uses.

## [1.4.3] - 2026-03-18

### Highlights

- **Scoped File Access**: Audiobook, voice-profile, and analysis-report file handling now stays inside the intended project or voice directories before any disk access occurs.
- **Traversal Regression Coverage**: Added tests that exercise the new containment checks for audiobook deletion, voice sample deletion, and analysis report paths.
- **Reliable Job Reconciliation**: Job reconciliation now normalizes chapter text names to their stem before output lookup, preserving legacy/project-aware sync behavior while still rejecting traversal-style inputs.

## [1.4.1] - 2026-03-17

### Compatibility & Security

- **Legacy Route Restoration**: Reintroduced compatibility wrappers for the legacy API surface, including settings, chapter reset, preview, and delete flows, so older integrations and tests continue to work against the refactored routers.
- **Path Traversal Hardening**: Added filesystem boundary checks to legacy file-handling endpoints so chapter and voice-related operations stay inside their intended directories.
- **Schema Tightening**: Constrained the bulk segment-status update payload to valid chapter audio states to prevent invalid transitions from entering the database.

### Test Infrastructure

- **Test Isolation**: Switched API test modules to delayed client fixture initialization so environment setup completes before application imports resolve configuration.
- **Monkeypatch Hygiene**: Updated path-sensitive tests to use `monkeypatch`-driven overrides, preventing cross-test leakage from global directory changes.
- **Queue Contract Alignment**: Corrected queue tests to target the modern `/api/processing_queue` endpoints and use the proper reorder method.

### Performance & Stability

- **Status-Aware Progress**: Fixed a bug where the progress bar would animate prematurely during the model preparation phase; it now holds at zero until rendering actually begins.
- **Startup Resilience**: Enhanced queue reconciliation on server startup to correctly recover jobs stuck in 'preparing' or 'finalizing' states.
- **Improved Cleanup**: Hardened the audio segment cleanup logic to ensure stale files (including rogue segments) are thoroughly removed when re-queuing or clearing audio.

### Fixed

- **API Reliability**: Corrected the response contract for the queue mass-delete endpoint to return the `cleared` count expected by the test suite.
- **WebSocket Optimization**: Removed obsolete `log` fields from background broadcasts to reduce network overhead and improve UI responsiveness.
- **Cleanup Visibility**: Replaced silent cleanup failures with structured warnings, hardened UUID profile resolution, and made the voice-building UI clear stale state once the server job snapshot goes empty.
- **Surgical Audio Invalidation**: Changed segment-edit and segment-reset flows to clear only the affected chapter outputs and edited segment files instead of wiping every segment in the chapter.
- **Coverage Goal Met**: Raised backend test coverage to clear the project’s 80% threshold again after the API refactor work.

## [1.4.0] - 2026-03-13

### Architecture

- **Code Modularization**: Reorganized the backend into a `routers/` pattern for better maintainability and faster navigation.
- **Standardized Rules**: Added `.agent/rules.md` to enforce code quality and file size limits for future development.

### Performance & Stability

- **Non-blocking I/O**: Optimized file system interactions within the API layer to support higher concurrency.
- **Robust Analysis**: Integrated `sanitize_for_xtts` directly into the analysis pipeline to ensure "What You See Is What You Get" metrics for audiobook generation.
- **Structured Response Models**: Implemented Pydantic models for all major routes to provide a strict and documented API contract.

### New Features & Fixes

- **Global Queue ETA**: Added an "Approx. X minutes remaining" badge to the processing queue header that tracks cumulative work across all active and queued tasks.
- **Reliable Queue Reordering**: Fixed a timestamp inversion bug and implemented in-memory synchronization, ensuring the background worker strictly follows the UI priority.
- **Enhanced Progress Visuals**: Smoothed progress transitions to 2s ease-in-out for a more fluid and premium interface experience.
- **Locked-in Test Suite**: Added 11 regression tests covering ETA calculations, database joins, and in-memory queue synchronization logic.

### Security

- **Path Sanitization**: Implemented robust path traversal protection using `Path.resolve()` and `is_relative_to()` to prevent unauthorized file access.
- **Input Hardening**: Added stricter validation for text inputs and chapter file paths to prevent resource exhaustion.
- **Granular Exception Handling**: Refined the error handling logic to provide more descriptive feedback with specific HTTP status codes (403, 404, 422).
- **Safe Roots for File Lookups**: Scoped chapter, upload, and audio-path helpers to trusted root folders so user-controlled paths are normalized before disk access while preserving legitimate subdirectories inside those roots.

### Quality Assurance

- **Expanded Test Suite**: Added `test_api_analysis_extended.py` and front-end unit tests for the `StatusOrb` and `ScriptEditor` components.
- **Full Regression Testing**: Verified 100% pass rate across the entire test suite (181 tests) after the backend refactor.

## [1.3.0] - 2026-03-06

### Added

- **Integrated Status Orbs**: Replaced satellite dots with a cohesive, integrated outer ring for M4A and MP3 status.
- **Assembly History Redesign**: Overhauled the export list into a neutral "receipt" style timeline with per-item duration and storage totals.
- **M4B Duration Extraction**: Now extracts duration and title metadata using `ffprobe` for precise assembly information.
- **Safe Deletions**: Implemented descriptive confirmation modals for audiobook exports that include filename and creation date.

### Fixed

- **Pixel-Perfect Orbs**: Stabilized interior orb icons (Refresh, Alert, Error) with absolute centering to prevent "jumping" on hover.

## [1.2.0] - 2026-03-05

### Added

- **Status Orb Context Actions**: The chapter status orb now provides intelligent single-click actions based on its current state (e.g., "Rebuild Audio", "Queue Remaining").
- **Chapter Row Highlighting**: Implemented a subtle "row association" highlight (tint + outline) for chapter rows that persists while context menus are open.
- **Floating Drag Handle**: Replaced the permanent vertical grip with a compact, floating handle that appears on the left edge of the row only during hover, reclaiming horizontal space for titles.

### Fixed

- **Respect "Produce MP3s" Setting**: Fixed a bug where MP3 files were always generated regardless of the user preference.
- **Action Menu State Persistence**: Improved state tracking in `ActionMenu` to ensure row highlights remain active during menu traversal.

## [1.1.0] - 2026-03-05

### Added

- **Incremental M4B Assembly**: Implemented a caching system for chapter audio. Each chapter is now pre-encoded to `.m4a` format and cached; subsequent audiobook compilations skip encoding for unchanged chapters and perform a lossless concatenation, significantly reducing assembly time for long books.
- **M4B Browser Enhancements**: Restored and improved the M4B history view with cover thumbnails and a new kebab menu.
- **Chapter Selection "Select All"**: Added a "Select All" / "Deselect All" button to the project assembly view for easier chapter management.

### Changed

- **Optimized Deletion**: The audiobook delete feature now also cleans up associated thumbnail files and cached `.m4a` chapter encodes.

### Fixed

- **Assembly History UI**: Fixed a rendering error in `ProjectView` where assembly history would crash if the API returned a null result.
- **Linting & Tests**: Resolved remaining backend linting errors (E731) and verified 100% pass rate for both frontend and backend test suites.

## [Voice Lab Update] - 2026-03-02

### Added

- **Accordion Voice List**: Upgraded the Voices list to an accordion behavior where opening one Voice card automatically collapses others.
- **Unified Voice/Variant Model**: Standardized all narrator cards to follow a clear "Voice" (identity) and "Variant" (style) hierarchy.
- **Mini-Expansion Indicators**: Added a rotating chevron overlay and a "need update" indicator directly on the Voice avatar for a cleaner, more intuitive header.
- **Deep Deletion**: Implemented a "Delete Voice" action that cascades from the database to clean up all variant folders and original samples on disk.
- **Intelligent Auto-Expansion**: The Samples section now auto-expands when a variant has no audio and auto-collapses once built for a frictionless setup experience.
- **Variant Count Badge**: Displayed a variant count in the card header for voices with multiple stylistic variations.
- **Smart Variant Selection**: Selecting a variant tab in a collapsed card now automatically expands the card to show its details.
- **Streaming Build Status**: Added a "BUILDING..." status label that persists from rebuild click through sample generation for better real-time feedback.

### Changed

- **Terminology Normalization**: Migrated all internal and user-facing terms to "Voice" and "Variant" for consistency across the application.
- **Header Refresh**: Cleaned up the Voice card header by moving secondary controls (Speed, Script, Rebuild) into the expanded variant view.
- **Reversed Kebab Styling**: Updated the `ActionMenu` trigger to use a white background with a grey hover effect for better contrast.
- **Contextual Management**: Optimized the audio sample list by hiding delete buttons until row-hover, reducing visual noise.
- **Seamless Rebuild UX**: Eliminated status "flickering" during voice regeneration by maintaining building state until the preview is ready.

### Fixed

- **API Robustness**: Corrected backend endpoint returns and ensured cross-platform path handling for speaker profiles.
- **Unit Test Sync**: Updated all frontend unit tests to reflect the new DOM structure and interaction patterns.
- **Duplicate Voice Prevention**: Automated the creation and linking of profile directories when new speakers are added, ensuring immediate synchronization between the DB and disk.

---

[[Home]]
