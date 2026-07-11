# 06 · "Alex Reyes" — Casting Director  ☆ INFERRED

**Identity:** "Casting is a permanent decision that touches everything. I need to see the full map before I change a single voice."

---

## Goals
- See the complete casting map for a book at a glance — all characters, their voices, their line count, across all chapters
- Audition voice options for a role side-by-side without navigating away from the casting panel
- Catch duplicate or near-duplicate voice assignments before the first full render, not after
- Make role reassignments with full visibility into what gets invalidated downstream
- Lock casting decisions once approved so they can't be accidentally overwritten during rendering

## Context & environment *(INFERRED)*
- High-end Mac, external monitor for comparison work; works across 3–5 active projects simultaneously
- Casting director at a mid-size audiobook publisher; has directed 60+ titles, maintains a roster of 40+ voices
- Uses Audiobook Studio specifically for the cast visualization and preview — does final QA in a separate DAW
- Works in casting passes: one pass for character discovery, one for audition, one for approval — distinct phases

## Key workflow moments
- **Project intake:** Reviews the character list for a new project — names, speaking frequency, estimated page count, role type — to understand cast complexity before touching any voices
- **Audition pass:** For each major role, plays 2–3 candidate voice clips against a sample of the character's lines; wants this to be fast, in-panel, without navigation
- **First scene review:** After initial casting, listens to the first full scene to catch tonal conflicts — characters who sound too similar, or a voice that reads wrong against the prose register
- **Reassignment:** When a voice isn't working 30% through the book, needs to understand the blast radius (chapters affected, segments rendered, approved audio that will go stale) before proceeding
- **Cast approval:** Signs off on the full cast map with a locked state — no AI or auto-assignment should touch it after approval

## Top friction points *(INFERRED)*
- **F1 — No book-level casting map:** Alex can see one chapter's assignments at a time, but never the whole cast across all chapters simultaneously. Duplicate voices and near-matches don't surface until the first full render.
- **F2 — Audition requires navigation:** Comparing two voice samples for a role means leaving the casting panel, going to the voices library, playing previews there, then navigating back. There is no inline audition mode.
- **F3 — Reassignment blast radius is invisible:** When Alex reassigns a voice to a new character, the app doesn't show how many chapters, scenes, and already-rendered segments will be invalidated.
- **F4 — No director's notes on characters:** The character profile has no field for casting guidance. Notes like "sounds ordinary, not menacing" live in Alex's head or a separate document outside the app.
- **F5 — Voice similarity goes undetected:** Two characters who both got assigned similar-sounding voices are only discovered by ear, never surfaced by the app.

## What they need from the studio
- A **book-level casting overview**: a grid or table showing all characters, their assigned voices, their line count, and chapter distribution — with "voices in conflict" flagged visually
- **Inline voice audition**: play a 10-second clip for any voice candidate directly from the character panel, without leaving the casting context
- A **reassignment scope indicator**: before confirming a voice change, show "this affects N chapters, M rendered segments"
- A **casting notes field** on character profiles that persists across chapters and sessions
- A **cast lock state**: mark a cast as approved so that batch renders and AI suggestions won't overwrite assignments without an explicit unlock

## Review lens — questions they ask of any screen
- "Can I see the full cast for this book on one screen, not one chapter at a time?"
- "How do I compare voice option A and voice option B for this role without leaving this panel?"
- "If I change this assignment right now, what exactly will be invalidated downstream?"
- "Where do I write a note about how this character should sound that will be visible next session?"
- "Are any two characters sharing a voice, or assigned voices that sound similar to each other?"
- "Is this casting 'assigned' in the sense of suggested, or in the sense of approved and locked?"
- "Can I approve the full cast and prevent any further changes to it until I explicitly unlock it?"

## Red flags that make them quit or distrust the app
- A casting panel that only shows one chapter at a time with no book-level view
- Voice selection that requires navigating away from the casting context to hear a sample
- A voice change that silently invalidates approved, reviewed audio with no confirmation or scope preview
- The word "cast" used interchangeably for "assigned" and "approved and locked" — these are distinct states
- Character profiles with no free-text notes field — casting is qualitative, not just a dropdown

**Evidence basis:** INFERRED. Validate with professional audiobook casting directors or voice directors at publishers (Penguin Random House Audio, Macmillan Audio, Brilliance Audio). Key question: what does a casting decision look like as a document — how is it communicated to the recording director, and how are revisions tracked?
