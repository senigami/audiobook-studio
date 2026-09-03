# Test Audit: frontend/tests/unit/components (T3 scope, excluding queue/ and PredictiveProgressBar*)

**Date:** 2026-06-10  
**Auditor:** Claude Code (Sonnet 4.6)  
**Rubric:** VACUOUS / MOCKED-OUT / WRONG-SCENARIO / FRAGILE / REAL

---

## Classification Table

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| ProjectViewNavigation.test.tsx | switches to characters tab | REAL | keep | Fires click, asserts CharactersTab stub renders. CharactersTab itself stubbed (correct — not under test here). |
| ProjectViewNavigation.test.tsx | switches to assemblies tab | REAL | keep | Role-based assertion on heading. |
| ProjectViewNavigation.test.tsx | switches to backups tab | REAL | keep | Role-based assertion on heading. |
| ProjectViewNavigation.test.tsx | opens add chapter modal | REAL | keep | Triggers click, asserts modal text. |
| ProjectViewNavigation.test.tsx | opens edit project modal | REAL | keep | Triggers click by title, asserts modal text. |
| ProjectViewNavigation.test.tsx | enters assembly mode | REAL | keep | Asserts assembly-mode UI elements appear. |
| ProjectViewRendering.test.tsx | renders loading state | REAL | keep | Blocks promises to hold loading state; asserts loading indicator. |
| ProjectViewRendering.test.tsx | loads and renders project and chapters | REAL | keep | Asserts data rendered after load. |
| ProjectViewRendering.test.tsx | renders breadcrumbs when shellState is provided | REAL | keep | Asserts nav landmark and library label. |
| ProjectViewRendering.test.tsx | hides or labels predicted runtime as unavailable when calibrated_cps is unavailable | REAL | keep | Exercises real CPS logic path. |
| ProjectViewRendering.test.tsx | displays the correct predicted runtime when calibrated_cps is available | REAL | keep | Math: 334 chars / 33.4 cps ≈ 10s + 60s actual = 70s = "1m 10s". Verified correct. |
| ProjectViewRendering.test.tsx | displays predicted runtime based on calibrated_cps only | REAL | keep | Math: 300/10=30 + 60=90s = "1m 30s". Verified correct. FRAGILE on time format string — low risk. |
| ProjectViewSpeakerLogic.test.tsx | defaults the queue voice to the available profile | REAL | keep | `useProjectActions` is mocked but the UI logic that decides which voice to pass is exercised through the real component. |
| ProjectViewSpeakerLogic.test.tsx | allows clearing the chapter voice back to Default Speaker | REAL | keep | |
| ProjectViewSpeakerLogic.test.tsx | prefers the base Default voice when both a base profile and variant exist | REAL | keep | |
| ProjectViewSpeakerLogic.test.tsx | stores a real default profile name when speaker label differs | REAL | keep | Detailed scenario from real multi-voice setup. |
| ProjectViewSpeakerLogic.test.tsx | keeps the default option selected after reload when no project override | REAL | keep | |
| ProjectViewSpeakerLogic.test.tsx | persists the project voice selection immediately | REAL | keep | Asserts API called with null to clear. |
| ProjectViewSpeakerLogic.test.tsx | loads a saved project voice instead of reusing the global default | REAL | keep | |
| RecordingGuide.test.tsx | renders and displays prompt categories | REAL | keep | Asserts category names and intro text that are hardcoded in component data. |
| RecordingGuide.test.tsx | expands a category on click | REAL | keep | Toggle expand/collapse with content assertions. |
| RecordingGuide.test.tsx | copies prompt text to clipboard | VACUOUS → REAL | **FIXED** | Was `toHaveBeenCalled()` without checking the value — passes even if empty string written. Fixed to `toHaveBeenCalledWith(expect.stringContaining('Audio check'))`. Revert-check: reverted fix, test was green on old code with any call. |
| ChapterEditor_Assets.test.tsx | exports WAV and MP3 audio directly from the chapter editor | REAL | keep | Asserts both format calls to API and anchor click. |
| ChapterEditor_Assets.test.tsx | treats a blank chapter voice as a fallback to the project voice | REAL | keep | Asserts correct fallback voice name in API call. |
| ChapterEditor_Assets.test.tsx | persists a chapter voice selection immediately | REAL | keep | Asserts updateChapter called with correct profile name. |
| ChapterEditor_Assets.test.tsx | loads a saved chapter voice instead of falling back to the project voice | REAL | keep | Asserts select element value after async load. |
| ChapterEditor_Queue.test.tsx | handles "Add to Queue" | REAL | keep | Asserts banner text and API call. |
| ChapterEditor_Queue.test.tsx | resyncs after a short delay so fast jobs do not get stuck in queued state | REAL | keep | Uses fake timers; asserts fetchChapters called exactly 3× (initial×2 + resync). |
| ChapterEditor_Queue.test.tsx | warns before queuing large chapters | REAL | keep | |
| ChapterEditor_Queue.test.tsx | warns before requeueing a fully rendered chapter | REAL | keep | |
| ChapterEditor_Queue.test.tsx | does not queue a rebuild if clearing existing chapter audio fails | REAL | keep | Asserts error modal appears and addProcessingQueue not called. |
| ChapterEditor_Queue.test.tsx | shows processing for segment generation without entering chapter render states | REAL | keep | |
| ChapterEditor_Queue.test.tsx | keeps the live active job visible when a stale completed chapter job is still present | REAL | keep | Two-job scenario; asserts queued class on correct span. |
| ChapterEditor_Queue.test.tsx | highlights the whole active render batch in book mode | REAL | keep | Asserts exactly 2 spans get is-book-rendering class. |
| ChapterEditor_Queue.test.tsx | keeps rebuild rendering cues active even when the chapter is already marked done | REAL | keep | |
| ChapterEditor_Queue.test.tsx | does not keep finished segment jobs highlighted after the chapter completes | REAL | keep | |
| ChapterEditor_Resync.test.tsx | disables auto-save for text in edit tab | REAL | keep | Uses fake timers; asserts updateChapter NOT called with text content during edit mode. |
| ChapterEditor_Resync.test.tsx | handles source text resync preview and commit | REAL | keep | Full flow: preview → modal → confirm → updateChapter. |
| forms/InlineEdit.test.tsx | renders the initial value | REAL | keep | |
| forms/InlineEdit.test.tsx | renders the placeholder when value is empty | REAL | keep | |
| forms/InlineEdit.test.tsx | enters edit mode on single click | REAL | keep | |
| forms/InlineEdit.test.tsx | saves on blur | REAL | keep | |
| forms/InlineEdit.test.tsx | saves on Enter key | REAL | keep | |
| forms/InlineEdit.test.tsx | cancels on Escape key | REAL | keep | Asserts onSave not called and original value restored. |
| forms/InlineEdit.test.tsx | does not save if value has not changed | REAL | keep | |
| forms/InlineEdit.test.tsx | respects the disabled prop | REAL | keep | |
| forms/SearchableSelect.test.tsx | renders with placeholder | REAL | keep | |
| forms/SearchableSelect.test.tsx | opens dropdown on click | REAL | keep | Asserts search input appears. |
| forms/SearchableSelect.test.tsx | filters options based on search | REAL | keep | Asserts Option 2 disappears from DOM. |
| forms/SearchableSelect.test.tsx | calls onChange when an option is selected | REAL | keep | Asserts called with id, not label. |
| forms/SearchableSelect.test.tsx | handles "None" option | REAL | keep | Asserts called with `'none'`. |
| forms/SearchableSelect.test.tsx | calls onCreateNew when create button clicked | REAL | keep | |
| forms/SearchableSelect.test.tsx | is disabled when disabled prop is true | REAL | keep | |
| forms/VoiceDropzone.test.tsx | renders correctly | REAL | keep | |
| forms/VoiceDropzone.test.tsx | handles file selection via input | REAL | keep | Asserts filename appears and onFilesChange called with file. Note: Audio mock uses real setTimeout(10ms) inside mock — no fake timers used; waitFor covers it. |
| forms/VoiceDropzone.test.tsx | handles drag and drop | REAL | keep | |
| forms/VoiceDropzone.test.tsx | rejects non-audio files | REAL | keep | Asserts alert called with "1 file was ignored". Note: act() warning in console (non-fatal) — state update after drop not wrapped in act. Does not affect correctness. |
| forms/VoiceDropzone.test.tsx | shows warning for short files | REAL | keep | Asserts title attribute on warning element. |
| forms/VoiceDropzone.test.tsx | removes a file when clicking X | REAL | keep | Asserts filename removed and onFilesChange called with []. |
| layout/BrandLogo.test.tsx | renders the wordmark text | REAL | keep | `getByText()` throws if absent — `toBeTruthy()` is redundant but not vacuous. |
| layout/BrandLogo.test.tsx | has the correct accessibility label | REAL | keep | |
| layout/BrandLogo.test.tsx | renders the icon when showIcon is true | REAL | keep | |
| layout/BrandLogo.test.tsx | does not render the icon when showIcon is false | REAL | keep | |
| layout/Layout.test.tsx | renders the correct branding text | REAL | keep | `toBeTruthy()` pattern same as BrandLogo — redundant but not vacuous. |
| layout/Layout.test.tsx | renders navigation tabs | REAL | keep | |
| layout/Layout.test.tsx | uses shell state to keep project surfaces mapped to the visible library tab | REAL | keep | Asserts `aria-current="page"` on correct tab and `data-shell-hydration` attribute. |
| layout/Layout.test.tsx | reports transient hydration status in the DOM | REAL | keep | |
| layout/Layout.test.tsx | reports reconnecting status in the DOM | REAL | keep | |
| layout/Layout.test.tsx | renders the queue count badge even during hydration | REAL | keep | |
| layout/Layout.test.tsx | uses shell state to mark settings as the active global tab | REAL | keep | |
| project/AssemblyProgress.test.tsx | renders nothing when no assembly job is provided | REAL | keep | `container.firstChild` null check. |
| project/AssemblyProgress.test.tsx | renders progress when activeAssemblyJob is provided | REAL | keep | FRAGILE: asserts "ETA: 2m 0s" exact string. Format is inline in component (`${Math.floor(eta/60)}m ${eta%60}s`), so fragile to format refactor. Low risk currently. |
| project/AssemblyProgress.test.tsx | renders success message when finishedAssemblyJob is provided | REAL | keep | |
| project/AssemblyProgress.test.tsx | renders "Calculating..." when eta_seconds is missing | REAL | keep | |
| project/ChapterList.test.tsx | renders audio player with correct suffixed source from audio_file_path | REAL | keep | Asserts exact `/api/` URL pattern — contractual. |
| project/ChapterList.test.tsx | falls back to chap.id when audio_file_path is missing | REAL | keep | |
| project/ChapterList.test.tsx | renders queued pulse when audio_status is processing but no activeJob | REAL | keep | |
| project/ChapterList.test.tsx | uses live job progress when available | REAL | keep | Asserts data-progress="0.63" on mock progress bar. PredictiveProgressBar is legitimately stubbed as a heavy child. |
| project/ChapterList.test.tsx | treats segment-capable grouped chapter jobs as chapter progress | REAL | keep | |
| project/ChapterList.test.tsx | keeps a grouped running chapter in processing state | REAL | keep | |
| project/ChapterList.test.tsx | shows an indeterminate preparing state | REAL | keep | |
| project/ChapterList.test.tsx | shows a queued badge for chapters awaiting rendering | REAL | keep | |
| project/ChapterList.test.tsx | shows indeterminate jobs as working instead of predictive percentages | REAL | keep | |
| project/ChapterList.test.tsx | does not reuse a recent completed job once the chapter has been requeued | REAL | keep | |
| project/ChapterList.test.tsx | does not show a stale old done indeterminate job as finalizing on reload | REAL | keep | |
| project/ChapterList.test.tsx | does not treat a recently done segment job as chapter finalizing | REAL | keep | |
| project/ChapterList.test.tsx | treats mixed segment jobs as determinate even if segment_ids are missing | REAL | keep | |
| project/ChapterList.test.tsx | does not show interrupted orb when a job is active for a stale chapter | REAL | keep | |
| project/ChapterList.test.tsx | immediately hides the done job and renders the audio player without delay | REAL | keep | |
| project/ChapterList.test.tsx | hides estimated runtime badge if predicted_audio_length is missing | REAL | keep | |
| project/ChapterList.test.tsx | does not render estimated runtime badge even when predicted_audio_length is present | REAL | keep | |
| project/ProjectBreadcrumbs.test.tsx | calls back to the project surface when the project crumb is clicked | REAL | keep | |
| project/ProjectBreadcrumbs.test.tsx | does not duplicate the selected chapter as a disabled placeholder option | REAL | keep | Asserts exactly 1 option with name. |
| project/ProjectLibraryFiles.test.tsx | ChapterList / renders list of chapters | FRAGILE | keep with note | Minimal smoke test — renders two chapter titles. Not vacuous (would catch null render), but tests nothing specific. Low value but harmless. |
| project/ProjectLibraryFiles.test.tsx | ProjectCard / renders project details | FRAGILE | keep with note | Renders project name only. Same characterization. |
| project/ProjectLibraryFiles.test.tsx | ProjectHeader / renders project name | FRAGILE | keep with note | Same. |
| project/ProjectModals.test.tsx | AddChapterModal renders when open | REAL | keep | |
| project/ProjectModals.test.tsx | AddChapterModal calls onSubmit with title and text | REAL | keep | Asserts called with exact args. |
| project/ProjectModals.test.tsx | AddChapterModal handles file upload and clearing | REAL | keep | |
| project/ProjectModals.test.tsx | EditProjectModal renders with project data | REAL | keep | |
| project/ProjectModals.test.tsx | EditProjectModal handles cover image selection and preview | REAL | keep | |
| project/ProjectModals.test.tsx | EditProjectModal handles drag and drop for cover image | REAL | keep | |
| project/ProjectModals.test.tsx | CoverImageModal renders image and handles close | REAL | keep | |
| project/ProjectSubnav.test.tsx | renders navigation items | REAL | keep | |
| project/ProjectSubnav.test.tsx | highlights the active item | FRAGILE | keep with note | Asserts `style.color` and `style.borderBottom` inline CSS values. These are the component's only contract for active state (no aria-current). Breaks if CSS variable names change. Acceptable given no semantic alternative in current component. |
| project/ProjectSubnav.test.tsx | returns null if no items provided | REAL | keep | |
| ui/ActionMenu.test.tsx | renders and toggle menu | REAL | keep | |
| ui/ActionMenu.test.tsx | works with the new items prop | REAL | keep | |
| ui/ActionMenu.test.tsx | maintains backward compatibility with onDelete | REAL | keep | |
| ui/StatusOrb.test.tsx | renders correct tooltip with M4A status | REAL | keep | |
| ui/StatusOrb.test.tsx | renders ring with correct opacity based on presence | REAL | keep | SVG circle attribute assertions. |
| ui/StatusOrb.test.tsx | renders success fill when complete | REAL | keep | |
| ui/StatusOrb.test.tsx | renders queued state instead of interrupted | REAL | keep | |
| ui/StatusOrb.test.tsx | renders partial progress even when a wav already exists during rebuild | REAL | keep | |
| ui/StatusOrb.test.tsx | renders a full ring when all segments are rendered but no wav exists yet | REAL | keep | Asserts stroke-dashoffset="0". |
| voices/VoicesTabFiles.test.tsx | VoicesTab renders voice lab header and search bar | REAL | keep | Note: framer-motion whileHover/whileTap warnings in console; motion.button mock doesn't strip those props. Non-fatal. |
| voices/VoicesTabFiles.test.tsx | VoicesTab renders list of voices | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | VoicesTab opens create voice modal | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | NarratorCard renders narrator info and profiles | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | NarratorCard disables play and rebuild actions when no samples exist | REAL | keep | Asserts title attr on disabled button. |
| voices/VoicesTabFiles.test.tsx | NarratorCard allows testing and rebuilding when a latent exists | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | NarratorCard prefers the base Default profile over a sibling variant | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | NarratorCard shows Voxtral badge and hides XTTS-only controls | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | NarratorCard shows rebuild required status and regenerate action | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | NarratorCard keeps existing Voxtral previews playable but blocks new generation | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | SampleManager renders samples list | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | SampleManager highlights the samples expander and add button on hover class | FRAGILE | keep with note | Asserts CSS utility classes (`hover-bg-subtle`). These would break on class rename but reflect real static className usage. Low change risk. |
| voices/VoicesTabFiles.test.tsx | VariantEditor renders editor with speed and script button | FRAGILE | keep with note | Same pattern — CSS utility class assertions. Same characterization. |
| voices/VoicesTabFiles.test.tsx | Voice Portability renders Import Voice button | REAL | keep | Asserts input type and accept attribute. |
| voices/VoicesTabFiles.test.tsx | Voice Portability renders Export Voice button and opens export modal | REAL | keep | |
| voices/VoicesTabFiles.test.tsx | Voice Portability shows Export Voice Bundle in NarratorCard ActionMenu | REAL | keep | Full interaction: open menu → click → assert callback args. |
| voices/VoicesTabFiles.test.tsx | Voice Portability shows export confirmation modal with source WAV toggle | REAL | keep | |

