# Findings — Voices Page Variant UI

## DC-001: Stacked full-height variant cards have no differentiator and cannot scale

| Field | Value |
|-------|-------|
| **Severity** | P1 — Blocker *(cross-promoted from P2 — independently raised by 4+ lenses: B, C, D, E, and personas 44/06/41; see rule below)* |
| **Lanes / Framework** | B (Nielsen H8), C (Hick's Law, Miller's Law), D (Norman D1 — missing signifier), E (Gestalt E6 Similarity, E9 Common Region, Prägnanz), Persona 44 Apple HIG Purist (Clarity, Deference), Persona 06 Casting Director, Persona 41 Large Catalog Curator |
| **Location** | `frontend/src/pages/VoiceLab/components/VariantsSection.tsx:62-93` (flat vertical flex, maps every profile to a full editor); `frontend/src/pages/Voices/components/VariantEditor.tsx:136-347` (each variant's full chrome) |
| **Effort** | L |
| **Theme impact** | None |

**Issue:** A "variant" is one `SpeakerProfile`. Today, N variants of one character render as N full-height, structurally identical cards stacked in a plain flex column — each repeating a name row (play, speed pill, engine badge, Script button, Rebuild button), a rebuild-status banner, a Samples accordion, a version-history panel, and an "Advanced Actions" footer (Move/Delete). A live screenshot of a real voice with just 2 variants ("Default", "Light Narrator") already spans 2+ screens of near-duplicate chrome, and the code's own inline comment admits "rows are otherwise indistinguishable" beyond the text label.

Every independent reviewer lens converged on the same diagnosis without prompting: Nielsen H8 (aesthetic/minimalist design) is violated before any tags are even added — every variant re-presents ~9 controls at full weight with no hierarchy. Hick's Law and Miller's Law predict this gets *worse*, not neutral, once per-variant tags are added: N variants × (9 chrome elements + M tags) scales linearly into an undifferentiated wall (at 5 variants × 3 tags, roughly 60 elements in one flat column). Norman's signifier analysis finds nothing in the current layout that signals "these are alternate performances of the same character, pick one" — it reads as a list of unrelated settings panels. Gestalt similarity/common-region analysis agrees: identical panels read as duplicates, not alternates-to-compare, and comparing two variants' attributes requires scrolling past a full screen rather than glancing side-by-side.

The Apple HIG Purist persona (weighted heavily per the review brief) rendered an explicit verdict: **"Would not ship — and no, you cannot bolt tag chips onto this. The IA is the bug."** It cited the mismatch with how Apple's own apps handle "N variants of one thing" (Xcode's scheme picker, Photos' duplicate/variant strip, Messages' Memoji picker) — in every case, a compact browse/pick surface feeds one summoned editor; never N editors competing at once.

The Casting Director persona confirmed the practical cost: comparing "Aria — Happy/Fast" against "Aria — Sad/Slow" today means scrolling past full cards rather than a side-by-side glance, defeating the audition workflow this whole feature exists to serve. The Large Catalog Curator persona confirmed this breaks well before its own stated tolerance for list-style workflows — at 10 variants, 10 separate `VersionHistoryPanel` and `SampleManager` instances mount simultaneously with no virtualization or collapse.

**Cross-promotion note:** per the design-critique skill's Step 4 rule ("a finding independently raised by 2+ lanes is promoted one severity level"), this root finding was raised by Lanes B, C, D, and E plus three personas — six independent reviewer lenses converging on the same defect. Its base severity (P2, since the individual citations are [GUIDELINE]/[PRECEDENT]-tier — HIG, Norman, Gestalt, Hick's/Miller's Law, none a numeric WCAG threshold) is promoted to **P1** on the strength of that convergence, per the skill's explicit escalation rule, not by inventing a verified-tier basis that doesn't exist. It remains, honestly, evidence-graded at [GUIDELINE]/[PRECEDENT] underneath the promotion — flagged here for transparency.

**Current state (schematic):**
```
VariantsSection
├── VariantEditor #1 (Default)     ← full chrome: play/speed/badge/Script/Rebuild,
│                                     rebuild banner, Samples accordion,
│                                     VersionHistoryPanel, Advanced Actions
├── VariantEditor #2 (Light Narrator)  ← identical chrome, repeated
└── + Add variant
```

