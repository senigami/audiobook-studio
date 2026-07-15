# Voices / Voice Lab — Round 2 Design Findings

```
scope: 6 owner-named areas (Voice Lab IA, attribute controls, pill↔section color
       correspondence, icon-upload consolidation, catalog card rework, catalog facet filters)
reviewed_against: design-system.md v1.14.0, voice-taxonomy.json, personas 06 (Casting
       Director) + 44 (Apple HIG Purist), WCAG 2.2 AA, Nielsen heuristics
method: read live source on branch studio2/phase-12.7-final-polish (not round-1 descriptions)
date: 2026-07-15
supersedes-scope-of: ../voices-variants/ (round 1 — shipped; this round is what it missed)
```

## Evidence grades

- **[VERIFIED]** — confirmed by reading the current source; file:line cited.
- **[GUIDELINE]** — follows from a named HIG / WCAG / heuristic / design-system rule applied to verified code.
- **[PRECEDENT]** — justified by how this repo already solves the same problem elsewhere.

## Accessibility posture (reported first, per review discipline)

One **floor** issue this round: **F5.6** — the owner's suggested "hover the icon to reveal a play overlay" is hover-only, which has no equivalent for keyboard or touch users (WCAG 2.2, personas 29/32/43). It is a **blocker on the pattern as literally described**, not on the goal — the goal is reachable with a focus-within + always-focusable button (fix in the finding). Everything else this round is usability, hierarchy, consistency, or a functional bug — no other contrast/keyboard floor is breached by the current code, and the existing tab/switcher primitives (`VoiceDetailTabs`, `VariantSwitcher`) are already correctly ARIA-authored (roving tabindex, `aria-selected`, sr-only live region). New color work (F3, F5.3) must be validated against §2.4 AA before landing.

---

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| **P1 (blocker)** | 2 | F5.1 (broken icon — functional), F5.6 (hover-only play — a11y floor) |
| **P2 (should-fix)** | 9 | F1.1, F1.2, F1.5, F3.1, F3.2, F5.2, F5.4, F5.5, F6.1, F6.3 |
| **P3 (should-fix, lower)** | 8 | F1.3, F1.4, F2.1, F4.1, F5.3, F5.7, F6.2, F6.4 |
| **P4 (polish)** | 1 | F5.8 |

(20 findings total across the 6 areas.)

---

## Area 1 — Voice Lab tab IA: Overview + one tab per variant

Current shape: four *shared* tabs — Overview / Samples / Variants / Test (`VoiceLabPage.tsx:230-286`). Per-variant concerns are scattered across three of them.

