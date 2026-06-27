# ADR-0015: Attribution Encoding — Color Is Character Identity Only

**Date:** 2026-06-27
**Status:** Accepted
**Deciders:** Studio owner (arising from the chapter-editor design review / fusion panel)

## Context

The Studio dialogue views encode three different facts about a line: **who** speaks it (identity), **how** it is performed (Natural / Whisper / Urgent / custom labels), and whether its voice **collides** with another character (two characters cast to the same voice — a casting mistake that otherwise stays invisible until the first full render).

Speaker-colored bars were added to the Screenplay/Stage views so a reader can scan one character's lines down the page. A design review then raised a sharp question: should the bar be colored **by voice** so that two characters sharing a voice visibly read as a conflict? That is appealing — it surfaces the collision the casting director most fears — but it overloads the color channel, and the owner rejected it for a concrete reason: *"I don't want Sally to have three colors. If I have 15 characters each with variations, that is mud."*

The underlying tension: there are three facts but only one color channel. Loading more than one fact onto color produces an unreadable result at realistic scale, and fails WCAG 1.4.1 (information conveyed by color alone).

## Decision

Each fact gets its **own** channel; color carries exactly one meaning.

1. **Speaker color = identity, and only identity.** A character's color (cast-palette dot, Book-view sentence underline, the speaker-colored bar in Screenplay/Stage) encodes *which character* — nothing else. **Exactly one color per character.** Color never encodes the assigned voice, the variation, or any state. A character keeps one color across all its variations; two characters never share a color.

2. **Performance variation = a text label, never color.** Natural / Whisper / Urgent (and custom per-voice labels like "Commanding") render as a small **text** label beneath the speaker name, using the voice's own variation label.

3. **Voice collision = an `AlertTriangle` ⚠ flag, never re-coloring.** Two characters on one voice surface as a `⚠` on each affected cast row (with `aria-label` naming the other character) and a collision count on the tier header — discoverable even when the tier is collapsed.

This is captured as a binding rule in [design-system.md §9.6](../specs/design-system.md).

## Why this shape

- **Color overload is mud.** A chapter with 15 characters, each with 2–3 variations, becomes unreadable the moment color tries to carry identity *and* variation, or identity *and* collision. One meaning per channel keeps the page legible at scale.
- **Color-by-voice erases identity.** If the bar followed the voice, two characters sharing a voice would render identically — destroying the "scan one character's lines" affordance the bars exist for, in order to surface a (rarer) collision. A dedicated flag surfaces the collision *without* sacrificing identity.
- **Accessibility.** Variation-as-text and collision-as-icon mean none of the three facts is color-only, satisfying WCAG 1.4.1. This mirrors the `StatusOrb` rule (status is icon + color, never a bare dot) already binding in the design system.

## Rejected alternatives

- **Color the bar by voice (to reveal collisions).** Surfaces collisions but creates mud at scale, breaks one-color-per-character, makes two distinct characters look identical, and fails 1.4.1. Rejected — replaced by the dedicated ⚠ flag.
- **Encode variation as a color tint / opacity / second swatch.** Multiplies one character into many shades — the exact "Sally has three colors" outcome the owner rejected.

## Consequences

### Positive
- Attribution surfaces stay legible no matter how many characters or variations a chapter has.
- Casting collisions are surfaced explicitly (flag + tier count) and remain discoverable when collapsed.
- WCAG 1.4.1 holds across all three facts.

### Negative / Trade-offs
- A collision is not encoded *in the prose itself* (the bars look fine); it is surfaced in the cast list. Acceptable: the cast list is where casting decisions are made, and the tier-header count keeps it visible without expanding.

### Neutral
- Realized in the mock (`frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx`); binding for the production Studio editor as it lands.

## References
- [design-system.md §9.6 Attribution encoding](../specs/design-system.md)
- [site-shell-and-book-pipeline.md §3.2 Studio](../specs/site-shell-and-book-pipeline.md)
- [ADR-0014](ADR-0014-directors-console-layout.md) (the views these rules render in)
- `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx`
