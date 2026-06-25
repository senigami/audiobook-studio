# 43 · "Marcus Liang" — Color-Blind / Low-Vision User  ☆ INFERRED

**Identity:** "I can see everything on the screen, but when the app uses color as the only signal I genuinely cannot tell whether a render succeeded or failed."

## Goals
- Read render state (working, done, failed, needs attention) at a glance without relying on hue
- Never confuse a failed segment for a completed one because both look the same to him
- Navigate the casting panel and tell characters apart without color swatches being the only differentiator
- Trust that "the job is done and safe to publish" means something he can verify independently of color framing
- Use the queue panel, chapter editor, and status orb with the same confidence as any other user

## Context & environment *(INFERRED)*
- Deuteranopia: red and green appear as variants of the same yellow-brown range; cannot distinguish red-failed from green-done status dots without a secondary cue
- Mild low vision: benefits from larger touch targets and higher contrast, but does not use a screen reader or keyboard-only navigation
- Came to Audiobook Studio as a writer or producer — his color vision deficiency is incidental, not the reason he sought out the app
- Uses the app across all panels: project list, chapter editor, casting panel, queue panel, voices library
- Has developed workarounds in other software (hovering to read tooltips, relying on text labels) and will attempt the same here, but drops a tool when workarounds are too slow

## Key workflow moments
- **Reading the status orb:** Checks the orb and progress bar after submitting a render job; expects to know the state (idle / working / done / failed / attention) from something other than hue — an icon, a shape change, or a visible text label.
- **Reviewing segment-level results:** Scans the chapter editor for failed or flagged segments after a render run; red-vs-green segment indicators are indistinguishable to him without an icon or label overlay.
- **Using the casting panel:** Reads character-to-voice assignments where each character has a color swatch; if swatch hue is the only differentiator, multiple characters collapse into the same apparent color.
- **Acting on queue state:** Reads job cards in the queue panel for status (queued / running / done / failed); needs text or icon state, not color-coded row tints alone.
- **Reading banners and notices:** ~3% tinted banners (informational, warning, error) may fall below contrast thresholds for their body text; he needs sufficient luminance contrast regardless of the tint hue.

## Top friction points *(INFERRED)*
- **F1 — StatusOrb states are color-only:** The orb uses blue/green/red/gold to communicate working/done/failed/attention. Red and green are indistinguishable under deuteranopia; gold and green are close. No icon or shape differentiates these states.
- **F2 — Segment pass/fail indicators in the chapter editor:** Individual segment status dots use red (failed) and green (done). Without a secondary cue (icon, strikethrough, label), he cannot tell at a glance which segments need attention after a render.
- **F3 — Character swatches in the casting panel:** Each character receives a color swatch. If two characters are assigned colors in the red-green range, he cannot tell them apart while reading assignments or reviewing dialogue attribution.
- **F4 — "Green means safe to publish" framing:** Instructional microcopy or tooltips that say "green means ready" are meaningless to him. The concept must be expressed with an icon or explicit text label, not a color name.
- **F5 — Banner contrast on tinted backgrounds:** Low-saturation tinted banners that don't meet WCAG 4.5:1 for body text are harder for him to read due to his mild low vision compounding the hue confusion.

## What they need from the studio
- Every status state (orb, progress bar, segment dot, queue card) must carry a non-color cue: an icon, a shape, or a visible text label — in addition to color, not instead of it
- Segment-level failed/done indicators in the chapter editor need distinct icons (e.g., a checkmark vs. an X), not just a color swap
- Character swatches in the casting panel must be distinguishable by pattern or label, not hue alone — especially for characters in the red-green range
- Banner components must meet WCAG AA contrast (4.5:1) for body text regardless of tint color
- Avoid color-name references ("the green status means done") in microcopy; use state names ("Ready", "Failed", "In Progress") that stand alone

## Review lens — questions they ask of any screen
- "If I remove all color from this screen, can I still tell these states apart?"
- "Does this status indicator use a shape, icon, or label — or only a hue?"
- "Are these two character swatches distinguishable to someone who cannot tell red from green?"
- "Is the failed-vs-complete distinction carried by anything other than red-vs-green?"
- "Does this tinted banner meet contrast minimums for its text?"
- "Does any microcopy say 'the green one' or 'the red dot' without a fallback description?"
- "If the status orb is the only way to know a render failed, how do I know it failed?"

## Red flags that make them quit or distrust the app
- A render failure and a successful completion look identical to him because both states are signaled only by hue
- Character identity in the casting panel collapses when multiple characters share the red-green range with no pattern or label backup
- Instructional text uses color names ("look for the green orb") with no alternative description
- A banner or alert falls below contrast minimums, making it unreadable against its tinted background
- No way to confirm "the job finished successfully" without relying on the green/red distinction

**Evidence basis:** INFERRED. Conduct accessibility testing with deuteranopia simulation tools (e.g., Stark or browser devtools) and a user with confirmed red-green CVD; the key open question is whether character swatch disambiguation needs a pattern fill, a text label overlay, or both.