| id | sev | surface | principle | problem | fix |
|---|---|---|---|---|---|
| **F1.1** | P2 [VERIFIED] | `VoiceLabPage.tsx:59-62,230-286`; `VariantsSection.tsx:47`; `TestTab.tsx:50-53` | Nielsen #2 (match real world); Gestalt common-region; Casting Director F2 | A single variant is one mental object, but its samples (Samples tab), its build/settings (Variants tab), and its test text/engine (Test tab) live in three different tabs. "Which variant am I editing?" is tracked by **two independent selection states** — `VariantsSection.selectedVariantName` and `TestSection.activeProfile` — reconciled only by a one-shot `preselectedTestVariant` handoff (`VoiceLabPage.tsx:62`, `TestTab.tsx:50`). The Casting Director's audition loop (pick variant → hear it → tweak → retest) crosses tab boundaries every cycle. | Restructure to **Overview + one tab per variant**. Overview holds only voice/character-level data; each variant tab owns that variant's samples, status, test text, and engine config, with one selection. Collapses the dual-selection bug by construction. |
| **F1.2** | P2 [VERIFIED] | `VoiceDetailHeader.tsx:173-209` | HIG progressive disclosure; owner directive | "Needs rebuild" is surfaced in a **shared header status strip** that lists every variant's build state at once, above the tabs — not as a badge on the variant it concerns. At 6+ variants this strip is a wall of rows competing with the identity block. Owner wants the alert **on that variant's own tab** (a badge), where the fix action also lives. | Move the per-variant rebuild/built/tested state onto each variant tab (label + a badge on the tab trigger for "needs rebuild", dual-encoded icon+text per §6/INV-4). Retire the omnibus strip, or reduce it to a single roll-up ("2 variants need rebuild"). |
| **F1.3** | P3 [VERIFIED] | `VariantsTab.tsx:19-24,59-72`; `VoiceLabPage.tsx:145-146` | Functional completeness; owner directive (per-variant engine config) | Engine/Voice-Settings today edits **only the default variant's** settings — a documented "smallest reasonable call" (`VariantsTab.tsx:19-24`). A non-default variant's engine config is only reachable indirectly via the Test tab's folded-in `ScriptEditor`. Owner wants each variant tab to carry **its own engine-configuration selector**. | Give every variant tab its own engine-config control bound to *that* profile's `settings`, not the group default. |
| **F1.4** | P3 [VERIFIED] | `TestTab.tsx:57`; `OverviewTab.tsx:47` | Owner directive; reduce blank-slate friction (persona 28) | A variant's test text defaults to `profile.test_text ?? ''` (empty), with a manual "Suggest from voice qualities" button. Owner wants each variant's test/preview text to **default to text matching the attributes/overview description**. | Seed a new variant's test text from the voice description / attribute summary (the same generator behind "Suggest…"), so Test opens with meaningful copy instead of empty. |
| **F1.5** | P2 [GUIDELINE] | `VoiceLabPage.tsx:230-286`; `VariantSwitcher.tsx:35-36` | HIG (tabs are for a small, stable set); scalability | **Open tension, needs an owner call.** "One tab per variant" scales badly: a voice with 8 variants = 9 tabs. Round 1 shipped `VariantSwitcher` precisely because variants are many — it switches from a horizontal strip (≤4) to a vertical rail (>4). A flat tab row can't do that. Literal one-tab-per-variant will overflow horizontally on real casts. | See **Open Decision OD-1**. Recommended: Overview tab + a variant tab region that *reuses* the existing count-based switcher (strip/rail) to select which single variant tab is shown — not N sibling tabs in one `role="tablist"`. |

---

## Area 2 — Attributes as a proper select control (not toggle-button rows)

Current: `OverviewTab.tsx:98-181` renders `class/gender/age/accent/pace` via `OneSelect` (single-select chip toggle rows) and `language/style/tone/timbre/use_case/quality` via `ManySelect` (multi chip toggle rows). Both are rows of buttons (`chip.tsx`).

| id | sev | surface | principle | problem | fix |
|---|---|---|---|---|---|
| **F2.1** | P3 [VERIFIED] | `OneSelect.tsx`; `chip.tsx`; `OverviewTab.tsx:156-167` | Persona 44 F1/F5 (custom control reinventing a select; ad-hoc rhythm); cognitive load | `class` (5 opts), `gender` (4), `age` (7) each render as a full-width wrapping row of toggle buttons. This is a lot of vertical real estate and visual noise for what are **single-value** fields. Owner wants a "proper multiselect control instead." **Caveat (needs a call):** `voice-taxonomy.json` defines class/gender/age as `one-required` (single-value); a literal *multi*-value control would break the data model and the §5 pill taxonomy (which assumes exactly one class/gender/age pill). | See **Open Decision OD-2**. Recommended: convert class/gender/age to a **compact single-select** (`SearchableSelect`, the canonical §6 typeahead) — solves the "row of buttons" complaint without violating the one-required rule. Reserve true multi-value for genuinely-many fields (already `ManySelect`) and the *filters* (Area 6, where multi is correct). |

---

## Area 3 — Pills must visually correspond to their section headers

The `--pill-*` tint tokens and the `VoicePill` primitive **are already live on the real page** (`VoicePills.tsx:32-38`, consumed by header + catalog card). This contradicts design-system.md **§5's own text** ("not yet wired into the real Voices page") — the spec is stale.

