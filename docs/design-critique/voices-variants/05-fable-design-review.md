# Fable Design Review — Default-Variant Star + Overall Layout

Two independent Fable-tier design reviewers, working blind to each other, evaluated the accumulated plan (including the new DC-012 finding) with explicit design authority to push back or refine, not just confirm.

## Where both reviewers agree (treat as settled)

- **The current layout is genuinely bad**, not just "could be improved" — both independently cited the same source comment (`VariantEditor.tsx:140-142`) admitting variants are visually indistinguishable, and both separately noticed the play-pulse animation's shared `layoutId` would make it visibly teleport between cards if two variants ever animated at once (a concrete bug beyond DC-004's reduced-motion finding).
- **Master-detail is the right core direction** — neither reviewer proposed abandoning it.
- **The default-star must be quiet, not badge-like**: outline glyph at rest, filled when active, trailing position in the row (after tags, before/at the row's end), ≥24px hit target, `aria-pressed` + a clear label, and **no confirmation dialog** — both independently verified `default_variant` has no destructive or hard-to-reverse side effect (it's only read by the Hugging Face export path to choose the bundle root folder), so a one-tap toggle is correct and a confirm step would contradict the "no special treatment" instruction.
- **The existing catalog-card "★ default" button is a separate, already-broken control** (self-disables after first use) and must not be confused with the new per-variant star — both flagged this as a real, pre-existing bug independent of this plan.
- **Stop naming the base variant "Default" as a literal string** once a real default-star exists, or a non-default variant will confusingly display the word "Default" as its name.

## Three points where they genuinely disagreed — your call needed

**1. What color is the filled (active) star?**
- Reviewer A: accent blue (`--accent`), deliberately *different* from the catalog card's amber, so the two concepts never share a color.
- Reviewer B: reuse the existing amber (`--warning`), arguing shape (outline vs. filled) is the load-bearing signal, color is just reinforcement — but only proposed this alongside removing the star from the catalog card entirely (see point 3), which would make amber safe to reuse since nothing else would be wearing it.

**2. Should the variant switcher always be the vertical list-rail, or should it switch shape depending on how many variants exist?**
- Reviewer A: keep the vertical rail as already planned; minor tweak to hide the filter bar below 2 variants instead of 3.
- Reviewer B: pushed back harder — since the demo data and AR-6 both confirm most characters have 1-4 variants in practice, argues the vertical rail is ceremony at that scale, and proposes the plan's own existing "horizontal chip-strip" fallback (currently written as a narrow-viewport fallback) should instead be the **primary** layout whenever a character has ≤~4 variants, switching to the vertical rail + filter bar only past that count. Same components and data either way — just which one shows by default.

**3. Should the existing global "Set Default" (app-wide fallback voice) stay on the voice catalog card, just relabeled, or be pulled off the card entirely?**
- Reviewer A: keep it on the card, relabel to "Set as App Default" with a clarifying tooltip, fix its self-disabling bug.
- Reviewer B: more aggressive — remove it from the card entirely, since it's "a rare, configuration-grade action, not a per-card CTA," and relocate it into an overflow menu or Settings with a different icon entirely (not a star at all — e.g. a pin/check badge), on the reasoning that two stars meaning two things anywhere in the same app is the same class of mistake as DC-006's icon reuse finding.

Neither disagreement blocks starting the backend work (Phase 1a is unaffected). All three are frontend/visual decisions that only need resolving before Phase 2 (the rail/strip itself) is scoped in `plan-architect`.
