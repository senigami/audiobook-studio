# Design Critique — Voices Page: Variant UI
**Date:** 2026-07-15
**Scope:** `frontend/src/pages/Voices/components/VariantEditor.tsx` and the surrounding variant chrome — `frontend/src/pages/VoiceLab/components/VariantsSection.tsx`, `VariantsTab.tsx`, `VoiceDetailTabs.tsx`, plus the catalog-level `frontend/src/pages/Voices/VoicesPage.tsx` and `VoiceCatalogCard.tsx` for context. Not a full-app audit.
**Frameworks:** WCAG 2.2 (Lane A), Nielsen heuristics (B), cognitive load (C), affordances/HIG (D), visual hierarchy/Gestalt (E), color/design-systems (F) — plus four project personas run as extra reviewer lenses: **44 — Apple HIG Purist** (heavily weighted per owner request), 06 — Casting Director, 41 — Large Catalog Curator, 45 — Design-Systems Consistency Reviewer.
**Style guide used:** Yes — `design-docs/specs/design-system.md` §5 (pill taxonomy) and §6 (canonical primitives), cross-checked against `frontend/src/theme/tokens.css`.
**Method:** Fan-out mode — 5 parallel Opus-tier reviewer agents (Lanes A/B/C/F combined, Lanes D/E combined, the Apple HIG Purist persona alone, the three remaining personas combined, and the Apple/Material3/Linear exemplar pass), synthesized here. Evidence gathered from source, `tokens.css`, `design-system.md`, and live screenshots of the running app (both dark and light mode, provided by the user and captured directly).

---

