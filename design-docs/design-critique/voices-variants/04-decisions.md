# Owner Decisions — Voices Variant UI

Resolved after the two-reviewer adversarial pass (`03-adversarial-review.md`). These lock in the open questions that pass surfaced; `plan-architect` should treat all four as settled inputs, not open questions.

## 1. Field naming (AR-9)
**Decision: "Performance tags"** — one field, e.g. `performance_tags: string[]` on the variant, holding both tone- and pace-type words together as free-form tags ("sad", "slow"). Rejected the split `delivery.tone` + `delivery.pace` alternative in favor of the simpler single field. UI-labeled "Performance" or "Performance tags" — never bare "Tone"/"Pace", to stay unambiguous against the existing character-level, closed-enum `attributes.tone` field.

## 2. Bundle export scope (AR-11)
**Decision: included by default, with a user-facing choice at export time between "all tags" and "top tags only."** Owner's framing: "this should be a full package deal," but with an option to trim. `plan-architect` should scope this as an actual export-flow control (e.g. a toggle or count selector in the export dialog), not just a silent backend default — needs a concrete interaction spec (what does "top" mean — most-recently-used? most common across the character's variants? owner should be asked for a simple, explainable rule if this isn't obvious once the export UI is sketched).

## 3. `NarratorCard.tsx` scope — resolved as a non-issue (AR-1)
Confirmed dead-in-production (demo-only fixture code, retired in an earlier consolidation per `VoicesTabContent.tsx`'s own comment). No unify-vs-diverge decision was actually needed; both adversarial reviewers flagged a false positive. No action beyond a cheap "does the demo stage still render" smoke-check if `VariantEditor`'s props change materially in Phase 2.

## 4. Default-variant star color (DC-012, `05-fable-design-review.md`)
**Decision: accent blue (`--accent`).** The filled/active default-star uses the app's existing accent color, deliberately distinct from the catalog card's amber "app default" badge — the two concepts never share a color, reinforcing the shape difference (outline vs. filled) with a color difference too.

## 5. Variant switcher layout shape (DC-012/DC-001, `05-fable-design-review.md`)
**Decision: horizontal strip as the primary layout for ~4 or fewer variants** (matching the real-world common case per demo fixtures and AR-6), **switching to the vertical list-rail + filter bar only past that threshold.** Same underlying components/data either way — this determines which one renders by default, not two separate builds. `plan-architect` should treat this as one component with a count-based layout switch, not two components to build independently.

## 6. Global "Set Default" control (DC-012, `05-fable-design-review.md`)
**Decision: keep it on the voice catalog card, relabeled** — "Set as App Default" (button label, `aria-label`, and a tooltip clarifying "used app-wide when no voice is specified"), plus fix the pre-existing bug where the button permanently disables itself after being set once (it currently computes its target from whichever profile is already default, so it can never be pointed at a different one). Smaller change than relocating it; the new per-variant default star and this control are disambiguated by label text and color (accent blue vs. existing amber) rather than by removing either one.

## 7. Icon-prompt (DC-013) scope and interaction
**Decision: Voice-Lab-only** (the existing voice detail page — Overview/Samples/Variants/Test tabs — not a separate feature; "Voice Lab" is just this codebase's internal name for it). Amend `voice-bundles.md` §11.1 to drop the catalog-card mention rather than build it there too. **Interaction, refined by the owner beyond either reviewer's proposal:** a single icon-only button (no visible label), hover reveals the generated prompt text as a tooltip/preview, click copies it to the clipboard. Simpler than reviewer A's "button that reveals prompt only after copying" — the owner wants the prompt visible on hover, before committing to copy.

## Carried forward, still needing resolution during `plan-architect`'s own scoping pass
- **AR-10 filter semantics**: adopt this repo's existing OR-within/AND-across convention (already used by the character-level facet filter) unless `plan-architect` finds a reason not to; normalize tag values to lowercase server-side.
- **AR-2 backend write path**: the dedicated endpoint / allowlist extension, the two read-surfacing points, and the `voice-bundles.md` spec bump are now Phase 1a's actual scope, not a one-line add.
- **DC-012 write endpoint**: a new endpoint to set `default_variant` per character belongs in Phase 1a alongside the `performance_tags` backend work (same touchpoint sweep), per both Fable design reviewers' sequencing note — don't ship the new star UI before its write path exists, and don't ship it while the old catalog-card button is still broken.
- **Stop naming the base variant "Default" as a literal string** in the create-variant flow, now that a real default-star exists — both design reviewers flagged the naming collision this would otherwise cause.
