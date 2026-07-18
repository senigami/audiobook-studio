# Improvement Plan — Voices Page Variant UI

## Impact/effort matrix

| Quadrant | Strategy | Finding IDs |
|----------|----------|-------------|
| **Big Bet** — High impact, High effort | The structural fix everything else depends on | DC-001 |
| **Quick Wins** — High impact once DC-001 lands, Low incremental effort | Ride along with the DC-001 rework since they touch the same files | DC-002, DC-003, DC-005, DC-012 (no independent cost) |
| **Regressions to restore** — High impact (both are live functionality gaps), trivially low effort | Fix immediately, don't wait for the structural work | DC-013 (re-wire an orphaned, already-built component), DC-014 (verify + close a small existing gap) |
| **Fill-ins** — Low impact, Low effort | Fix opportunistically, same session or a quick follow-up | DC-004, DC-006, DC-007, DC-008, DC-009, DC-011 |
| **Defer** — Low impact (for now), Medium effort | Real, but genuinely secondary to getting variants taggable at all | DC-010 |

## Phased roadmap

**Revised per adversarial review (`03-adversarial-review.md`, AR-4): the original "Phase 1 is one inseparable unit" framing was wrong.** The backend field + tag editing can and should land on the *current* stacked layout first — independently verifiable, delivers the user's actual ask before any structural risk — with the rail/master-detail swap following as its own phase.

**Phase 1a — Backend + tag data + default-variant write path (DC-002/DC-012, expanded per AR-2/AR-9):** dedicated per-variant write endpoint for `performance_tags` (the generic settings endpoint currently rejects unlisted keys), surfacing in both `get_speaker_settings` and `list_speaker_profiles`, a `voice-bundles.md` spec bump, and — per DC-012 — a new endpoint to set a character's `default_variant` (currently write-once-at-migration, no API path exists). Also: an explicit acceptance test for the known variant-name-resolution write hazard (AR-12/DC-012). Effort: **M**.

**Phase 1b — Tag editing on the current layout:** the new `TagAutocompleteInput` component (merging `TagsInput`/`ManySelect`), wired into the existing `VariantEditor` header as read/write chips — ships the taggable-variants feature without touching the stacked-card IA yet. Effort: **M**.

**Phase 2 — The structural rework:** DC-001 (master-detail split, revised shape per the Fable design review — see North Star below) + DC-003 (filter bar, semantics resolved per AR-10) + DC-005 (destructive-delete slip risk, resolved for free by the new selection model) + DC-012's frontend half (the default-variant star, spec below). Do NOT ship the new star before Phase 1a's write endpoint exists, and relabel the catalog card's existing "Set Default" button ("Set as App Default," per the owner decision below) in the same phase so two stars are never ambiguous on screen at once. Effort: **L**.

**Phase 0 — Restore two live regressions (DC-013, DC-014), independent of everything else, do first:**
- **DC-013:** reuse `buildIconPrompt()` (already correct and taxonomy-agnostic — do not rebuild) behind a NEW, simpler UI than the original `VoiceIconControls`, per owner decision (`04-decisions.md` §7): a single icon-only button, no label, hover reveals the prompt as a tooltip/preview, click copies it. Voice-Lab-only (spec amended to drop the catalog-card mention, same commit). Fix the pre-existing silent clipboard-failure swallow while here, and ensure the tooltip is keyboard/focus-reachable, not hover-only. Add a render test so the affordance can't be silently orphaned again.
- **DC-014:** no code changes required beyond carrying the existing `onEditTestText` wiring into the new `ActionMenu` overflow item — Script already only ever switches to the Test tab (an earlier task already retired the modal/drawer this finding originally worried about). Verify the 3 acceptance criteria in `01-findings.md`'s DC-014 entry, and land the one natural improvement it identifies: pass the selected variant through so the Test tab preselects it (previously discarded, now cheap given the new selection model).

Effort: **XS** combined for both.

**Phase 1a — Backend + tag data + default-variant write path (DC-002/DC-012, expanded per AR-2/AR-9):** dedicated per-variant write endpoint for `performance_tags` (the generic settings endpoint currently rejects unlisted keys), surfacing in both `get_speaker_settings` and `list_speaker_profiles`, a `voice-bundles.md` spec bump, and — per DC-012 — a new endpoint to set a character's `default_variant` (currently write-once-at-migration, no API path exists). Also: an explicit acceptance test for the known variant-name-resolution write hazard (AR-12/DC-012). Effort: **M**.