| id | sev | surface | principle | problem | fix |
|---|---|---|---|---|---|
| **F3.1** | P2 [VERIFIED] | Summary pills `VoiceDetailHeader.tsx:111-115` vs section labels `OneSelect.tsx:19-22` / `ManySelect.tsx:26-28` (`.metadata-field-label`, plain muted uppercase) | Gestalt similarity (same hue ⇒ same category); design-system §5 | The top-of-page summary pills are hue-coded (class = indigo, gender = pink, age = amber, extended = teal). The attribute **section headers below** ("CLASS", "GENDER", "AGE"…) are all identical muted-grey uppercase text. Nothing links "this pink pill" to "the GENDER section." The user has to read every pill to map it. | Tint each attribute section header (or a small leading hue marker on it) with the matching `--pill-*-text` hue, so header colour == pill colour == category. Validate the header-on-surface ratio against §2.4 (pill *-text tokens are ≥4.7:1 on surface). |
| **F3.2** | P2 [VERIFIED] | `chip.tsx:16-20` | Design-system §5 (distinct hue per facet); consistency with `VoicesTabHeader.tsx:52-57` | The metadata editor's active chip is painted generic `--accent` (blue) for **every** facet — an active CLASS chip and an active GENDER chip look identical, and neither matches its own pill hue. Meanwhile `VoicesTabHeader` already tints active facet chips with the correct `--pill-*` tokens (`ACTIVE_CHIP_STYLE`). Inconsistent within the same page family. | If any facet control stays chip-based, its active state must use that facet's `--pill-*` tokens (reuse the `VoicesTabHeader` map). If F2.1 converts these to selects, apply the hue to the select's selected-value/label instead. Then update design-system.md §5 status from "target" → "current" (spec/code joint-authority, CLAUDE.md). |

---

## Area 4 — Fold icon upload into the identity icon

Current: `IconUpload.tsx` is a standalone "ICON" `metadata-field` section inside Overview (`OverviewTab.tsx:103-110`) — a labelled row with a preview thumbnail, an "Upload/Replace icon" button, a copy-prompt button, a hint line, and a drop zone. The **same** icon is already shown large in `VoiceDetailHeader.tsx:92-102` (and on the catalog card). So the icon has two on-page representations.

| id | sev | surface | principle | problem | fix |
|---|---|---|---|---|---|
| **F4.1** | P3 [VERIFIED] | `OverviewTab.tsx:103-110`; `IconUpload.tsx:118-190`; `VoiceDetailHeader.tsx:92-102` | Cognitive load ("every element defends its existence"); persona 44 F3; DRY | The voice has one icon but two UI slots for it — the big header avatar (display only) and a separate Overview "ICON" section (edit). Owner wants the edit folded **onto the identity icon**: a replace button beneath the image + drag-drop directly onto the image, no separate section. | Make the identity avatar the drop target: overlay/underlay a "Replace" button, accept drop on the image, keep the crop-modal + copy-prompt affordances, and **delete** the standalone ICON `metadata-field`. **Keep both the button and the drop path** (drop is a convenience; the button is the keyboard/click floor — do not ship drop-only). |

---

## Area 5 — Voices catalog card rework (`VoiceCatalogCard.tsx`)

