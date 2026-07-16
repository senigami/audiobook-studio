# Desired design vs. what shipped — voices-variants-round2

Distilled from `01-findings.md` (OD-1 through OD-4, owner-resolved 2026-07-15) and `02-improvement-plan.md`'s North Star, cross-checked against the actual shipped code as of commit `d44aeeba`.

## The intended end state (owner-approved)

**Voice Lab detail page:**
- No tabs at all. Voice/character-level fields (icon, description, languages, class/gender/age, extended attributes, free tags) live in a single **collapsible disclosure panel**, expanded by default, at the top of the page.
- Below it, exactly **one navigation surface**: the variant switcher (a strip of ≤4 variants, or a filterable vertical rail past that) — reused unmodified from round 1.
- Selecting a variant shows **one panel** carrying everything about that variant: performance tags, samples, build/tested/ready status + "needs rebuild" badge (on its own switcher entry, not shared), engine config, and test/preview text (seeded from the voice's attribute summary when empty).
- The default variant is selected on load and sorted first in the switcher.
- Icon upload/replace happens directly on the header avatar (button + drag-and-drop onto the image) — no separate section.
- Attribute section headers (CLASS/GENDER/AGE labels) color-match the summary pills above them, so pill hue and section identity read as the same thing.

**Voices catalog page:**
- Each card: broken icon fixed, one visible primary action (Build), default status as a star (not a text pill), kebab top-right holding Rename/Export/Set-as-App-Default/Delete, Play as a hover/focus-reveal overlay on the avatar (keyboard- and touch-reachable, never hover-only).
- CLASS/GENDER/AGE filters as three compact multiselects sourced from the taxonomy file, plus a separate free-form tag filter — replacing three long rows of toggle buttons.
- Touch targets on the smaller controls (avatar/play overlay) at or above 44px.

## What actually shipped

| Area | Desired | Shipped | Match |
|---|---|---|---|
| Voice Lab tab shell | Retired entirely | Retired (`VoiceDetailTabs.tsx` deleted) | ✅ |
| Voice-level fields | Disclosure panel, expanded by default | `<details open>` above the variant area | ✅ |
| Variant navigation | Switcher only, no tabs | `VariantsSection` (switcher + one `VariantEditor`) is the sole nav | ✅ |
| Per-variant samples/status/rebuild/engine/test-text | All in one panel | All folded into `VariantEditor` | ✅ |
| Default variant first + selected | Yes | Sorted first, selected on load (verified in the adversarial review) | ✅ |
| Icon upload | On the header avatar | Moved onto `VoiceDetailHeader`'s avatar (button + drag-drop) | ✅ |
| Pill ↔ section-header color match | Headers tinted to pill hue | Done in the coverage-gap corrective pass (F3.1) | ✅ |
| Catalog card actions | One visible action + kebab | Build visible; Rename/Export/Set-default/Delete in kebab | ✅ |
| Catalog default badge | Star, not text pill | Star badge, top-left | ✅ |
| Catalog play control | Hover/focus overlay, keyboard-reachable | Avatar overlay button, opacity-gated (not `display:none`) | ✅ |
| Catalog filters | 3 compact multiselects + tag filter | Shipped via new `MultiSelect` primitive | ✅ |
| Touch targets ≥44px | Yes | Avatar 56px, play button 44px (fixed in coverage pass) | ✅ |
| Variant renaming | (not explicitly in the plan's own checklist, but a pre-existing capability) | Broke silently during the redesign, then restored in adversarial review | ✅ (recovered) |
| Sub-scale font-size literals on the catalog card (F5.8, P4/cosmetic) | Migrate when the file is touched | Not done — deliberately deferred, noted, not silently dropped | ⚠️ open, low priority |

## Bottom line

Everything the owner explicitly resolved (OD-1 through OD-4) and every P1/P2 finding is implemented and verified (2236 tests, `tsc` clean). One P4 cosmetic item (F5.8) remains open by choice. This document is the answer to "how do we compare" as of commit `d44aeeba` — a fresh design-critique pass (requested separately) is the way to catch anything this internal comparison can't, since it was authored by the same hands that built the fix.
