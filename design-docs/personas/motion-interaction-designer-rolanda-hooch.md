# 46 · Motion & Interaction Designer  ☆ INFERRED

**Identity:** "Every animation is a claim about what just happened. If the motion doesn't match the claim — where something came from, what caused it, what to expect next — it's not polish, it's noise wearing a costume."

---

## Goals
- Confirm every transition/animation has a specific communicative job (orient after a state change, show causality, indicate what's interactive) — never motion added because a framework made it easy
- Catch motion that's technically smooth but semantically wrong — an element that slides in from a direction that implies the wrong origin, an easing curve that reads as bouncy/playful on a serious error state
- Make sure interaction feedback (hover, press, focus, drag) is immediate and proportionate — neither so subtle it reads as unresponsive, nor so exaggerated it distracts from the actual content
- Ensure `prefers-reduced-motion` genuinely simplifies the experience (removes/shortens animation) rather than just running the same animation faster
- Keep motion timing and easing consistent across the app — a fast, snappy interaction on one screen and a slow, floaty one on a conceptually similar screen elsewhere reads as two different products

## Context & environment *(INFERRED)*
- Has worked on interaction design specifically (not just static UI) — thinks in terms of timing curves, spring physics, and the difference between "an animation exists" and "this animation communicates"
- Reviews motion by watching it slowly (frame-by-frame or at reduced playback speed) as well as at real speed, because problems that are invisible at 300ms are obvious at 3x slowdown
- Distinguishes decorative motion (a background flourish, a loading shimmer) from functional motion (something that shows a real state transition, a real causality) and holds functional motion to a much higher bar
- Treats `prefers-reduced-motion` as a real, tested state, not a checkbox — actually experiences the app with it on before signing off

## Key workflow moments
- **First interaction pass:** clicks/taps every button, toggle, and draggable element once, watching specifically for whether the visual feedback is instant (no perceptible input lag) and proportionate to the action's weight (a destructive action shouldn't feel as light/breezy as a toggle)
- **State-transition audit:** triggers every meaningful state change (loading → loaded, empty → populated, error → recovered, panel open → closed) and asks whether the motion between states clarifies what happened or is just decorative filler
- **Direction-of-origin check:** for anything that slides, expands, or transforms into view, confirms the motion's implied origin point actually matches where the triggering action happened (a panel that visually "comes from" the button that opened it, not from an arbitrary edge)
- **Reduced-motion pass:** flips the OS/browser reduced-motion setting and re-runs the state-transition audit, confirming animations are genuinely reduced/removed rather than just sped up
- **Cross-screen timing consistency:** compares the same class of interaction (e.g. every modal open, every toast dismiss) across different screens to confirm consistent duration/easing, not a different feel per screen depending on who built it

## Top friction points *(INFERRED)*
- **F1 — Motion with no causal link:** an element that animates in from a screen edge unrelated to any user action, so the motion reads as arbitrary rather than as a response to something the user did
- **F2 — Uniform animation regardless of stakes:** the same gentle fade used for both "item added" and "item permanently deleted" — motion that doesn't scale its weight/tone to the significance of what happened
- **F3 — Reduced-motion that's really just reduced-speed:** a `prefers-reduced-motion` implementation that shortens the duration instead of removing the transform/animation entirely, so someone who needs motion reduced for vestibular/attention reasons still gets the disorienting effect, just faster
- **F4 — Inconsistent interaction timing across the app:** one screen's modal opens with a snappy 150ms transition and another's takes 400ms with a different easing curve, so switching between them feels like using two different products stitched together
- **F5 — Feedback lag on direct manipulation:** a drag, a slider, or a press-and-hold where the visual response trails the actual input by even a small but perceptible amount, breaking the illusion of direct control
- **F6 — Decorative motion competing with functional motion:** a background shimmer or idle animation running at the same time as a real state-transition animation, splitting attention away from the thing that actually needs to be noticed

## What they need from the studio
- A small, consistent set of timing/easing values used everywhere for the same class of interaction (all modals share one open/close timing, all toasts share one enter/exit timing), not ad hoc per component
- Every meaningful state transition paired with motion whose direction, duration, and weight actually match what happened — and every purely decorative flourish kept clearly subordinate to functional motion, never competing with it
- A real, tested `prefers-reduced-motion` path that removes/shortens transforms and non-essential animation, verified by someone actually using the app with it enabled — not assumed correct because a media query exists in the CSS
- Immediate, proportionate feedback on every direct-manipulation interaction (drag, press, slide) — no perceptible lag between input and visual response
- Motion during system-driven asynchronous events (a toast appearing, a status changing) that never steals focus or disorients someone mid-task on a different part of the screen

## Review lens — questions they ask of any screen
- "If I watch this animation and ask 'what does this motion tell me just happened,' is there a real answer, or is it just movement?"
- "Does this transition's direction/origin actually match where the triggering action came from?"
- "Would a destructive action and a routine one feel meaningfully different in how they animate, or do they feel the same?"
- "With reduced motion on, is this genuinely simplified, or just the same effect running faster?"
- "Is there any perceptible lag between my input and the visual response, especially on anything I'm dragging or pressing and holding?"
- "If I compare this screen's modal-open timing to a different screen's, do they feel like the same product?"
- "Is a decorative animation currently competing for attention with something that actually needs to be noticed right now?"

## Red flags that make them quit or distrust the app
- An animation whose origin/direction implies a false causality (slides in from a location unrelated to the action that triggered it)
- Identical motion treatment for a routine action and a destructive/irreversible one — no weight differentiation
- `prefers-reduced-motion` implemented as merely faster timing rather than actually removing/shortening transforms
- Visibly inconsistent timing/easing for the same interaction pattern across different screens
- Perceptible lag between a drag/press input and its visual feedback, breaking the sense of direct control
- A decorative/idle animation running unchecked at the same time as a functional state-transition animation, splitting attention at exactly the moment focus matters most

**Evidence basis:** INFERRED. Validate by having an actual motion/interaction designer do a frame-by-frame review of this app's real transitions (modals, toasts, route changes, drag interactions) and compare their findings against this persona's stated friction points — and by testing `prefers-reduced-motion` against real assistive-technology user feedback rather than assuming the CSS media query alone is sufficient.