**Proposed fix — master-detail split** (full detail in `02-improvement-plan.md`'s North Star section; this is the single structural move every lens converged on independently):
```
┌──────────────────┬─────────────────────────┐
│ FILTER: tone▾ pace▾                        │
├──────────────────┤   SELECTED VARIANT       │
│ ● Aria — sad,slow│   (one full VariantEditor)│
│   Aria — calm    │   play  speed  badge      │
│   Aria — fast    │   Samples ▾               │
│ + Add variant    │   [tone: sad ✎][pace:slow✎]│
│                  │   ⋯ Script/Rebuild/history/│
│                  │      Advanced (overflow)   │
└──────────────────┴─────────────────────────┘
```
A compact, tag-forward list rail (reusing `VoicePillRow` for tag chips and the `VoiceDetailTabs` roving-tabindex pattern for keyboard nav) replaces the stacked column; only the **selected** variant's full editor renders. Secondary chrome (Script, version history, Advanced Actions, Rebuild-when-not-required) demotes into the detail pane's `ActionMenu` overflow. This resolves DC-001, DC-005, and is the required host for DC-002/DC-003.

---

## DC-002: No per-variant performance-tag data model or rendering

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Lanes / Framework** | Codebase survey (data-model gap), Persona 06 Casting Director (CD-1), exemplar pass (Move 2) |
| **Location** | `frontend/src/types/index.ts:256-279` (`SpeakerProfile` — no tone/pace/tag field); `frontend/src/types/index.ts:290-328` (`VoiceAttributes`/`VoiceMetadata` — tone/pace/tags exist, but only at the character level); `VariantEditor.tsx` renders no `VoicePillRow` anywhere in its tree |
| **Effort** | M |
| **Theme impact** | None |

**Issue:** Tone, pace, and free-tag fields already exist in this codebase's type system and backend (`app/domain/voices/metadata.py`, `taxonomy.py`) — but only as attributes of the parent voice/character, not the `SpeakerProfile` (variant). There is no backing field for "this specific variant is Happy/Fast" today, and `VariantEditor.tsx` never renders a `VoicePillRow` (contrast `VoiceCatalogCard.tsx:250-258`, which does, at the character level). This is a straightforward, well-precedented data-model extension, not a novel design — the existing `voicePillsFromMetadata` walker already emits one pill per array-attribute item; it simply needs a per-variant array to walk.

**Fix:** Add a per-variant performance-tags field to the backend model and frontend type, surfaced via `VoicePillRow` in both the new list-rail row (compact, read-only) and the detail pane (editable via the new `TagAutocompleteInput` component, not `SearchableSelect` — corrected, see `03-adversarial-review.md` AR-3). Reuse `--pill-extended-*`/`--pill-tag-*` for chip styling, matching `design-system.md` §5's existing taxonomy. **Do not name this field bare `tone`/`pace`** — the character-level `VoiceAttributes.tone` is a strictly-validated, closed 28-value enum with the opposite semantics; reusing the name invites real confusion between "this character is generally somber" and "this specific take is angry." See AR-9 for the naming decision this needs before implementation. Also see AR-2 for why the backend change is a multi-touchpoint write-path change (read surfacing in two places, a currently-blocking write-endpoint allowlist, and a binding-spec update), not a one-line schema add.

---

## DC-003: No filter/facet to browse a character's variants by performance tag

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Lanes / Framework** | Persona 06 Casting Director (CD-2), Persona 41 Large Catalog Curator (LCC-3), exemplar pass (Move 3) |
| **Location** | `VariantsSection.tsx` (no filter control exists); contrast `VoicesPage.tsx`'s character-level class/gender/age facet filtering, which has no variant-level equivalent |
| **Effort** | M |
| **Theme impact** | None |

**Issue:** `VoicesPage.tsx` already has facet filtering across characters (class/gender/age), but nothing filters *within* one character's variant set by tone/pace — exactly the browsing task the user described ("do you have a different variant for tone... sad and happy... slow or fast"). At even a handful of variants, finding "the sad, slow one" is a manual serial scan.

**Fix:** A small filter-chip bar above the new list rail (toggleable tone/pace chips, `--pill-*` for the active-filter chip styling), narrowing the rail to matching variants. This is additive to DC-001's list-rail structure, not a separate component. **Filter semantics (AND/OR, zero-tag handling, filter-hides-selected-variant behavior, and tag-value normalization) are unspecified here — see `03-adversarial-review.md` AR-10 for the decision this needs before implementation**, including the existing OR-within/AND-across convention this codebase already uses at the character-level filter that should be adopted by name.

---

## DC-004: Play-pulse animation has no `prefers-reduced-motion` guard

| Field | Value |
|-------|-------|
| **Severity** | P3 |
| **Lanes / Framework** | A (motion best-practice, [VERIFIED] pattern — no `prefers-reduced-motion` handling for a looping animation) |
| **Location** | `frontend/src/pages/Voices/components/VariantEditor.tsx:171-178` |
| **Effort** | XS |
| **Theme impact** | None |

**Issue:** The playing-state pulse uses `animate={{scale, opacity}}` with `transition={{repeat: Infinity}}` and no reduced-motion gate. One instance renders per currently-playing variant; under the proposed list-rail IA this could still apply to a played row, so the fix should land regardless of which IA option ships.

**Current:**
```tsx
<motion.div animate={{ scale: [1, 1.15, 1], opacity: [1, 0.6, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }} />
```

**Fix:**
```tsx
const prefersReducedMotion = useReducedMotion(); // framer-motion hook
<motion.div animate={prefersReducedMotion ? {} : { scale: [1, 1.15, 1], opacity: [1, 0.6, 1] }}
            transition={prefersReducedMotion ? { duration: 0 } : { repeat: Infinity, duration: 1.2 }} />
```

---

## DC-005: Repeated destructive Delete across indistinguishable panels (slip risk)

| Field | Value |
|-------|-------|
| **Severity** | P3 *(caps here — [GUIDELINE] Norman D3 slip risk, no verified mis-tap incident on record)* |
| **Lanes / Framework** | D (Norman D3 — slips, HIG destructive-action separation) |
| **Location** | `VariantEditor.tsx:331-344` |
| **Effort** | Folds into DC-001's fix |
| **Theme impact** | None |

**Issue:** A destructive "Delete Variant" lives inside every stacked panel's footer. Because the panels are visually indistinguishable (DC-001), a user scrolling a wall of near-duplicates is more likely to act on the wrong variant's Delete than they would be with a single, unambiguous "currently selected" target. The action does correctly confirm via `requestConfirm`/`isDestructive` styling, which is why this caps at P3 rather than higher — the safety net exists, but the setup for the slip does not need to.

**Fix:** In the master-detail IA, exactly one Delete acts on the currently-selected variant, and the list-rail's selection state (accent border/fill) removes the ambiguity that creates the slip surface. No independent fix needed beyond DC-001.

---

## DC-006: "Move Variant" reuses the Rebuild icon

| Field | Value |
|-------|-------|
| **Severity** | P3 |
| **Lanes / Framework** | D (Jakob's Law — icon meaning must stay consistent within the app) |
| **Location** | `VariantEditor.tsx:328` (Move Variant, `<RefreshCw>`) vs. `VariantEditor.tsx:252` (Rebuild, also `<RefreshCw>`) |
| **Effort** | S |
| **Theme impact** | None |

**Issue:** `RefreshCw` universally reads as reload/rebuild in this app (it's literally the Rebuild button's icon two lines away). Reusing it for "move this variant to another voice" creates a false affordance.

**Fix:** Swap to `ArrowRightLeft` or `FolderInput` (both already available via `lucide-react`, already a dependency).

---

## DC-007: Three different engine-badge treatments

| Field | Value |
|-------|-------|
| **Severity** | P3 |
| **Lanes / Framework** | B (H4 consistency), Persona 45 Design-Systems Consistency Reviewer (DSC-2) |
| **Location** | `VariantEditor.tsx:210-215` (inline `${engineBadge.color}33` hex-alpha suffix); `VoiceCatalogCard.tsx:234-246` (separate hand-rolled badge, `fontSize: '0.6rem'`, `padding: '1px 6px'`); a third treatment implied by the catalog-grid's own engine label |
| **Effort** | S |
| **Theme impact** | None |

**Issue:** Three visually-similar-but-code-distinct engine-badge implementations exist across these two files, none sharing a canonical component, one appending a raw hex-alpha suffix in JS rather than using a `--pill-*`/token-based border color. Per `design-system.md` §2.2's binding tokens-only rule, this is drift that will only compound as more badge call sites appear.

**Fix:** Extract one `EngineBadge` component (or a shared style hook) consuming `--pill-*`/`--cloud-tint-*` tokens exclusively; replace all three call sites.

---

## DC-008: Canonical pill primitive hardcodes spacing/type instead of tokens

| Field | Value |
|-------|-------|
| **Severity** | P3 |
| **Lanes / Framework** | Persona 45 Design-Systems Consistency Reviewer (DSC-1) |
| **Location** | `frontend/src/pages/Voices/components/VoicePills.tsx:126-137, 168-198` |
| **Effort** | S |
| **Theme impact** | None |

**Issue:** `VoicePills.tsx` — the component every per-variant tag chip in this plan's fix will reuse — inlines `padding: '2px 8px'`, `fontSize: '0.6875rem'`, `gap: '4px'` rather than the `--space-*`/`--type-*` token families, even though its colors correctly use `--pill-*`. Since this is about to become load-bearing for the variant redesign, the drift should be fixed before it propagates further.

**Fix:** Replace hardcoded px/rem values with the nearest `--space-*`/`--type-*` tokens; verify no visual regression against the existing character-level pill row.

---

## DC-009: "Add variant" button hardcodes off-scale sizing

| Field | Value |
|-------|-------|
| **Severity** | P3 |
| **Lanes / Framework** | Persona 45 Design-Systems Consistency Reviewer (DSC-3) |
| **Location** | `frontend/src/pages/VoiceLab/components/VariantsSection.tsx:44-60` |
| **Effort** | XS |
| **Theme impact** | None |

**Issue:** `height: '26px'`, `fontSize: '0.72rem'`, `padding: '0 10px'` inlined on a `btn-ghost` — one-off sizing that doesn't match any `--space-*`/`--type-*` token, existing only "for this screen."

**Fix:** Route through the standard `btn-ghost` sizing scale already used elsewhere.

---

## DC-010: No bulk action or scope preview across a character's variants

| Field | Value |
|-------|-------|
| **Severity** | P3 *(INFERRED persona badge, capped)* |
| **Lanes / Framework** | Persona 41 Large Catalog Curator (LCC-2) |
| **Location** | `VariantEditor.tsx:331-344` (one-at-a-time Delete Variant, no multi-select) |
| **Effort** | M |
| **Theme impact** | None |

**Issue:** The catalog level already has multi-select bulk delete/export (`VoiceCatalogCard.tsx:173-185`), but pruning multiple variants of one character requires N separate confirm round-trips. Lower priority than DC-001-003 — worth a follow-up task, not blocking the initial IA rework.

**Fix:** Once the list-rail IA lands (DC-001), add a lightweight multi-select mode to the rail mirroring the catalog's existing pattern.

---

## DC-011: Overflow-chip `aria-expanded` hardcoded/missing

| Field | Value |
|-------|-------|
| **Severity** | P3 |
| **Lanes / Framework** | A (ARIA correctness, [GUIDELINE] — not a numeric WCAG failure) |
| **Location** | `frontend/src/pages/Voices/components/VoicePills.tsx:181-182` |
| **Effort** | XS |
| **Theme impact** | None |

**Issue:** The `+N` overflow button hardcodes `aria-expanded={false}` always, and the paired collapse (`−`) button omits `aria-expanded` entirely. Low real-world impact since the collapse button's `aria-label` carries meaning, but worth fixing alongside DC-008 since it's the same file.

**Fix:** Reflect actual expand/collapse state on both buttons, or drop the attribute if it can't be kept accurate.

---

## DC-012: No UI (and no backend write path) exists to set a character's default variant — confused with an unrelated global default

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Lanes / Framework** | Owner-reported live-usage confusion; verified against real code, not a lane citation |
| **Location** | `app/api/routers/voices_management.py:225-235,295` (`is_default` — a single, GLOBAL `default_speaker_profile` across the whole catalog, not per-character); `app/domain/voices/migration.py:142-172,251-285` and `app/api/routers/voices_huggingface.py:306-324` (`default_variant` — a genuine per-character concept, but write-once during migration, read-only afterward, no API endpoint ever sets it); `VariantEditor.tsx`/`VariantsSection.tsx` (the word "Default" shown in the variant list is just that variant's literal name string, not a functional indicator of anything) |
| **Effort** | M |
| **Theme impact** | None |

**Issue:** Two unrelated "default" concepts exist in the backend, and the UI conflates them in a way that actively misleads:

1. **`is_default`** (surfaced as the "★ default" badge and "Set Default" button on the catalog card) is computed against `default_speaker_profile` — a **single global setting across the entire catalog** (one specific voice+variant, used app-wide when nothing else is specified), not anything scoped to the character being viewed. The button is also functionally near-useless: it computes its target from whichever profile is already default, so once any profile is marked default, the button permanently disables itself — there is no way to change the global default to a *different* voice from this control at all.
2. **`default_variant`** (stored per-character in `state.json`) is the actual concept the owner wants exposed — "which variant represents this character by default" — but it is **write-once during a migration step and read-only forever after** (only consumed by the Hugging Face export path to pick which variant folder becomes the bundle root). No API endpoint exists to change it.
3. The literal word **"Default"** visible in today's variant list is neither of the above — it's simply that variant's name string (the base/first variant of any character is conventionally named "Default" as a matter of naming convention), carrying no functional meaning at all.

The owner's stated intent is explicit: all variants of a character are equivalent and interchangeable, and picking which one is "the" default for that character should be a lightweight, symmetric, always-changeable toggle — not a specially-elevated, one-way, hard-to-reach setting. This matches a prior version of this UI the owner recalls, where each variant appeared as its own tab with a star toggle.

**Fix:** Add a real write path — `POST /api/speaker-profiles/{name}/variants/{variant_name}/set-default` (or similar), updating `state.json`'s `default_variant` for that character — and expose it in the new variant list-rail (DC-001) as a small, equal-weight star toggle per row, not a differently-styled or elevated treatment. The global `default_speaker_profile`/"Set Default" catalog-card mechanism is a separate, pre-existing concept out of this plan's scope, but its own broken always-disabled-after-first-use behavior is worth flagging to the owner as a separate, unrelated bug.

---

## DC-013: Restore C6 (copyable icon image-generation prompt) — built, then silently orphaned

| Field | Value |
|-------|-------|
| **Severity** | P2 *(revised up from P3 after two independent Fable design reviewers verified this is a shipped-then-lost regression, not new scope — the project's own established "redesign lost functionality" failure class)* |
| **Lanes / Framework** | Owner-directed feature (task "C6"), re-verified against real code by two independent Fable reviewers — not a lane finding |
| **Location** | `frontend/src/pages/VoiceLab/iconPrompt.ts` (`buildIconPrompt()` — fully implemented, spec-cited "R5-T7"); `frontend/src/pages/VoiceLab/components/VoiceIconControls.tsx` (fully implemented UI: upload + "Copy icon prompt" button + clipboard + "Copied!" state); `frontend/src/pages/VoiceLab/VoiceLabPage.tsx:33-39` (a code comment admits `VoiceIconControls` "is not rendered in this task" after a later tab-consolidation rework); `frontend/src/pages/Voices/components/metadata/IconUpload.tsx`, mounted in `OverviewTab.tsx:103-108`, is the upload-only replacement that has zero prompt affordance. `design-docs/specs/voice-bundles.md` §11.1-11.2 (binding acceptance criteria) |
| **Effort** | **XS** *(revised down from S — this is a re-wire of existing, tested code, not new construction)* |
| **Theme impact** | None |

**Issue — corrected finding:** the original framing of this as "owner-directed, never built" was wrong. `buildIconPrompt()` and its full UI (`VoiceIconControls.tsx`) were built and shipped, then silently dropped when a later tab-consolidation task replaced them with an upload-only `IconUpload` component and never re-wired the prompt affordance back in — the orphaning is documented in `VoiceLabPage.tsx`'s own code comment. This is the exact "redesign lost functionality" pattern this project has already been burned by once before (per repo memory).

**Open spec discrepancy, needs an owner call:** `voice-bundles.md` §11.1 states the prompt should appear **beside the icon on the voice catalog card**, in addition to the Voice Lab header (§11.2) — but the shipped implementation only ever lived in the Voice Lab. Two options: (a) also add a copy-prompt affordance to `VoiceCatalogCard.tsx`, or (b) amend the spec (bump `spec_version` + changelog row, same commit, per this repo's binding-spec rule) to Voice-Lab-only. Both design reviewers recommended (b) — a copy-prompt button on every catalog card is chrome the card doesn't need, and the Lab is where icon work actually happens — but this is the owner's call, not something this critique should silently decide.

**Fix — owner-refined interaction (`04-decisions.md` §7):** re-mount `buildIconPrompt()` (already taxonomy-agnostic and spec-correct — do not rebuild it) behind a new, simpler UI than the original `VoiceIconControls` button: a single **icon-only button, no visible label** — hover reveals the generated prompt text as a tooltip/preview, click copies it to the clipboard. This replaces the original "Copy icon prompt" text button + separate "Copied!" state with something more minimal, per the owner's explicit preference. Voice-Lab-only scope (the spec's catalog-card mention is being dropped, see `04-decisions.md` §7 — amend `voice-bundles.md` §11.1 accordingly in the same change). While building this, fix the pre-existing silently-swallowed clipboard-write failure (`VoiceIconControls.tsx:58-60`'s empty `catch {}`) with a visible error state (Nielsen H1, visibility of system status), and drop the redundant `📋` emoji if any of the original component's markup is reused. Add a render test asserting the icon-prompt affordance is actually mounted somewhere in the Overview tab, so a future rework can't orphan it silently a second time. Ensure the hover tooltip is also keyboard/focus-reachable (not hover-only), so the feature isn't accessible exclusively via mouse.

---

## DC-014: Preserve the dynamic recording-guide reachability when Script moves into the new IA

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Lanes / Framework** | Cross-check against already-shipped functionality, re-verified against real code by two independent Fable reviewers — not a lane finding |
| **Location** | `frontend/src/pages/Voices/components/VariantEditor.tsx:218` (Script button calls `onEditTestText(profile)`); `frontend/src/pages/VoiceLab/components/VariantsTab.tsx:24-27` (its own code comment: Script "now switches `VoiceLabPage` to the Test tab... instead of opening the retired `ScriptEditor` drawer"); `frontend/src/pages/VoiceLab/components/TestTab.tsx:156` (`ScriptEditor` mounts inline here) |
| **Effort** | XS — verification, and one small, natural improvement |
| **Theme impact** | None |

**Issue — corrected finding:** the original premise (Script opens `ScriptEditor` as a modal/drawer, which this plan's `ActionMenu`-overflow demotion might destabilize) is stale. Two independent Fable reviewers verified the actual current behavior: `ScriptEditor` was already relocated in an earlier task — Script no longer opens a drawer at all, it simply switches to the Test tab, where `ScriptEditor` (including the "Suggest from voice qualities" recording-guide flow) mounts inline. Since `ActionMenu` items just fire an `onClick` after closing the menu (no portal/z-index/stacking concern), relocating the Script action into the new detail pane's overflow menu is exactly as safe as a tab-switch action can be — there is no modal-inside-dropdown risk to guard against.

**Also noted:** the `profile` argument `onEditTestText` receives is already discarded by the current wiring (`onEditTestText={() => setActiveTabId('test')}`) — no per-variant context reaches the Test tab today. Since this plan's new master-detail rework introduces a real "currently selected variant" concept for the first time, there's a natural, cheap improvement available: pass the selected variant through so the Test tab preselects it, rather than leaving this as a known gap.

**Fix:** No preservation risk to design around — just carry the existing `onEditTestText` wiring into the new `ActionMenu` overflow item as-is. Acceptance criteria for `plan-architect` to verify (not "still works," which isn't independently checkable):
1. Activating the overflow's Script action navigates to the Test tab, and `ScriptEditor`'s "Suggest from voice qualities" button is reachable and functional there.
2. **INV-4 preserved**: for an untagged voice, "Suggest from voice qualities" renders disabled with its documented explanatory reason (`ScriptEditor.tsx:23`) — no generic fallback suggestion.
3. With ≥2 variants, selecting variant B in the new rail/strip then opening Script operates on variant B's test text specifically (not variant A's) — this doubles as coverage for the AR-12 variant-name-resolution write hazard.
4. (Improvement, not a regression check) The Test tab preselects whichever variant was selected in the rail/strip when Script was activated, closing the gap noted above.
