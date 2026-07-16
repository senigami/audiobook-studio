# 30 · Accessibility QA  ☆ INFERRED

**Identity:** "A professional a11y consultant who audits web apps for WCAG 2.1 AA compliance and evaluates Audiobook Studio as a potential tool for clients who rely on assistive technology or keyboard-only navigation."

> **Distinct from [29 the Screen Reader Producer](29-screen-reader-producer.md):** both surface the same failures (icon-only controls, focus traps, color-only status), but the Screen Reader Producer is a *lived-experience* AT user testing whether they can do real work, while the Accessibility QA persona is a *compliance auditor* who frames findings by WCAG criterion (1.4.1, 2.4.11, 1.4.10, 2.5.8) and needs a VPAT. Use the Screen Reader Producer for "can the workflow be completed"; use the Accessibility QA persona for "does it pass the standard."

## Goals
- Verify that all interactive workflows are completable with keyboard only, no mouse required
- Confirm that every status indicator communicates state through means other than color alone
- Validate that focus order follows the visual reading order and that focus is always visible
- Check that all modals, dialogs, and drawers are properly trapped and escapable without a mouse
- Produce a structured finding list organized by WCAG criterion

## Context & environment *(INFERRED)*
- Works as an independent a11y consultant; audits 4–6 apps per quarter on behalf of enterprise clients who publish content to accessibility-sensitive audiences
- Tests with keyboard only (no mouse), ChromeVox for basic screen reader coverage, and browser zoom at 200% to stress layout reflow
- Was referred to Audiobook Studio by a publishing-house client who wanted to know if their editorial team could use it; the app had no accessibility documentation or VPAT, so the client asked them to audit it before committing to a license
- Approaches the app as an adversary: their job is to find failure modes before a real user with a disability does

## Key workflow moments
- **Initial orientation sweep:** Tabs through the app shell once with no mouse to establish whether landmarks exist, whether skip-nav links are present, and whether focus indicators are visible at all zoom levels
- **Opening a project and navigating chapters:** Uses arrow keys and Tab to navigate the chapter list; checks whether items are proper list items or divs with click handlers; verifies that activating a chapter with Enter or Space opens it
- **Casting a voice for a character:** Activates the casting panel with keyboard; checks that the voice selector is a native `<select>` or a custom combobox with full ARIA widget roles; confirms that selecting a voice announces the change
- **Running and monitoring a render:** Submits a render job via keyboard; waits for a status announcement; watches whether the queue progress bar is perceivable without looking at color; confirms that a completed job is distinguishable from a pending one via text, not just icon color
- **Zooming to 200%:** Reflows the chapter editor and queue panel at 200% browser zoom; checks for horizontal scroll, truncated labels, and overlapping controls

## Top friction points *(INFERRED)*
- **F1 — Color-only status communication:** Queue status orbs (green = done, yellow = rendering, red = error) with no text label, tooltip, or icon variation — fails WCAG 1.4.1 Use of Color
- **F2 — Missing or invisible focus indicators:** Interactive elements that lose their default browser focus ring due to `outline: none` in CSS, with no custom replacement — fails WCAG 2.4.11 Focus Appearance
- **F3 — Custom widgets without ARIA roles:** Drag-to-reorder segment lists and custom dropdown menus built from `<div>` elements with no `role`, `aria-label`, or keyboard interaction pattern, failing both perceivability and operability criteria
- **F4 — Focus order disconnected from visual order:** Tab sequence that jumps from the chapter list to a sidebar action before reaching the chapter content area, confusing both keyboard users and screen reader users about the page structure
- **F5 — No reflow at 200% zoom:** Fixed-width panels that overflow horizontally at high zoom, hiding controls off-screen and requiring horizontal scrolling — fails WCAG 1.4.10 Reflow

## What they need from the studio
- A documented accessibility conformance statement or VPAT, even a partial one
- All status indicators combine color with a text label or icon pattern variant
- Custom interactive components (sliders, drag lists, dropdowns) implement the appropriate ARIA design pattern
- Focus indicators are visible and meet the 3:1 contrast ratio against adjacent background (WCAG 2.4.11)
- Skip navigation links or landmark regions so keyboard users can bypass repetitive navigation

## Review lens — questions they ask of any screen
- "Can I reach every interactive element on this screen with Tab, and does focus follow a logical visual reading order?"
- "Is this state change communicated in at least two ways — not color alone?"
- "What happens to focus when this modal or drawer opens, and where does it go when it closes?"
- "Does this custom component behave like its ARIA role promises — arrow keys, Enter, Escape?"
- "At 200% zoom, does this panel still show all its controls without horizontal scrolling?"
- "Does this error message have `role='alert'` or equivalent so a screen reader announces it immediately?"
- "What is the touch target size of this control, and does it meet the 24×24px WCAG 2.5.8 minimum?"

## Red flags that make them quit or distrust the app
- `outline: none` applied globally with no custom focus style replacement — automatic WCAG failure for any interactive element
- A modal that does not trap focus and allows Tab to escape into the background content
- A drag-to-reorder list with no keyboard alternative (Up/Down arrow reorder, move-to-top button, or equivalent)
- Status text that reads "●" with no accessible name — the dot is the entire label
- An error state that is only communicated by a red border with no text description or `aria-describedby` link

**Evidence basis:** INFERRED. Shadow a professional a11y auditor during an actual Audiobook Studio audit session to validate which WCAG criteria generate the highest number of real findings, and which are addressed by existing code but not surfaced in documentation.
