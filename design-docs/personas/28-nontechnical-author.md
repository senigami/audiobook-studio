# 28 · "Rosa Mendoza" — Nontechnical Author  ☆ INFERRED

> **Primary persona.** Decisions that break Rosa break the product for the largest share of the intended audience.

**Identity:** "I just want my book narrated. I'll figure out the fancy stuff later — if there even is a later."

---

## Goals
- Upload her manuscript and hear it read back without needing to understand what TTS, plugins, or engines mean
- Trust that the defaults will produce something listenable without configuration
- Understand what's wrong when something fails — in plain English, not error codes
- Get to a playable draft without asking anyone for help
- Eventually share the finished audiobook on Amazon or Audible, or just keep it for herself

## Context & environment *(INFERRED)*
- Mid-range Windows laptop; has never installed audio production software before this
- Retired teacher, now a self-published romance novelist; discovered Audiobook Studio through a self-publishing forum after a post about "making your own audiobook without a recording studio"
- Works in the evenings at her kitchen table; sessions are 30–60 minutes before she gives up if something is confusing
- Uses the internet to ask questions, but will not read developer documentation or GitHub issues

## Key workflow moments
- **First open:** Looks at the screen, tries to understand what to click first. If the first action isn't obvious, she'll spend 10 minutes clicking around before losing confidence.
- **Import:** Pastes or uploads her manuscript file. Expects it to "just work" — isn't prepared for a "configure your TTS engine" step before she's heard a single word.
- **First render:** Clicks the button she thinks starts narration. Waits. Wants to understand whether it's working or broken from the progress state — not from reading documentation.
- **Partial failure:** One of her chapters fails midway through. She sees a partial result and reads it as total failure. Tries to start over instead of retrying.
- **Recovery:** Looks for a way to fix the problem. The error message contains words she'd need to Google. She closes the tab.

## Top friction points *(INFERRED)*
- **F1 — Plugin jargon before first use:** She sees "engine not configured" or "no TTS plugin selected" before she's done anything. She doesn't know what a TTS plugin is or why she needs one to narrate her book.
- **F2 — Partial failure looks like total failure:** A chapter with 3 failed segments and 47 successful ones looks the same as a chapter that completely failed. She re-renders the whole thing, losing the 47 that worked.
- **F3 — Progress states don't communicate time:** "Preparing..." has been on the screen for 2 minutes. She doesn't know if this means "almost done" or "something broke." She refreshes the page.
- **F4 — Error messages are developer-facing:** "Error 422: Unprocessable Entity" appears when a segment fails. There's no translation into what happened or what to try next.
- **F5 — Setup flow asks opinions she hasn't formed:** The first-run experience asks her to choose between voice options, quality settings, and engine parameters. She hasn't listened to a single output yet. She doesn't have opinions.

## What they need from the studio
- A **clear "start here" path** that works without configuration — one upload, one button, one result
- Progress states in **plain English**: "your audio is generating — about 8 minutes left" instead of "preparing..."
- **Error messages she can act on**: "This segment couldn't be narrated — try again" instead of HTTP status codes
- A **one-click retry** for failed segments that's visible and clearly labeled
- **Deferred configuration**: let her hear a draft first, surface settings only when she's decided something sounds wrong and wants to adjust it

## Review lens — questions they ask of any screen
- "What do I click first?"
- "Will this work if I haven't read any instructions?"
- "Is that error message telling me what happened, or just showing me a code?"
- "If I leave and come back tomorrow, will my work still be here?"
- "Is there something I need to configure before this button will actually do anything?"
- "Am I about to do something that will erase what I've already made?"
- "Can I hear what this sounds like before I make any decisions?"

## Red flags that make them quit or distrust the app
- Any screen that requires understanding "plugins," "engines," or "TTS models" before doing a single thing
- Technical error messages with no plain-language translation or next-step suggestion
- A progress indicator that doesn't visibly change for more than 30 seconds with no explanation
- A confirmation dialog whose button label doesn't explain what the confirmation will actually do
- Settings presented in terms she'd need to Google — especially before she's heard her first output

**Evidence basis:** INFERRED. This is the highest-priority persona to validate. Recruit from: r/selfpublishing, Reedsy Community, ACX forums, indie author Facebook groups. Look for authors in the "just finished writing, thinking about audio" stage — not experienced producers. Key question: where does the first session end without a result, and what language was the last straw?