> **TL;DR:** The ask ("let each variant carry its own tone/pace performance tags") is the right feature, but it cannot be bolted onto the current UI. Every one of the five independent reviewer lenses — including the heavily-weighted Apple HIG Purist, who explicitly said "you cannot bolt tag chips onto this. The IA is the bug." — converged unprompted on the same diagnosis: variants render as N full-height, visually-identical stacked cards with zero differentiating tags, a layout that already strains under 2 variants and breaks outright past ~5. The fix is a structural one: replace the stacked column with a compact, tag-forward variant list feeding one shared detail editor (the Xcode-scheme-picker / Photos-variant-strip / Linear-issue-list pattern), reusing primitives this codebase already has — `VoicePillRow`, the `VoiceDetailTabs` ARIA tablist, a new `TagAutocompleteInput` merging two existing patterns (`TagsInput`/`ManySelect`), `ActionMenu` — rather than inventing anything new. *(Correction: an earlier draft of this critique cited `SearchableSelect` for tag entry — verified inaccurate, see `03-adversarial-review.md` AR-3; it's a single-value picker, not reusable for multi-value tags.)*

## What we reviewed
The Variants tab of a voice's detail page (`VoiceDetailTabs.tsx` → `VariantsTab.tsx` → `VariantsSection.tsx`, which maps every `SpeakerProfile` to a full `VariantEditor`). Evidence came from reading the components and `tokens.css`/`design-system.md` directly, plus live screenshots of a real 2-variant voice ("Dark Fantasy": "Default" + "Light Narrator") in both dark mode (agent-captured) and light mode (user-provided), confirming the code-level finding that variants carry zero tags today while the parent voice carries 19. Interactive-state screenshots (hover/focus) were not captured; any finding resting on those is marked accordingly in `01-findings.md`.

## What's working
- ✓ The character-level pill taxonomy (`--pill-class/-gender/-age/-extended/-tag`) is a genuinely well-designed, tinted-fill, no-icon system that already reads clearly at 19 tags on one voice — this is the right visual language to extend down to the variant level, not replace.
- ✓ `VoiceDetailTabs.tsx` is a complete, correct WAI-ARIA tablist (roving tabindex, arrow/Home/End navigation, `aria-selected`, screen-reader announcements) — a strong, reusable precedent for any variant-switcher work.
- ✓ The catalog-level bulk-select pattern (`VoiceCatalogCard.tsx`) and `ActionMenu`/`ConfirmModal` primitives are solid, established building blocks — the variant redesign doesn't need new components for these, just needs to reuse them one level down.
- ✓ Destructive actions (Delete Variant) already route through `requestConfirm` with `isDestructive` styling — the confirm-gating discipline is correct, just needs to survive the IA change.
- ✓ Text contrast throughout the existing chrome (pills, badges, buttons) is clean — no verified WCAG contrast failures in scope.

## Findings summary
*(Updated to include DC-012, added after an owner-reported live-usage issue with the default-variant mechanism; DC-013/DC-014, added incorporating an existing owner-directed backlog item (C6) and a preservation constraint for the already-shipped dynamic recording guide. A follow-up two-Fable-reviewer design pass then found BOTH DC-013 and DC-014's original framing was stale — DC-013 is a shipped feature silently orphaned by a later rework, not new scope; DC-014's described risk no longer applies since Script already relocated to the Test tab in an earlier task. Both corrected in place, severities revised to P2.)*

| Severity | Count | Estimated total effort |
|----------|-------|-------------------------|
| P1 — Blocker | 1 | L (structural IA rework) |
| P2 — Major | 6 | M each, except DC-013/DC-014 which are XS re-wires |
| P3 — Polish | 7 | S/XS each, mostly independent of the P1 fix |
| P4 — Cosmetic | 0 | — |
| **Total** | **14** | |

## Coverage by lane
| Lane | Findings | Notable |
|------|----------|---------|
| A — Accessibility | 2 | No verified contrast failures; a reduced-motion gap and an ARIA-state nit |
| B — Usability | 2 | H8 (aesthetic/minimalist) already violated pre-tags; one icon-reuse (Jakob's Law) nit folded into D |
| C — Cognitive load | rolled into DC-001 | Hick's Law/Miller's Law: chips help IF the layout changes first, hurt if bolted onto the stack |
| D — Affordances/conventions | rolled into DC-001, DC-005/006 | Norman signifier gap, destructive-slip risk, icon reuse |
| E — Visual hierarchy | rolled into DC-001 | Gestalt similarity/common-region violated by identical stacked cards |
| F — Color/systems | 3 | Token-reuse is clean going forward; 3 pre-existing drift items (badge triplication, hardcoded pill sizing, off-scale button) |
| Persona 44 (Apple HIG Purist) | rolled into DC-001, North Star | "Would not ship" verdict; concrete list-rail + detail-pane IA proposal |
| Persona 06 (Casting Director) | rolled into DC-001/002/003 | Audition/compare workflow has no home today |
| Persona 41 (Large Catalog Curator) | rolled into DC-001, DC-010 | N-stacked-cards breaks well before the persona's own stated scale tolerance |
| Persona 45 (Design-Systems Consistency) | DC-007, DC-008, DC-009 | 3 pre-existing token/primitive-reuse violations to clean up alongside the redesign |
| Owner live-usage report | DC-012 | Two unrelated "default" concepts conflated; the one the owner actually wants has no write path at all |
| Existing-backlog incorporation | DC-013 | C6 (copyable icon image-prompt) — built, then silently orphaned by a later rework; restore, don't rebuild |
| Regression-risk check | DC-014 | Script already relocated to the Test tab in an earlier task; verify reachability + close a small existing gap |

## Top priority findings
| ID | Finding | Severity | Effort |
|----|---------|----------|--------|
| DC-001 | Stacked full-height variant cards: no differentiator, doesn't scale, structurally can't host per-variant tags | P1 | L |
| DC-002 | No per-variant performance-tag data model or rendering | P2 | M |
| DC-003 | No filter/facet to browse a character's variants by tag | P2 | M |
| DC-012 | No UI or write path exists to set a character's default variant; conflated with an unrelated, broken global-default control | P2 | M |
| DC-013 | C6 icon image-generation prompt was built, then silently orphaned by a later rework — restore, don't rebuild | P2 | XS |
| DC-014 | Script already relocated to the Test tab in an earlier task; original relocation risk doesn't apply — verify + close a small existing gap | P2 | XS |
| DC-004 | Play-pulse animation has no `prefers-reduced-motion` guard | P3 | XS |
| DC-005 | Repeated destructive Delete across indistinguishable panels (slip risk) | P3 | folds into DC-001 |
| DC-006 | "Move Variant" reuses the Rebuild icon (Jakob's Law) | P3 | S |
| DC-007 | Three different engine-badge treatments, one using inline hex-alpha instead of tokens | P3 | S |
| DC-008 | Canonical pill primitive hardcodes spacing/type instead of `--space-*`/`--type-*` tokens | P3 | S |
| DC-009 | "Add variant" button hardcodes off-scale sizing | P3 | XS |
| DC-010 | No bulk action / scope preview across a character's variants | P3 | M |
| DC-011 | Overflow-chip `aria-expanded` hardcoded/missing | P3 | XS |

## Decisions needed from you
No brand-conflicting recommendations — every proposed change reuses existing hue tokens (`--pill-*` family) and existing primitives (`VoiceDetailTabs`, the new `TagAutocompleteInput`, `ActionMenu`). The tag-vocabulary question (fixed enum vs. user-extensible) was resolved by the owner: **user-extensible**, via autocomplete-with-create-new. See `03-adversarial-review.md` for a subsequent adversarial pass that surfaced further open decisions (field naming vs. the existing controlled taxonomy, filter semantics, bundle-export scope, and a second UI consumer) that must be resolved before implementation planning.
