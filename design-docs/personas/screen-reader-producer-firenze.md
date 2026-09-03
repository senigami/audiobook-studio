# 29 · Screen Reader Producer  ☆ INFERRED

**Identity:** "A blind audiobook producer who chose Audiobook Studio because it was described as keyboard-accessible and now needs every control, status change, and modal to work flawlessly with NVDA and Firefox."

## Goals
- Complete a full render-review-publish flow without touching a mouse
- Understand queue state, job progress, and render outcomes from text and ARIA announcements alone
- Navigate chapter segments with clear heading structure and logical reading order
- Recover from render errors using keyboard-reachable retry or dismiss controls
- Trust that status changes (render started, segment failed, chapter complete) are announced without requiring polling

## Context & environment *(INFERRED)*
- Uses NVDA screen reader with Firefox on Windows; Firefox is their default because NVDA's ARIA support is most reliable there
- Found Audiobook Studio through a recommendation in a blind media professionals forum; the description "local-first, keyboard-accessible" was the deciding factor
- Works on 2–3 chapter projects per week, often late at night when they can focus without interruptions
- Has abandoned several desktop tools after discovering critical workflows were mouse-only; their threshold for trust is whether they can cast a voice, queue a render, and hear the result entirely from the keyboard

## Key workflow moments
- **Opening a project:** Expects a clear landmark structure — main nav, primary content, status bar — so they can orient with one screen-reader sweep rather than Tab-searching for context
- **Casting a character:** Expects the casting panel to be a proper dialog or region with a labeled combobox, not an unlabeled dropdown that reads as "button" with no associated character name
- **Queuing a render:** Expects that submitting a render job announces confirmation — either via an ARIA live region or focus moving to a status message — not silent visual feedback only
- **Monitoring the queue:** Expects queue items to expose job name, status, and progress as readable text (not just a status-color orb), and that status changes are announced via `aria-live="polite"`
- **Reviewing a finished segment:** Expects inline audio players to be focusable and operable with spacebar/arrow keys, with a visible and screen-reader-accessible play state

## Top friction points *(INFERRED)*
- **F1 — Icon-only toolbar buttons:** Voice paint controls, chapter nav arrows, and segment action buttons that render as icon sprites with no accessible name, announcing as "button" or nothing
- **F2 — Modal focus trap failures:** Cast-voice and confirm-delete dialogs that open without moving focus inside them, leaving the Screen Reader Producer reading background content while the modal is active; also dialogs that do not return focus to the trigger element on close
- **F3 — Silent status updates:** Queue progress updates that only change a CSS color or width value, with no `aria-live` announcement, so the Screen Reader Producer cannot know a job finished or errored without manually navigating to the queue panel
- **F4 — Unlabeled progress bars:** `<div>`-based progress indicators with no `role="progressbar"`, no `aria-valuenow`, and no `aria-label`, rendering as empty whitespace to the screen reader
- **F5 — Drawer-based panels with no landmark:** Casting and settings drawers that slide in from the side but are not wrapped in a `<dialog>` or `role="dialog"`, meaning focus is not managed and the drawer content has no containment

## What they need from the studio
- Every interactive element has a descriptive accessible name (not just an icon tooltip)
- All modals and drawers trap focus on open and restore it to the trigger on close
- Queue status changes broadcast through `aria-live` regions so render state is perceivable without navigation
- Progress bars use `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` and a text label
- Keyboard-reachable audio playback controls with announced play/pause state

## Review lens — questions they ask of any screen
- "Can I reach every interactive element on this screen by pressing Tab, and does each one announce a meaningful name?"
- "When a modal opens, does my reading cursor move into it, and does Escape close it and return focus to where I was?"
- "If a render finishes or fails while I'm reading another part of the screen, will I hear about it?"
- "Does this progress bar tell me the percentage, or does it only communicate visually?"
- "Is the heading structure here logical — can I sweep headings to understand what sections exist before reading their content?"
- "Are there any controls that only work on hover or require a right-click context menu with no keyboard alternative?"
- "If I'm in the queue panel and navigate to the chapter editor, can I return to the same queue position without losing state?"

## Red flags that make them quit or distrust the app
- A modal opens and focus stays behind it — they are now interacting with obscured content
- "Button" is the only label they hear when they land on a critical action control
- A render completes but they only discover it by accident when re-navigating the queue
- An audio player renders as a `<div>` with a click handler and is completely invisible to the screen reader
- The app logs an error in the UI but never announces it; they send a file to the client with a corrupted segment

**Evidence basis:** INFERRED. Interview blind media producers who use screen readers professionally to validate which NVDA + Firefox interaction patterns cause the highest abandonment rate, and whether ARIA live region timing (polite vs. assertive) matches their workflow expectations.
