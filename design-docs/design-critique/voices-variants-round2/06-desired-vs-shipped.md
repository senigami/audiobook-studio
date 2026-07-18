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

## Round 2 of the fresh critique (independent, opus-tier, 2026-07-15)

As predicted above, an independent measure-pass (not authored by the hands that built the fix) found real issues this comparison couldn't see, because they're consistency/soundness problems across areas that each shipped correctly in isolation:

| Finding | Severity | Fixed |
|---|---|---|
| Variant switcher's `role="tablist"`/`"tab"` referenced `aria-controls` ids that didn't exist in the DOM | P2 | ✅ re-modeled as `listbox`/`option` |
| Roving-tabindex broken by always-tabbable nested play/star buttons (2+ Tab stops per row) | P2 | ✅ tabindex now follows row's active state |
| Catalog card body was one `role="button"` nesting other real interactive controls | P2 | ✅ scoped to the name button only |
| Voice delete used native `window.confirm()` while variant delete used the themed `ConfirmModal` | P2 | ✅ routed through `ConfirmModal` |
| Detail header had 5 equal-weight buttons — the exact clutter the catalog card was cleaned up to avoid | P2 | ✅ consolidated into a kebab; header Play preview dropped (redundant with per-variant controls) |
| Switcher's 24×24px play/star controls, under this app's own 44px standard | P3 | ✅ bumped to 44×44 |
| Star icon meant 3 different things across surfaces, distinguished only by color | P3 | ✅ variant-default now uses `BadgeCheck`, distinct from app-default's `Star` |
| Filter chips didn't match the pill-taxonomy hue (generic accent-blue regardless of facet) | P3 | ✅ `MultiSelect` gained a `category` prop, threaded from `VoicesTabHeader` |
| Voice-details disclosure always expanded, burying the variant workspace on every visit | P3 (owner call) | ✅ collapses once required attributes are complete |
| Metadata form's `MultiSelect` in-panel option-row highlight not hue-tinted (only the trigger chips were) | P4 | ⚠️ open, flagged, not fixed this round |

Commits: `988800e7` (header consolidation + delete modal + disclosure default), `b197d96e` (switcher ARIA remodel), `21df5af9` (catalog card nesting + star/chip consistency). Full suite: 2255/2255, `tsc -b` clean.
