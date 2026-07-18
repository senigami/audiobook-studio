# Voices / Voice Lab — Round 2 Improvement Plan

Companion to [01-findings.md](01-findings.md). Phased so a smaller model / implementer can execute each phase behind clear acceptance criteria. **Phases 0–1 are low-risk and should ship first; Phases 2–4 are gated on the Open Decisions (OD-1…OD-4 in findings).**

## Impact / effort matrix

| | Low effort | Medium effort | High effort |
|---|---|---|---|
| **High impact** | **F5.1** broken icon (P1); **F5.2** kebab top-right; **F5.3** default star; **F3.1/F3.2** pill↔header colour | **F5.4/F5.5/F5.6** card action consolidation + accessible play; **F4.1** icon fold; **F6.1/F6.2** compact facet filters | **F1.1/F1.2** per-variant tab IA; **F6.3** MultiSelect primitive |
| **Med impact** | **F6.4** filter state shape | **F2.1** attribute selects; **F1.3** per-variant engine config; **F1.4** test-text default | |
| **Low impact** | **F5.8** type-scale nits | | **F1.5** tab scalability model (design, not effort) |

---

## Phase 0 — Blockers & quick wins (no open decisions; ship immediately)

Fixes that are unambiguous, self-contained, and don't depend on any owner call.

- **F5.1** — catalog icon URL → `/api/voices/{id}/icon`.
- **F5.2** — move the `ActionMenu` trigger to absolute top-right of the card.
- **F5.3** — replace "App default" text badge with an amber top-left `Star` (`aria-label` retained; distinct from the accent variant-default star).
- **F3.1 / F3.2** — tint attribute section headers (and any active chip state) to their `--pill-*` facet hue; reuse `VoicesTabHeader`'s `ACTIVE_CHIP_STYLE`. Then correct design-system.md §5 status "target → current."
- **F6.2** — derive facet options from `taxonomy.ts` (`getSection`); delete the drifted constants in `VoicesPage.tsx:21-42`.
- **F5.8** — swap sub-scale literals for `--type-micro`/`--type-caption` on the card.

**Acceptance:**
1. A voice with a custom uploaded icon renders its image (not a broken img) on the catalog card.
2. The kebab sits top-right; the app-default star sits top-left; no visual collision.
3. Each attribute section header's colour matches its pill's hue; header-on-surface contrast ≥ 4.5:1 (verify against §2.4).
4. Facet filter options come from one taxonomy source; "Senior / Elderly" (not "Senior") etc. — no drift.
5. `npm -C frontend run lint`, `build`, and existing Voices/VoiceLab vitest suites pass.

---

## Phase 1 — Catalog card action consolidation + accessible play (OD-4 confirmed)

Depends on **OD-4** (Build stays on card — recommended default). Delivers the "one primary action + overflow" card.

- **F5.4** — move Set-as-default + Delete into `ActionMenu` (Delete `isDestructive`, under a divider; keep `requestConfirm`).
- **F5.5** — result: one visible primary CTA (Build/Open) + avatar play overlay; everything else in the kebab.
- **F5.6 + F5.7** — accessible play: always-in-DOM focusable `<button aria-label>`; reveal overlay on `:hover, :focus-within`; `stopPropagation`; avatar ≥48px so the target clears 44px.

**Acceptance:**
1. Squint test: exactly one dominant action per card.
2. Keyboard-only: Tab reaches the play button (overlay appears on focus) and the kebab; Delete/Set-default reachable via the kebab; Delete still confirms.
3. No nested-native-button warning; clicking play does not also navigate the card body.
4. Play target ≥44×44px effective; screen reader announces "Play {name} preview".
5. Touch (no hover): play is reachable (visible or first-tap reveals, second-tap plays — documented behaviour).

---

## Phase 2 — Icon-upload consolidation (OD-3-independent)

- **F4.1** — fold `IconUpload` onto the identity avatar (drop on image + "Replace" button beneath); keep crop modal + copy-prompt; delete the standalone Overview ICON section. Preserve both drop **and** button paths.

**Acceptance:**
1. The Overview tab no longer has a separate ICON field; the identity avatar is the upload surface.
2. Upload via button (keyboard) and via drag-drop on the image both work and both route through the same crop/validate path.
3. Non-square images still trigger the crop modal; error text still surfaces.
4. No second icon representation remains on the page.

---

## Phase 3 — Facet filters + attribute controls as compact (multi)selects (gated on OD-2, OD-3)

Build the shared control once, apply in both places.