| id | sev | surface | principle | problem | fix |
|---|---|---|---|---|---|
| **F5.1** | **P1** [VERIFIED] | `VoiceCatalogCard.tsx:158,214-215` | Functional correctness; regression | **Broken image.** `iconUrl = metadata?.image ?? null` is passed straight to `<img src=…>`. `metadata.image` is a stored asset path, **not** the served endpoint. Every other consumer builds `/api/voices/{id}/icon` (`VoiceLabPage.tsx:176`, `IconUpload.tsx:114`, header via prop). So any voice with a custom icon renders a broken image on the catalog card. | `const iconUrl = metadata?.image ? \`/api/voices/${encodeURIComponent(speaker.id)}/icon\` : null;` |
| **F5.6** | **P1** [GUIDELINE] | owner's hover-play suggestion; `VoiceCatalogCard.tsx:197-249` | WCAG 2.2 (hover has no keyboard/touch equivalent); personas 29/32/43; persona 44 (survives a real thumb) | **A11y floor on the pattern as described.** A play control revealed *only* on mouse hover of the avatar is invisible and unreachable for keyboard and touch users. Also, a play button nested inside the card body (already `role="button"` navigating to Voice Lab, `:197-209`) needs `stopPropagation` and must not be a nested native button. | Keep a **real, always-in-DOM, focusable** play `<button aria-label>`; reveal the overlay on `:hover, :focus-within` (so keyboard focus reveals it too); on touch it stays visible or tappable. `stopPropagation` on its handlers. ≥44px effective target (F5.7). This satisfies the owner's intent without the floor breach. |
| **F5.2** | P2 [VERIFIED] | `VoiceCatalogCard.tsx:303-317`; `voice-lab.css:113-120` | HIG (overflow menu convention); design-system §6 (`ActionMenu`) | The kebab is the last child of the wrapping `.voice-catalog-card__actions` flex row at the card **bottom**, so it reads as "below the card," not the conventional top-right corner. | Position the `ActionMenu` trigger absolute top-right of the card (mirror the current default-badge corner). It's portal-rendered, so only the trigger placement changes. |
| **F5.3** | P3 [VERIFIED] | `VoiceCatalogCard.tsx:179-184`; `voice-lab.css:24-36`; cf. `VariantSwitcher.tsx:162-186` | HIG iconography; §9.3 (meaningful marker); avoid two meanings on one glyph | "App default" is a text pill top-right. Owner wants a **star, top-left**. Note there are now **two** star meanings in this feature: app-default (catalog) and variant-default (`VariantSwitcher`, already accent-blue). `VariantSwitcher`'s own header comment (`:18-20`) mandates the app-default control be visually distinct from the variant star. | Replace the text badge with a filled `Star` **top-left**, tinted `--as-amber` (matches today's amber default-badge and stays distinct from the variant-default accent star). Keep `aria-label="App default voice"`. Frees the top-right corner for the kebab (F5.2). |
| **F5.4** | P2 [VERIFIED] | `VoiceCatalogCard.tsx:276-301` | HIG (destructive/secondary → overflow; de-emphasise delete); design-system §6 | "Set as App Default" and "Delete" are always-visible pills. Owner wants them in the kebab. **Note the conflict:** the code comment (`:289-292`) says they were made direct on purpose for Power-User/Large-Catalog "one-card-at-a-time" speed. Owner request reverses that; owner is ground truth, and HIG agrees (an always-visible Delete on every tile is a mis-click hazard). | Move **Set as App Default** and **Delete** into `ActionMenu` (Delete as an `isDestructive` item under a divider). Confirms via existing `requestConfirm`. |
| **F5.5** | P2 [VERIFIED] | `VoiceCatalogCard.tsx:251-318` | HIG (one clear primary action); persona 44 F3 ("more than one look-at-me"); cognitive load | The card fields **five** competing always-visible controls (Play, Build CTA, Set-default, Delete, kebab). No single focal point — the squint test fails. | After F5.4/F5.6: leave **one** primary action visible (the phase-driven Build/Open CTA) + the play overlay on the avatar; push the rest to the kebab. See **OD-4** for whether Build stays on the card. |
| **F5.7** | P3 [VERIFIED] | `voice-lab.css:80-82` | WCAG 2.5.5; persona 44 F6 (target sized to icon, "already flagged in this app's history") | The avatar is 40×40px. If it becomes the play + drop target, the effective tap area for the play overlay is <44px on a small circle. | Enlarge the catalog avatar (≥48px, ideally 56px) so the hover/focus play overlay clears a 44px target; ensure the overlay button fills it. |
| **F5.8** | P4 [VERIFIED] | `voice-lab.css:28,103,122-148` | design-system §4 type scale; persona 44 F5 | Several sub-scale literal sizes: default-badge `0.55rem`, description `0.65rem`, all four action buttons `0.65rem` — none on the `--type-*` scale (micro = 0.6875rem). | Move to `--type-micro`/`--type-caption` when this card is touched (§4.3 "migrate on next touch"). |

---

## Area 6 — Catalog facet filters: compact multiselect + separate tag filter

