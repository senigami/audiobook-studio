# 27 · Casual Listener  ☆ INFERRED

**Identity:** "A hobbyist writer who wants to turn their short story into a listenable audiobook in one sitting — and who will not return if the first session ends without hearing their own words read back to them."

> **Distinct from [28 the Nontechnical Author](nontechnical-author-neville-longbottom.md):** both are non-technical first-run users, but the Casual Listener is a *one-shot* hobbyist who abandons permanently on first failure — they never reach the recovery/diagnosis loop. The Nontechnical Author (the primary persona) is an *ongoing* author who returns across sessions, retries failures, and needs plain-language error recovery. Use the Casual Listener to test the cold-open happy path; use the Nontechnical Author to test persistence and recovery.

## Goals
- Hear a rendered sample of their manuscript within ten minutes of opening the app for the first time
- Use the default voice without needing to understand what voice cloning means
- Accept the first result that sounds reasonably good rather than chasing perfection
- Share the finished file with friends without exporting to a format they cannot play
- Complete the entire flow — upload, cast, render, export — without reading documentation

## Context & environment *(INFERRED)*
- Personal laptop, macOS, Chrome browser; the app is running at localhost:8123 because a friend set it up for them
- Discovered Audiobook Studio through a social media post about AI narration; downloaded and installed it the same afternoon
- Work pattern: single uninterrupted session; if they hit a wall they close the tab; if it works they tell everyone

## Key workflow moments
- **First load:** Expects to see a clear starting action — "Create a project" or "Import a manuscript" — without scanning a dashboard for the right button
- **Manuscript upload:** Drags in a .txt or .docx file and expects the app to segment it automatically; does not want to manually define chapter boundaries on a first run
- **Voice casting:** Sees that characters were detected and a default voice is already assigned; does not change anything and moves forward
- **Render start:** Clicks a single button to start rendering; watches the progress bar move and the status orb change color; interprets anything other than a clearly advancing bar as a failure
- **Playback and export:** When rendering completes, plays the result in the browser and exports as MP3 to share; does not need WAV, chapter splits, or metadata tagging on the first run

## Top friction points *(INFERRED)*
- **F1 — Queue and review states misread as failures:** When a job enters "queued" or "assembling" state, the status orb changes and the progress bar pauses; the Casual Listener interprets this as the app breaking and may cancel a job that was about to complete
- **F2 — Plugin and engine terminology in the UI:** Any reference to "plugins," "TTS engine," or "XTTS" on a screen the Casual Listener encounters during the happy path reads as a technical error or incomplete setup, not a normal system label
- **F3 — Character casting complexity:** If the casting step requires them to understand what a "voice profile" is or to confirm character assignments before rendering, they stall; they need casting to be automatic with zero required input on a first run
- **F4 — No first-run guidance at critical moments:** When the progress bar stops at 100% but the export button is not yet active (e.g., assembly is still running), there is no contextual explanation; they assume the render failed
- **F5 — Setup flows before value:** Any screen that asks them to configure a voice, set audio quality, or choose an output format before they have heard a single second of audio is a session-ender

## What they need from the studio
- A first-run path that reaches audio playback in three steps or fewer: import → render → play
- Default settings that are production-ready without any user configuration
- A progress indicator that explains each phase in plain language ("Preparing voices," "Generating audio," "Assembling chapters") so that pauses between phases read as progress, not failure
- An export that defaults to MP3 with no additional configuration required
- A "getting started" moment that feels like success, not a tutorial

## Review lens — questions they ask of any screen
- "What am I supposed to do next — is there one obvious action on this screen?"
- "Is the app working, or did something go wrong? Does the progress indicator make that clear?"
- "Do I need to understand this word or setting to move forward, or can I ignore it?"
- "How much longer until I hear something?"
- "Can I undo this if I accidentally tap the wrong thing?"
- "Where is the play button — is my audiobook ready yet?"

## Red flags that make them quit or distrust the app
- A progress bar that stops visibly advancing for more than 30 seconds with no explanation
- Any error message that contains a stack trace, file path, or technical term without a plain-language summary
- A required configuration step before the first render that is not pre-filled with a sensible default
- A completed render that does not surface a play button immediately
- A status change (orb color, label) that is not explained inline for a first-time user

**Evidence basis:** INFERRED. Interview hobbyist writers and podcast listeners who have tried AI narration tools for personal projects; key open question is where in the first-run flow users most commonly abandon — before rendering starts or while waiting for it to complete.