**Phase 1b — Tag editing on the current layout:** the new `TagAutocompleteInput` component (merging `TagsInput`/`ManySelect`; design it generically enough to also serve `04_voice_metadata_and_tagging.md`'s unbuilt task D1 — character-level free-tag autocomplete — since the interaction shape is nearly identical), wired into the existing `VariantEditor` header as read/write chips — ships the taggable-variants feature without touching the stacked-card IA yet. Effort: **M**.

**Phase 2 — The structural rework:** DC-001 (master-detail split, revised shape per the Fable design review — see North Star below) + DC-003 (filter bar, semantics resolved per AR-10) + DC-005 (destructive-delete slip risk, resolved for free by the new selection model) + DC-012's frontend half (the default-variant star, spec below). Do NOT ship the new star before Phase 1a's write endpoint exists, and relabel the catalog card's existing "Set Default" button ("Set as App Default," per the owner decision below) in the same phase so two stars are never ambiguous on screen at once. Effort: **L**.

**Phase 3 — Cleanup fill-ins (ride along with Phase 1b/2, same files touched):** DC-008 (pill primitive token hygiene — do this **before** Phase 1b, since the new tag chips depend on this component per AR's ordering note), DC-006 (icon swap), DC-007 (engine badge consolidation), DC-009 (Add-variant button sizing), DC-011 (aria-expanded fix), DC-004 (reduced-motion guard — note the finding's code snippet has a citation error, see AR-7; the fix direction is still correct). Total effort: **S** combined.

**Phase 4 — Deferred:** DC-010 (bulk variant actions). File as a follow-up once Phase 2 ships and the list-rail exists to attach multi-select to.

### Open decisions — ALL RESOLVED (`04-decisions.md` §7)
Icon-prompt (DC-013) scope: Voice-Lab-only, spec amended. Interaction: icon-only button, hover-to-preview, click-to-copy — refined by the owner beyond either reviewer's original proposal.

## North Star — the information architecture (from the exemplar pass + Persona 44 + the Fable design review)

All five original reviewer lenses — Lanes D/E, the Apple HIG Purist persona, and the exemplar pass across Apple HIG / Material 3 / Linear's issue-list precedent — converged independently on a master-detail shape. A subsequent two-reviewer Fable design pass (`05-fable-design-review.md`) refined that shape further once the default-variant requirement (DC-012) was factored in, and the owner resolved the remaining disagreements (`04-decisions.md` §4-6).

### The move: master-detail split replaces the stacked column — with a count-based switcher shape

```
BEFORE (VariantsSection today)          AFTER (N ≤ ~4 — horizontal strip, primary case)
┌───────────────────────┐              ┌──────────────────────────────────────┐
│ [VariantEditor #1]    │              │ [Aria—calm ★][Aria—sad ☆][+ Add]     │  ← strip of tabs
│  play speed badge     │              ├──────────────────────────────────────┤
│  Script Rebuild       │              │   SELECTED VARIANT (one VariantEditor)│
│  Samples ▾ history…   │              │   play  speed  badge                  │
├───────────────────────┤              │   Samples ▾                           │
│ [VariantEditor #2]    │              │   [ performance: sad, slow  ✎ ]       │
│  …identical chrome…   │              │   ⋯ Rebuild/Script/history/adv        │
│ [VariantEditor #3…]   │              └──────────────────────────────────────┘
└───────────────────────┘

                                        AFTER (N > ~4 — vertical rail + filter, past the threshold)
                                       ┌──────────────┬─────────────────────┐
                                       │ FILTER BAR   │                     │
                                       │ perf▾        │   SELECTED VARIANT   │
                                       ├──────────────┤   (one VariantEditor)│
                                       │●Aria—calm  ★ │   play  speed  badge │
                                       │ Aria—sad   ☆ │   Samples ▾          │
                                       │ Aria—angry ☆ │   [ performance: sad, slow ✎ ]│
                                       │ Aria—fast  ☆ │   ⋯ Rebuild/Script/  │
                                       │ + Add variant│      history/adv ────┤
                                       └──────────────┴──────────────────────┘
```

**Layout shape is count-based, not two separate builds** (owner decision, `04-decisions.md` §5): the same underlying list/selection component renders as a horizontal strip of tabs (name + default-star + up to 2 tag chips each) when a character has ~4 or fewer variants — the common case per demo fixtures — and switches to the vertical rail + filter bar only past that count, where scanning/filtering actually earns its keep. This directly answers the owner's memory of the prior tab-based UI while keeping the filterable list available at real scale.

- **Switcher (strip or rail, same data):** one compact item per variant — name, engine·speed, performance-tag chips (read-only, via `VoicePillRow`), a leading play/pause for in-place audition, the **default-variant star** (see spec below), and the selection state (accent left-border/fill in rail mode, active-tab underline/fill in strip mode) as the only differentiating visual treatment beyond the star. Items are ≥44px touch target, keyboard-navigable via the same roving-tabindex pattern `VoiceDetailTabs.tsx` already implements — reused, not reinvented.
- **Filter bar (rail mode only, hidden in strip mode):** toggleable performance-tag filter chips narrowing the rail to matching variants — this is the actual "find the sad, slow one" feature the whole request is about.
- **Detail pane:** exactly one full `VariantEditor`, for the selected variant only. Tag chips here are editable via a new **`TagAutocompleteInput`** component (see "Tag input mechanism" below) rather than `SearchableSelect` (corrected — see note). Secondary chrome — Script, version history, Advanced Actions (Move/Delete), and Rebuild when not currently required — demotes into the pane's `ActionMenu` overflow; only Play, speed, and the tag chips stay always-visible, per the Apple HIG Purist's explicit "what to cut before adding anything" guidance.

### Default-variant star — spec (DC-012, resolved per `04-decisions.md` §4)

Trailing edge of each switcher item, after the tag chips. Outline `Star` glyph (`--text-muted`) at rest, **filled `--accent` blue** when this is the character's default variant — deliberately different from the catalog card's existing amber "app default" badge so the two concepts never share a color. ≥24px hit target regardless of the glyph's ~14px visible size; `aria-pressed` + `aria-label="Default variant for {character}"`. Single click sets it — no confirmation dialog, since the action is non-destructive, instantly reversible, and mutually exclusive by construction (setting one variant's star clears any other). Clicking the star must not also change which variant is selected (`stopPropagation`). Requires Phase 1a's new write endpoint to exist first; ship alongside the catalog card's relabeled "Set as App Default" button (`04-decisions.md` §6) so no ambiguous star exists on screen without a clear label distinguishing it.