---

## Summary

**Counts (in-scope tests only, excludes queue/ and PredictiveProgressBar*):**

| Class | Count |
|-------|-------|
| REAL | 103 |
| FRAGILE (kept with note) | 6 |
| VACUOUS → REAL (fixed) | 1 |
| MOCKED-OUT | 0 |
| WRONG-SCENARIO | 0 |
| DELETED | 0 |

**Total:** 110 tests across 21 files

**Fix made:**

- `/frontend/tests/unit/components/RecordingGuide.test.tsx` — "copies prompt text to clipboard": was `toHaveBeenCalled()` (passes if writeText is called with any value, including empty string). Fixed to `toHaveBeenCalledWith(expect.stringContaining('Audio check'))`. Revert-checked: before fix, test was green with the old code passing any call — confirming the vacuous pattern.

**Riskiest findings:**

1. **RecordingGuide clipboard test** (fixed): The old form would not catch a regression where writeText was called with empty string or the wrong prompt. Fixed.

2. **ProjectSubnav "highlights the active item"** (FRAGILE, kept): Asserts `style.color` and `style.borderBottom` inline values against CSS variables. The component uses no semantic active indicator (`aria-current` absent), so these inline styles are the only contract available. A CSS-variable rename would break this test silently. Would recommend adding `aria-current` to the component and migrating the assertion.

3. **AssemblyProgress "ETA: 2m 0s"** (FRAGILE, kept): The ETA format is inline in the JSX rather than a shared utility. If a util function is introduced or the format changes, this assertion breaks without the behavior being wrong. Low near-term risk.

4. **SampleManager/VariantEditor hover class assertions** (FRAGILE): Assert CSS utility classes (`hover-bg-subtle`, `hover-bg-destructive`) that are incidental to styling, not user-visible behavior. These tests would break on a CSS class rename while user experience is unchanged.

5. **ProjectLibraryFiles ChapterList/ProjectCard/ProjectHeader** (weak REAL): Each test renders a component and asserts a single title string. No behavior (interactions, state changes, conditional rendering) is exercised. Low value — would catch total render failures only.

**Test infrastructure note:**

`VoiceDropzone.test.tsx` has a console `act()` warning on the "rejects non-audio files" test (state update after `fireEvent.drop` not wrapped in act). The test itself passes correctly. This is a vitest.setup.ts concern if warnings are to be treated as errors — do NOT edit setup.ts per instructions; noting here for the reviewer.

**Verify:**
- `cd frontend && npx vitest run tests/unit/components --reporter=dot`: 265 passed (30 files)
- `npm run build`: green
