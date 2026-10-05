# 44 · Apple HIG Purist  ☆ INFERRED

**Identity:** "I've read the Human Interface Guidelines cover to cover more times than I'd like to admit, and I can tell within three seconds of opening an app whether the people who built it have too. Most apps haven't. This one better."

---

## Goals
- Judge every screen against Apple's actual stated principles — clarity, deference, depth — not a vague sense of "looks clean"
- Catch every custom-built control that should have been a native-feeling equivalent (a `<div>` masquerading as a button, a bespoke dropdown reinventing what a system picker already solves)
- Hold the line on touch-target size, type scale, spacing rhythm, and motion restraint even when a deadline argues for "good enough"
- Distinguish "this looks different from iOS/macOS because it's a good, deliberate departure" from "this looks different because nobody thought about it"
- Prevent decoration from pretending to be information — a shadow, a gradient, or an animation must earn its place by communicating state or hierarchy, not just filling space

## Context & environment *(INFERRED)*
- Has designed or reviewed native iOS/macOS apps professionally; treats the HIG as a design contract, not a suggestion
- Evaluates web/cross-platform apps by the same bar as native ones — "it's a web app" is not an excuse they accept, because users don't context-switch their expectations when a browser tab looks like an app
- Opens a new screen and does an instant pass before reading a word of copy: type hierarchy, spacing rhythm, touch-target sizes, whether controls look pressable, whether the layout has one clear focal point or five competing ones
- Has strong, immediately-stated opinions and expects to be argued with on substance ("show me why this custom slider is better than the platform's"), not talked past

## Key workflow moments
- **First five seconds on any screen:** scans for a single dominant action, a coherent type scale (not four unrelated font sizes fighting for attention), and whether interactive elements actually look interactive without a legend explaining them
- **Touching every control:** taps/clicks each button, toggle, and icon to confirm the hit target is generous (their rule of thumb: if you have to aim, it's wrong) and that pressed/hover/focus states exist and feel deliberate, not default-browser leftovers
- **Checking restraint:** counts how many things are trying to be the loudest element on screen — more than one accent color, more than one motion effect, more than one "look at me" treatment on the same screen is an automatic flag
- **Testing both appearances:** always checks light AND dark mode, because a screen that was clearly designed in only one and "ported" to the other is instantly obvious to them (washed-out text, invisible borders, a color that reads as an error in one mode and neutral in the other)
- **Reduced motion / accessibility settings:** turns on reduced motion and confirms the app actually simplifies, not just slows down; checks Dynamic-Type-equivalent scaling doesn't break layout

## Top friction points *(INFERRED)*
- **F1 — Custom controls reinventing solved problems:** a hand-rolled dropdown, toggle, or date picker that gets 80% of the way to what a native-feeling equivalent already does correctly, then ships the missing 20% (keyboard nav, focus ring, correct ARIA) as someone else's problem
- **F2 — Icon-only buttons with no label and no system-standard icon:** a bespoke glyph nobody would recognize without a tooltip, used where a well-known system icon (or at minimum a visible label) would communicate instantly
- **F3 — Decoration masquerading as hierarchy:** drop shadows, gradients, or glassmorphism applied uniformly to everything, which means it communicates nothing — if every card has the same shadow, the shadow isn't telling you which card matters
- **F4 — Motion without intent:** an animation that exists because a framework made it easy, not because it clarifies what changed, where focus is going, or what caused the transition — the HIG's stance is that motion should orient the user, not entertain them
- **F5 — Inconsistent spacing rhythm:** padding and gaps that are "close enough" rather than drawn from one deliberate scale, producing a screen that feels almost right in a way that's more unsettling than if it were uniformly wrong
- **F6 — Touch targets sized to the icon instead of the tap area:** a 16px icon with no padding, so the actual clickable/tappable region is smaller than any reasonable finger or cursor precision — this exact pattern has already been found and flagged multiple times in this app's own review history

## What they need from the studio
- A consistent type scale used deliberately — a small number of sizes/weights, each with a clear job, not sizes picked ad hoc per screen
- Native-feeling controls (or a deliberately-built equivalent that matches the full behavior contract — keyboard nav, focus states, ARIA) wherever a standard interaction pattern exists, reserving custom-built UI for where the product genuinely needs something the standard toolkit doesn't offer
- Every interactive element ≥44×44pt effective hit area, every icon-only control with a real accessible name
- Motion that always has a reason: orienting after a state change, showing where something came from or went, never motion for its own sake — and a real `prefers-reduced-motion` fallback that simplifies rather than just slows
- One clear focal point per screen — a single dominant action or piece of information the eye lands on first, with everything else visually subordinate to it
- Full light AND dark mode parity, checked as two first-class states, not one designed mode and one "inverted" afterthought

## Review lens — questions they ask of any screen
- "If I showed this to someone who's only ever used well-designed Apple apps, would anything make them wince?"
- "Is there exactly one thing on this screen that's clearly the most important, or am I being asked to figure that out myself?"
- "Did someone actually design this control, or did a component library default just happen here?"
- "Does this animation tell me something I needed to know, or is it just moving because it can?"
- "Would this touch target survive an actual thumb, not a mouse cursor with perfect precision?"
- "Is this shadow/gradient/border doing information work, or is it decoration that would look the same on every element regardless of what it means?"
- "Does dark mode look like it was actually looked at, or like light mode with the colors inverted and prayed over?"

## Red flags that make them quit or distrust the app
- A custom control that's missing basic keyboard operability or a visible focus state — proof nobody tested it without a mouse
- Every card/panel on a screen sharing an identical shadow/border treatment regardless of what it represents — decoration doing zero communicative work
- An icon-only button with no accessible name and no visual affordance that it's clickable at all
- A screen where light mode is clearly the "real" design and dark mode was generated by inverting values, producing washed-out or invisible elements
- Motion that runs on every state change uniformly, with no distinction between "this matters, orient the user" and "this happened, no need to animate it"
- A touch target under ~24×24px for anything the user is expected to tap/click precisely

**Evidence basis:** INFERRED. Validate by having an actual professional iOS/macOS designer (or someone who's shipped an App-Store-featured app) do a cold read of the app's core screens and compare their unprompted findings against this persona's stated review lens — divergence points to where this persona's opinions are too idiosyncratic or too generic to be load-bearing.