### Tag input mechanism (corrected post-critique — `SearchableSelect` does not fit)

`SearchableSelect` (`frontend/src/components/forms/SearchableSelect.tsx`) is a **single-value** picker hardcoded for choosing one existing Speaker (its copy literally reads "Search speakers...", "Create New Speaker...") — it cannot be repurposed for a multi-value, user-extensible tag field. The correct precedent already exists in this codebase as two separate, smaller patterns that should be merged into one new component:

- **`TagsInput.tsx`** (`frontend/src/pages/Voices/components/metadata/`) — free-text input, commits a pill on Enter/comma, removable via an "×" or backspace-when-empty. No suggestions today.
- **`ManySelect.tsx`** (same directory) — fixed-vocabulary multi-select rendered as toggle chips, no free text.

**New component: `TagAutocompleteInput`** — `TagsInput`'s commit/pill/remove mechanics, plus a suggestions dropdown (styled like `ManySelect`'s chip row) that surfaces matching tone/pace values already used elsewhere in the library as the user types. Selecting a suggestion *or* typing something new and pressing Enter both call the same commit path — open-ended by default (satisfying the owner's confirmed preference for user-extensible tags), with autocomplete just making the common case fast and reducing near-duplicate tags ("sad" vs. "Sad"). Seed the suggestion list with a small starter vocabulary per field (tone: happy/sad/angry/calm/etc.; pace: slow/fast/measured) so it isn't a blank slate on day one.
- **Below ~640px viewport width:** the vertical rail (when in rail mode) collapses to the same horizontal strip used for low variant-count — one responsive behavior, not a separate fallback to build.

### Scale behavior (must hold at both ends)
- **N=1-4** (the common case per demo fixtures): horizontal strip, no filter bar — reads as a simple tab switcher, matching the owner's memory of the prior UI. No empty grid cells, no ceremony.
- **N=15:** vertical rail + filter bar; the rail scrolls independently while the detail pane stays fixed. The old flex column would have produced roughly 15 × ~450px ≈ 6,700px of near-identical scroll; the split keeps 15 as calm as 4.

### Why this and not the alternatives considered
- **A pure tab-strip switcher with no persistent list, at every N** was Lane D/E's initial candidate — solves the repetition problem but loses the always-visible, filterable, at-a-glance tag comparison the Casting Director's workflow needs once a character has many variants. The count-based switch (strip at low N, rail+filter past it) keeps both properties, each where it matters.
- **A card-grid gallery** (compact summary cards, click to expand) was considered — it risks visually echoing the catalog-level card grid one level too closely (an internal-consistency concern, not a strength) and doesn't support the filter-bar interaction as cleanly as a list does.
- **Bolting tag chips directly onto the current stacked cards** was the option the user's own message anticipated might be needed to change ("maybe there needs to be a different method") — every lens confirmed this instinct was correct and quantified why: it multiplies an already-linear repetition problem rather than fixing it.

### Open decisions — ALL RESOLVED
- **Tag vocabulary:** user-extensible via `TagAutocompleteInput`, not a closed enum (owner-confirmed).
- **Field name:** `performance_tags`, distinct from the character-level controlled `tone` (`04-decisions.md` §1).
- **Bundle export:** included by default with an all-vs-top-tags choice at export time (`04-decisions.md` §2).
- **Switcher layout shape:** count-based, strip below ~4 variants, rail+filter above (`04-decisions.md` §5).
- **Default-star color:** accent blue, distinct from the catalog card's amber (`04-decisions.md` §4).
- **Global "Set Default":** stays on the catalog card, relabeled "Set as App Default," bug fixed (`04-decisions.md` §6).
- **Icon-prompt (DC-013) scope + interaction:** Voice-Lab-only, icon-only button with hover-to-preview/click-to-copy (`04-decisions.md` §7).

## Suggested next steps

Run `/plan-architect` pointed at this improvement plan, `01-findings.md`, `03-adversarial-review.md`, `04-decisions.md`, and `05-fable-design-review.md` to produce a mapped, task-by-task implementation plan following the Phase 0 → 1a → 1b → 2 → 3 → 4 sequence. All open product/naming decisions are resolved — nothing should block starting the task decomposition. After implementation, re-run `/design-critique` on the same scope to confirm DC-001 through DC-014 actually close and no new violations were introduced by the rework.
