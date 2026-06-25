# 42 · "Grace Okafor" — Voice-Clone Trainer  ☆ INFERRED

**Identity:** "I'm trying to reproduce a specific person's voice, and every time the clone sounds wrong I need to know whether it's the samples, the engine, or something I can't fix."

## Goals
- Produce a cloned voice that reliably matches the target speaker across varied sentence types
- Understand which source samples contribute to quality and which hurt it
- Compare two clone attempts (same speaker, different sample sets) on identical test text
- Preserve a working clone version before re-cloning, so a regression doesn't erase a good result
- Know before using a voice in a real chapter whether it will hold up across a full render

## Context & environment *(INFERRED)*
- Works on a desktop or laptop with headphones; listens to playback at 1x and 0.75x to catch artifacts
- Came to Audiobook Studio specifically for the voice-cloning capability — likely found it via audiobook production or podcast communities
- Spends most session time in the Voices Library and the sample upload flow, not the chapter editor
- Iterates in cycles: gather samples → clone → render test passage → listen → decide → adjust or re-clone
- Often working from a fixed source (an interview recording, a single audiobook chapter) and trying to extract the cleanest possible sample slices

## Key workflow moments
- **Uploading samples:** Drops audio files into the voice profile; expects feedback on whether each sample is long enough, clean enough, and phonetically varied enough before committing to a clone run.
- **Triggering the clone:** Initiates training from the voices library; expects a clear status signal (not just a spinner) and a way to know when the clone is ready to test.
- **Running a test passage:** Wants a built-in standard sentence or short paragraph she can render against any voice, separate from any real project chapter, so clone quality is always evaluated on the same text.
- **Comparing versions:** After re-cloning with a new sample set, wants to A/B the new voice against the previous one on the same test passage audio — side by side, same text, same engine settings.
- **Diagnosing a bad clone:** Listens for roboticism, accent drift, breath inconsistency; wants the app to surface any signal it has (sample count, sample length, noise floor warnings) rather than silently accepting poor inputs.

## Top friction points *(INFERRED)*
- **F1 — Silent overwrite on re-clone:** Re-cloning appears to overwrite the existing voice profile with no versioning or confirmation prompt. A good clone can be destroyed by a worse sample set with no way to recover.
- **F2 — No standard test harness:** There is no built-in test passage. Evaluating a clone requires creating a throwaway chapter, which pollutes the project list and makes rigorous comparison impractical.
- **F3 — No sample-quality feedback:** The voices library accepts uploads without indicating whether samples are too short, noisy, or phonetically narrow. Bad samples are only revealed after a full clone run produces poor results.
- **F4 — No clone version history:** The voice profile shows the current state but not what sample set produced it or when it was cloned. There is no record to diff against when something regresses.
- **F5 — No A/B compare:** Two clone attempts on the same speaker cannot be listened to side by side on identical text within the app. Comparison requires external tools or memory.

## What they need from the studio
- Version history for voice profiles: at minimum, a timestamped record of what sample set was used for each clone run
- A confirmation or copy-on-re-clone prompt before overwriting an existing profile
- A built-in test-passage renderer in the voices library — a fixed sentence set, rendered on demand, not tied to a project
- Pre-clone sample quality indicators: duration, estimated noise level, count, and a warning if the set is likely to produce a poor result
- Side-by-side (or sequential) A/B playback of two clone versions on the same passage, within the app

## Review lens — questions they ask of any screen
- "How do I know if this sample set is better than my last one?"
- "Can I compare two versions of the same cloned voice on identical text without leaving the app?"
- "If I hit re-clone right now, do I lose what I have?"
- "What source samples produced this voice profile, and when was it last cloned?"
- "Does the app warn me if my samples are too short or too noisy before I commit to a clone run?"
- "Is there a standard passage I can always use to evaluate a new clone fairly?"
- "What specifically is making this clone sound robotic — is it the samples or the engine?"

## Red flags that make them quit or distrust the app
- Re-cloning silently overwrites the previous profile with no version history and no warning
- No standard test passage means every evaluation requires a throwaway project chapter
- Sample quality issues (short clips, background noise, single-speaker phrase repetition) are accepted without any warning
- Clone quality varies between two renders of identical text with no explanation offered
- There is no way to tell, after the fact, what sample set was used to produce the current voice profile

**Evidence basis:** INFERRED. Interview voice-cloning hobbyists and podcast producers who have used ElevenLabs or Coqui; the key open question is whether users want full version branching or a simpler "keep previous / replace" confirmation prompt.
