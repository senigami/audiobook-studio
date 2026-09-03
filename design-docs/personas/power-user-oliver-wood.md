# 16 · Power User  ☆ INFERRED

**Identity:** "I process 12 chapters a day. Every extra click is a decision I've already made a hundred times."

---

## Goals
- Move through large manuscript workflows without reloading or re-finding his place
- Know exactly what's in the queue, what's rendering, and what's done — at a glance, without drilling into sub-panels
- Quickly swap a problematic voice and re-render specific segments without retrying the whole chapter
- Recover from failures and reconnections without losing his session state
- Keep the app fast and trustworthy even when processing a 50-chapter project with 3,000 segments

## Context & environment *(INFERRED)*
- Custom desktop build, high-end GPU, 3 monitors; runs render jobs on one screen while reviewing on another
- Freelance audiobook producer; has processed 200+ books over 2 years via ACX and direct publisher contracts
- Uses the app 8+ hours/day; has formed strong muscle memory around the current workflows
- Runs the app as a production tool, not a creative tool — he's optimizing for throughput and reliability

## Key workflow moments
- **Morning setup:** Imports a new manuscript, bulk-assigns voices using saved character presets, kicks off the first chapter render — wants this to take under 5 minutes
- **Background monitoring:** Renders run in the background; he watches the queue panel in a sidebar corner and expects it to tell him segment counts, not just a spinner
- **Concurrent review:** While one chapter renders, he reviews and approves segments in a different chapter — needs the two states to stay cleanly separated
- **Failure triage:** When a render fails, he reads the error immediately, decides in under 10 seconds whether to retry, skip, or escalate, then moves on
- **End-of-day reset:** Clears completed chapters, archives finished projects, queues tomorrow's work — expects the app state to persist cleanly across a restart

## Top friction points *(INFERRED)*
- **F1 — Queue progress lies:** "Preparing..." can mean 5 seconds or 5 minutes with no way to tell the difference. In a 200-segment chapter, the progress indicator is routinely meaningless. The Power User needs segment counts (42/200 rendered), not spinners.
- **F2 — Reconnect resets position:** After a network hiccup, a page reload, or a browser tab swap, the active chapter selection and any unsaved review marks are gone. He has to manually re-find his place in a 50-chapter project.
- **F3 — No per-chapter voice override:** If chapter 12 needs a different voice assignment for one character (a flashback, a different speaker register), there's no way to override without affecting the whole book casting.
- **F4 — Retry is all-or-nothing:** Retrying a failed chapter retries all segments including the 90% that succeeded. "Retry failed only" doesn't exist as a button — he has to wait through successful re-renders to get to the one that broke.
- **F5 — Large project navigation is slow:** In a 50-chapter book, getting to chapter 38 means scrolling past 37 others. There's no chapter jump-to, no search, no keyboard shortcut to jump by position.

## What they need from the studio
- A queue panel that shows **real progress**: segment counts rendered/total, not just "preparing" — something he can glance at from across the room
- **Session state persistence**: last chapter open, last voice selected, last queue position — surviving a reload, a crash, or a browser restart
- **Per-chapter voice overrides** that don't touch the book-level casting
- A **"retry failed only"** button that's always visible on partially failed chapters, not buried in a sub-panel
- **Jump-to-chapter navigation**: type a chapter number or search by title, land there immediately

## Review lens — questions they ask of any screen
- "After a reload, can I tell exactly where I was and what's actively in the queue?"
- "Does this progress indicator tell me something I couldn't learn by counting, or is it just a spinner?"
- "Can I retry only the failed segments in this chapter, not the ones that already succeeded?"
- "If I change this voice assignment, does it apply to this chapter only or to the whole book?"
- "Can I navigate to chapter 38 in a 50-chapter project without scrolling past 37 others?"
- "Is 'preparing' a real estimate tied to the queue depth, or is it always the same state?"
- "If I close the browser right now and reopen it, what exactly will I lose?"

## Red flags that make them quit or distrust the app
- Progress state that uses the same spinner for "just started" and "almost done" — indistinguishable
- A reconnect that resets to the project root instead of the last open chapter and queue position
- A voice reassignment dialog that doesn't explicitly say whether it's scoped to this chapter or the whole book
- A "retry chapter" button that retries successes alongside failures — wasted GPU time he can see burning
- Visual polish (smooth animations, fading transitions) that masks real state changes — he needs truth at a glance, not aesthetics

**Evidence basis:** INFERRED. Validate with high-volume freelance audiobook producers on ACX or Findaway. Key question: what are the most common failure modes in a 200-segment production job, and what's the fastest path to recovery without re-rendering clean segments?