Current: `VoicesTabHeader.tsx:223-304` renders CLASS/GENDER/AGE as three rows of single-select toggle buttons; filtering is single-value equality (`useVoicesData.ts:102-104`); options are hardcoded constants in `VoicesPage.tsx:21-42`.

| id | sev | surface | principle | problem | fix |
|---|---|---|---|---|---|
| **F6.1** | P2 [VERIFIED] | `VoicesTabHeader.tsx:223-304` | Cognitive load; personas 41 + 06 (filter/sort at scale); HIG (compact filters) | Three toggle-button rows (16 buttons for a fully-populated taxonomy) sit above the grid, single-select only, eating vertical space before the first card. Owner wants **three compact multiselect controls side by side** + a **separate free-form tag filter**. | Replace the three chip rows with three compact multiselect comboboxes (class/gender/age), OR-within-facet + AND-across-facet, plus a distinct free-text/`performance_tags` filter field. |
| **F6.3** | P2 [GUIDELINE] | design-system §6 (primitive registry) | Reuse over reinvention; persona 44 F1 | **No canonical compact multiselect exists.** `SearchableSelect` is single-value; `ManySelect` is chip-toggle rows (not compact). Areas 2 and 6 both need a compact multi/select — a shared primitive opportunity, and a §6 gap. | See **Open Decision OD-3**: build one `MultiSelect` primitive (register in §6) reused by Area 6 filters (and single-select variant reused by Area 2), rather than two bespoke controls. |
| **F6.2** | P3 [VERIFIED] | `VoicesPage.tsx:21-42` vs `taxonomy.ts:14-42` | Single source of truth; CLAUDE.md spec/code joint authority | The facet option constants are **hardcoded and already drifted** from the taxonomy (e.g. AGE `"Senior"` here vs `"Senior / Elderly"` in `taxonomy.ts`). Owner explicitly wants the enums restricted to `voice-taxonomy.json`. | Derive class/gender/age options from the taxonomy source (`getSection`) — delete the duplicate constants. |
| **F6.4** | P3 [VERIFIED] | `useVoicesTabState.ts`; `useVoicesData.ts:102-104` | Correctness (data-model change is engineer scope) | Multiselect changes filter state from `string` to `string[]` and equality to set-membership. This is logic, not just styling — flag so it's scoped to engineer, not treated as a CSS tweak. | State shape `classFilter: string → string[]`; filter predicate `!f.length || f.includes(attr)`. |

---

## Open decisions — need the owner's explicit call before build

- **OD-1 — RESOLVED (owner, 2026-07-15, final):** No "Overview tab" and no sibling per-variant tabs. Voice/character-level fields (icon, description, languages, voice-level attributes/tags) move into a **collapsible section above the variant area** — not a tab, a disclosure panel (expanded by default; collapses to reclaim vertical space once the owner is focused on variants). Below it, the page has exactly **one navigation surface**: the existing round-1 `VariantSwitcher` (strip ≤~4 variants, filterable rail past that — reused as-is, not rebuilt) selecting which single variant's panel shows. That panel is the payload of this phase: it now also carries the variant's samples list, build/tested/ready state + "needs rebuild" badge (on the switcher item), engine-config selector, and seeded test/preview text — everything that used to live on the shared Samples/Variants/Test tabs collapses into it. Net result: zero tabs, one collapsible voice-level panel, one variant workspace.
- **OD-2 — RESOLVED (owner):** "Multiselect" refers to Area 6 (catalog-page filtering), not Area 2 (per-voice attribute assignment). class/gender/age stay single-value on the Overview tab (convert button-rows → single-select combobox); the catalog-page filter bar gets true multiselect per facet, per Area 6.
- **OD-3 — RESOLVED (eng call, proceeding as recommended):** build one new shared `MultiSelect` §6 primitive (registered in design-system.md), reused by Area 6's filters; Area 2's single-select reuses `SearchableSelect`.
- **OD-4 — RESOLVED (proceeding as recommended):** "Build voice" stays on the catalog card as the one visible primary CTA; Set-default + Delete move into the kebab.
- **Non-negotiable (not an option): F5.6** — however the play affordance is styled, it must be keyboard- and touch-reachable, not hover-only. Treat as a build constraint.
