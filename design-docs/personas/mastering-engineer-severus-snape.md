# 08 · Mastering Engineer  ☆ INFERRED

**Identity:** "The Mastering Engineer is the last quality gate before distribution — they need to know the WAV files from Audiobook Studio are technically clean before they waste time importing garbage into their DAW."

## Goals
- Verify loudness consistency across chapters before starting a mastering session
- Identify clipping, silence gaps, or encoding artifacts at the project level, not file by file
- Confirm all chapter files are present, named predictably, and complete before export
- Catch rendering failures that produced truncated or zero-length audio
- Get a clean export manifest so he knows exactly what the package contains

## Context & environment *(INFERRED)*
- macOS, large external drive, Pro Tools or Reaper; not running the app daily
- Brought in at the end of a project after the producer says "it's ready to master"
- Opens the app once per project, usually for the first time on that manuscript
- Doesn't know the character cast or segment structure; cares about audio output only
- Exports WAV folder from Audiobook Studio, imports into DAW, masters, delivers to distributor

## Key workflow moments
- **Project handoff review:** Opens the project and immediately looks for a file-level completeness indicator — are all chapters rendered, and did any fail silently?
- **Output inspection:** Navigates to whatever export or queue view exists to check render status per chapter, not per segment
- **Pre-export sanity:** Looks for loudness metadata, file durations, or any automated quality flags before pulling the files off-app
- **Export trigger:** Initiates export and wants a manifest (filenames, durations, sizes) he can screenshot for his session notes
- **Post-export check:** Confirms the exported folder matches what the manifest said — no phantom extras, no missing chapters

## Top friction points *(INFERRED)*
- **F1 — No audio quality surface:** The app reports render success/failure but does not expose loudness levels, peak values, or silence detection; the Mastering Engineer has no signal to act on before importing
- **F2 — Segment granularity mismatch:** Everything in the queue panel is at the segment level; the Mastering Engineer thinks in chapters and has no chapter-level rollup view of audio quality or render completeness
- **F3 — Export has no manifest:** The WAV export drops files in a folder with no accompanying summary; the Mastering Engineer manually counts files against the chapter list to check completeness
- **F4 — Silent rendering failures:** A segment that failed mid-render may produce a short or empty WAV that passes file-existence checks; the app has no duration-based validation to surface this

## What they need from the studio
- A chapter-level render status summary (all segments complete, any failures, total duration)
- Basic per-chapter audio stats before export: peak level, approximate LUFS, duration
- An export manifest file (JSON or plaintext) listing every file, its duration, and its render timestamp
- A clear visual distinction between "rendered successfully" and "rendered but flagged"
- Duration-based completeness check — a WAV under some threshold relative to the text length should be a warning, not a silent pass

## Review lens — questions they ask of any screen
- "Which chapters have fully rendered audio and which are still partial or failed?"
- "Is there anything in this project the app itself flagged as a quality issue?"
- "What exactly gets exported if I hit the export button right now?"
- "How do I know this WAV file is the final version, not a stale render from two days ago?"
- "If a segment failed silently, where would I see that?"
- "Can I see total duration per chapter without opening each one?"

## Red flags that make them quit or distrust the app
- Export succeeds but produces fewer files than there are chapters — with no explanation
- Render status shows green but a WAV plays back as silence or cuts off mid-sentence
- No timestamp on exported files; can't tell if they're from this session or a previous one
- The app has no loudness or peak information anywhere in the UI
- Completing the export requires navigating through character/segment views that are irrelevant to audio QA

**Evidence basis:** INFERRED. Interview working mastering engineers who receive AI-TTS-generated audiobook WAVs to understand what pre-import QA checklist they run and which failures they encounter most often.