- **F6.3** — build a canonical compact `MultiSelect` primitive (register in design-system.md §6); a single-select mode covers Area 2.
- **F6.1 / F6.4** — replace the three CLASS/GENDER/AGE toggle rows with three compact multiselect comboboxes (options from taxonomy, OD-2 permitting) + a separate free-form/`performance_tags` filter field; filter state `string → string[]`, OR-within/AND-across.
- **F2.1** — convert Overview class/gender/age to the single-select mode of the same primitive (per OD-2's resolution).

**Acceptance:**
1. Filters occupy a compact single row (three comboboxes + tag field), not three button rows; vertical space above the grid materially reduced.
2. Selecting two classes shows voices matching *either*; adding a gender narrows to *both* facets (AND across, OR within).
3. Options restricted to the taxonomy enum; free tags filter `performance_tags`/free tags only.
4. `MultiSelect` is keyboard-operable (open/close, arrow, type-ahead, multi-toggle, Escape), has a visible focus ring, and carries an accessible name — meets the §6 primitive contract (persona 44 F1).
5. Overview attribute editing works via the new compact control; required-field gating unchanged.

---

## Phase 4 — Voice Lab IA collapse: disclosure panel + single variant workspace (gated on OD-1 — highest effort/impact)

The structural payload. Do not start before OD-1 is resolved. **Final shape (OD-1, 2026-07-15): no tabs at all.** Today's Overview/Samples/Variants/Test four-tab `VoiceDetailTabs` is retired outright, replaced by two stacked regions:

- **F1.0 (new)** — voice/character-level fields (icon, description, languages, voice-level attributes/tags) move into a `<details>`-style collapsible panel at the top of the page, expanded by default. This absorbs the current `OverviewTab.tsx` content; the component is repurposed, not deleted.
- **F1.1 (revised)** — below the disclosure panel, the page's only navigation is the existing round-1 `VariantSwitcher` (strip/rail, reused unchanged) driving a single selected-variant panel. Collapse the dual selection state (`VoiceLabPage`'s `preselectedTestVariant` vs `VariantsSection`'s own selection) into the one switcher-owned selection.
- **F1.2** — per-variant build/tested/ready state + "needs rebuild" badge rendered on the variant's own switcher item; retire the shared header strip entirely (it was Overview-level chrome that no longer has a home now Overview isn't a peer surface).
- **F1.3** — per-variant engine-config selector bound to that profile, inside the variant panel.
- **F1.4** — seed test text from the description/attribute summary, inside the variant panel.
- **F1.5** — per-variant samples list (each variant's own samples, not the shared `SamplesTab.tsx` list), inside the variant panel.

**Acceptance:**
1. No tab UI remains on this page (`VoiceDetailTabs`/the 4-tab strip is gone) — one collapsible disclosure section (voice-level) + one variant workspace (switcher + single panel).
2. The disclosure panel shows only voice/character-level fields (name, description, languages, tags, attributes, icon) — no per-variant data leaks into it.
3. Selecting a variant in the switcher shows exactly that variant's samples + status + test text + engine config, driven by the switcher's own selection state (no `preselectedTestVariant` reconciliation hack).
4. "Needs rebuild" appears as a badge on that variant's switcher entry, not in any shared strip.
5. A voice with 8 variants remains navigable via the switcher's existing strip/rail scaling — no new overflow surface introduced.
6. Each variant's engine config edits *that* variant; a newly added variant's panel opens with seeded test text.
7. Keyboard/ARIA parity with today's `VariantSwitcher` (roving tabindex, `aria-selected`/`aria-pressed`, sr-only live region) — no regression since the switcher itself isn't rebuilt, only what surrounds it.

---

## Sequencing & risk

- **Ship Phase 0 now** — pure wins, one of them (F5.1) a live P1 functional bug.
- **Phase 1** after OD-4 (trivial confirmation).
- **Phase 2** anytime (independent).
- **Phase 3** after OD-2 + OD-3; the `MultiSelect` primitive is the long pole — build and review it in isolation first (it's a new §6 primitive, so it gets the full primitive-contract bar).
- **Phase 4** last; it's the biggest surface-area change — it retires the 4-tab `VoiceDetailTabs` entirely and reorganizes it into a disclosure panel + the round-1 `VariantSwitcher`, which is reused unchanged, not rebuilt. Watch **INV-VC-2** (no functionality loss on redesign — this project has lost affordances to a redesign before): every action currently reachable (per-variant build, move, delete, set-variant-default, test, reset test text, publish, export, per-variant settings) must still be reachable after the IA change — most of it now lives inside the single variant panel instead of spread across tabs.

## Spec follow-ups (same-change discipline)

- design-system.md **§5**: flip "target → current" once F3/pills adoption confirmed; note headers now carry facet hue.
- design-system.md **§6**: register the new `MultiSelect` primitive (Phase 3).
- If Phase 4 changes the documented Voice Lab IA, update the matching spec (bump `spec_version`, add a changelog row) in the same commit — CLAUDE.md binding.
- Append a `design-docs/code-map/queue/` changelog entry after any mapped-source change.
