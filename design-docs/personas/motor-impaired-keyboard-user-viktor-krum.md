# 32 · Motor-Impaired Keyboard User  ☆ INFERRED

**Identity:** "A professional editor with limited hand mobility who uses a trackball and keyboard combination, cannot drag or perform precision small-target clicks, and depends on every critical action having a forgiving, reachable, non-pointer path."

## Goals
- Complete segment ordering, voice assignment, and render submission without any drag-to-reorder interaction
- Reach every interactive control with a click target large enough that a trackball can reliably land on it
- Use keyboard shortcuts for repeated actions (play segment, advance to next, retry render) to reduce pointer use
- Avoid hover-dependent menus that disappear before they can stabilize their trackball cursor
- Complete a full chapter review session without hand fatigue from accumulated small-target errors

## Context & environment *(INFERRED)*
- Has limited hand mobility due to a repetitive strain injury sustained during a decade of audio editing; uses a Kensington Expert trackball and avoids prolonged pointer use
- Works as a freelance editor and project manager for a mid-sized indie publisher; was assigned to Audiobook Studio when the publisher started producing in-house audiobooks
- Can click reliably on targets above approximately 40px but misses smaller targets frequently; drag-and-drop is effectively unavailable — they cannot maintain button press while moving the cursor
- Has developed keyboard-first habits from years of audio editing in DAWs; expects every action that is performed repeatedly in a workflow to have a keyboard equivalent or shortcut

## Key workflow moments
- **Reordering segments or chapters:** Expects an explicit Up/Down keyboard reorder control (arrow button, keyboard shortcut, or accessible drag handle that responds to Space + arrow keys) — drag-and-drop with no keyboard fallback is a full blocker
- **Activating toolbar and panel controls:** Expects buttons, dropdowns, and toggles to have hit targets of at least 44×44px; small icon-only buttons clustered in dense toolbars require too many precision landing attempts per session
- **Opening context menus and secondary actions:** Expects right-click context menus to have a keyboard-accessible equivalent (e.g., an action button, a context menu triggered by a keyboard shortcut, or a dedicated actions panel) — hover-only menus that appear on mouseover and dismiss on mouseout are unreliable with a trackball
- **Scrubbing audio previews:** Expects the audio scrubber in the segment preview player to be operable with Left/Right arrow keys (per the standard `<input type="range">` or ARIA slider pattern) in addition to click-and-drag
- **Repeated actions across a chapter:** Uses keyboard shortcuts to move through a list of segments sequentially; expects Tab or arrow navigation through a list to be consistent and not reset to the top on each state change

## Top friction points *(INFERRED)*
- **F1 — Drag-only segment reorder:** Segment list that supports reordering exclusively via mouse drag — no keyboard alternative, no move-up/move-down button, no accessible drag handle with arrow-key support — a complete blocker
- **F2 — Undersized hit targets:** Icon buttons in the segment row action area (play, retry, delete) rendered at 24×24px or smaller with no padding extension, requiring repeated precision attempts per action
- **F3 — Hover-reveal action menus:** Secondary action menus that appear only on row hover and dismiss when the pointer leaves the row boundaries — with a trackball, the Motor-Impaired Keyboard User frequently overshoots the row and the menu vanishes before they can click an item
- **F4 — No keyboard shortcut for high-frequency actions:** No documented or discoverable keyboard shortcut for Play Segment, Next Segment, Retry Render, or Approve Segment — actions they perform hundreds of times per chapter review session
- **F5 — Scroll position reset on state change:** Segment list that scrolls back to the top when a render completes or a segment status updates, forcing them to re-navigate to their position after every background event

## What they need from the studio
- Keyboard-accessible reorder for every list that supports drag reordering (Up/Down buttons or arrow key support on focused list items)
- Minimum 44×44px effective click target for all interactive controls, including icon-only buttons in dense toolbars
- All hover-reveal menus have a stable keyboard alternative (focus-reveal, or a dedicated action button)
- Audio scrubber operable with arrow keys (Left/Right for seek, with a documented step size)
- Scroll position preserved across background state changes; only scroll on explicit user navigation

## Review lens — questions they ask of any screen
- "Can I reorder everything on this screen that supports reordering without using drag-and-drop?"
- "What is the actual click target size of this button — is it 44px, or does the visual size mislead me?"
- "Does this menu appear on hover, and if so, is there a way to open it from the keyboard or by clicking a stable trigger?"
- "How many precise small-target clicks does a typical 20-segment chapter review require, and is there a keyboard path that reduces that count?"
- "If a background job finishes while I'm working through a list, does my scroll position survive?"
- "Are there any actions on this screen that require sustained mouse button press while moving the pointer?"
- "Is there a keyboard shortcut reference I can discover without navigating to a documentation URL?"

## Red flags that make them quit or distrust the app
- Any list that can only be reordered by mouse drag, with no keyboard fallback
- A critical action button (Render, Save, Export) with a visible area below 32px on either dimension
- A context menu that appears on hover and the only way to open it is to hover — no keyboard trigger, no click trigger
- Scroll position resetting to the top every time a segment render status updates in the background
- An audio scrubber that is a custom `<div>` with only a mouse-drag interaction and no arrow key support

**Evidence basis:** INFERRED. Recruit 3–4 users with motor impairments who use trackballs or switch access to conduct task-completion sessions, measuring fail rate on small-target controls and identifying every drag-only interaction that requires a workaround.
