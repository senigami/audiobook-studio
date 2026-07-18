# Design System

```
spec_version: 1.17.0
status: active
created: 2026-06-13
updated: 2026-07-16
sources:
  - frontend/src/theme/tokens.css
  - frontend/src/demo/stages/siteMockup/
  - frontend/src/theme/base.css
  - frontend/src/theme/components/
  - frontend/src/theme/utilities.css
  - frontend/src/utils/theme.ts
  - frontend/src/main.tsx
  - frontend/src/hooks/useFocusTrap.ts
  - frontend/src/components/ui/ActionMenu.tsx
  - frontend/src/components/ui/Switch.tsx
  - frontend/src/components/ui/StatusOrb.tsx
  - frontend/src/components/ui/GhostButton.tsx
  - frontend/src/components/forms/InlineEdit.tsx
  - frontend/src/components/forms/GlassInput.tsx
  - frontend/src/components/forms/SearchableSelect.tsx
  - frontend/src/components/forms/ColorSwatchPicker.tsx
  - frontend/src/components/forms/VoiceDropzone.tsx
  - frontend/src/components/layout/BrandLogo.tsx
  - frontend/src/components/overlays/ConfirmModal.tsx
  - frontend/src/components/overlays/PluginTrustModal.tsx
  - frontend/src/app/layout/PlayerBar.tsx
  - frontend/src/app/layout/NavRail.tsx
  - frontend/src/pages/Settings/components/GeneralSettingsPanel.tsx
  - .agent/rules/frontend-interactions.md
  - .agent/rules/frontend-ux.md
  - design-docs/specs/voice-tone.md
  - design-docs/plans/reference/site_experience_north_star.md
  - design-docs/plans/reference/site_redesign_rollout/
```

> **TL;DR:** Every surface is themed through CSS variables in `tokens.css`, works in both light and dark, and is built from a small set of canonical shared primitives. Components consume tokens, never hardcoded colors; theming is `system | light | dark` driven by a `data-theme` attribute with a no-flash bootstrap; and chapter status is always rendered with `StatusOrb`, never a plain dot.

## Changelog

| Version | Date       | Change |
|---------|------------|--------|
| 1.17.0 | 2026-07-16 | **P5 Sub-task B: `--accent` → `--action-primary` rename (mechanical, behavior-preserving).** All 127 frontend `var(--accent)` consumer sites (CSS + TS/TSX, including `demo/` — the demo renders identically to the live app so it was in scope, not exempted) renamed to `var(--action-primary)`; the `--accent`/`--accent-hover`/`--accent-active` alias definitions in `tokens.css` are **retained permanently** as documented compatibility pointers (§2.1) — no value changed, verified byte-identical via computed-style equality in both themes (`--accent` === `--action-primary` in light `#1e4fd8` and dark `#6b9fff`). Sibling token families (`--accent-tint`, `--accent-glow`, `--accent-rgb`, `--accent-gradient`, `--accent-secondary`, `--accent-focus-ring`, etc.) were left untouched — out of scope for this rename. Test assertions in `frontend/tests/` that selected on the literal string `var(--accent)` were updated in lockstep (5 files) since they assert real rendered output, not a fabricated string. |
| 1.16.0 | 2026-07-15 | **Plan-coverage follow-up fixes (F3.1/F3.2/F5.7, `design-docs/design-critique/voices-variants-round2/01-findings.md`).** §5 Gestalt-match: `OneSelect`/`ManySelect`/`OverviewTab`'s CLASS/GENDER/AGE/ACCENT/PACE/etc. section headers now tint to the same `--pill-{category}-text` hue their values render as pills under (`categoryForAttributeKey()`, new export on `VoicePills.tsx`), instead of uniform muted-grey — computed contrast holds well above AA on `--surface`/`--surface-alt` in both themes (see §2.4 pairs; the header sits on the page surface, not the pill's own tinted background, so it was re-verified against that surface rather than reusing the pill-on-pill-bg numbers already in §2.4). The metadata editor's active chip (`chip.tsx`) now takes an optional facet `category` and paints its active state with that facet's `--pill-*` tokens instead of a single generic `--accent` for every field, matching `VoicePill`'s own rendering. §8.4: the "44px hit-area for compact icon buttons is a tracked follow-up" note is resolved for the voice-catalog-card play overlay — see below. |
| 1.15.0 | 2026-07-15 | **Spec sync for voices-variants-round2 (tasks 001–009).** §6 registers the new `MultiSelect` primitive (`components/forms/MultiSelect.tsx` — compact multi-value combobox, chip trigger + checkbox-style panel; MUST be used for new multi-value filter/selects rather than a bespoke chip-toggle row). §5's pill-taxonomy adoption status corrected from **target** to **current**: `--pill-*` tokens are confirmed live on the real Voices page via `VoicePillRow`/`voicePillsFromMetadata` (`VoicePills.tsx`), consumed by `VoiceCatalogCard` and the Voice Lab header — the "not yet wired into the real Voices page" line was stale (the site-mockup demo stage remains the origin of the pattern, but real-page adoption has since shipped). Noted the Voice Lab page's IA changed from a 4-tab shell (Overview/Samples/Variants/Test) to a `<details>` disclosure panel (voice-level metadata) above a single variant switcher + `VariantEditor` (which now also owns per-variant engine-config, test-text, and Record-mode sample capture) — the old tab shell and its `TestTab`/`SamplesTab` are deleted; no other section of this doc referenced the retired tabs by name. |
| 1.14.0 | 2026-07-10 | **Styling-separation plan complete (ST-1–ST-4) — `components.css` domain split + shared classes + CI guard.** `theme/components.css` (4,440-line monolith) split into 11 domain-scoped files under `theme/components/` (`core.css`, `nav.css`, `book.css`, `book-tabs.css`, `publish.css`, `activity.css`, `shared.css`, `player.css`, `voice-lab.css`, `review-tools.css`, `misc.css`), assembled via `@import` in `theme/index.css` in the exact original cascade order (pure move; cascade is load-bearing, non-contiguous `shared.css`/`misc.css` kept separate for that reason). Added 6 shared label classes to `core.css` (`.label-micro-muted`, `.label-micro-muted-strong`, `.label-caption-strong`, `.label-micro-muted-italic`, `.label-uppercase-sm`, `.label-uppercase-md`) replacing ~100 repeated inline `style={{...}}` patterns. Converted ~470 `style={{...}}` occurrences to classes across 20 hotspot files (`CastPalette`, `ProjectLibraryPage`, `VoiceModals`, `GlobalQueue`, `ResyncPreviewModal`, `OfficialRegistryPanel`, `VariantEditor`, `WelcomePage`, `ScriptEditor`, `LiveOutputPage`, `MetadataEditorModal` + 5 metadata subcomponents, `EngineCard` + 3 Engines subcomponents, `VoicesTabHeader`, `SampleManager`); bare literals with an exact `tokens.css` match were substituted for the token as part of each move (no rule/DOM/behavior changes). Added a CI regression guard (`scripts/check_hardcoded_styles.py`, wired into `.github/workflows/ci.yml`) that fails on new hardcoded hex/rgb color literals in `style={{}}` blocks across `frontend/src` (excluding `demo/` and `tokens.css`), in `theme/components/*.css`, and in 5 named co-located stylesheets this plan added — a named-file scope, not a repo-wide CSS scan (other pre-existing stylesheets may have violations this guard doesn't police) — and on raw px spacing values that exactly match a `--space-*` token in the 20 converted files (the equivalent `rem` form is a known, documented gap, not covered). §7 Responsive and the sources list updated to reference `theme/components/` (directory) instead of the retired `theme/components.css` file. Corrected 2026-07-10 (adversarial review) from an earlier overstated "anywhere in frontend/src" / "repo-wide" claim. |
| 1.0.0   | 2026-06-13 | Initial canonical spec for the frontend design system |
| 1.1.0   | 2026-06-16 | Added §9 Iconography (binding): `lucide-react` is the single icon system; canonical control→icon mapping; deliberate non-icon exceptions (status dots, raster artwork, "from→to" notation). North-Star mock standardized off Unicode glyphs onto lucide. Cross-References renumbered to §10. |
| 1.2.0   | 2026-06-16 | Reconciled §2/§4/§5 to the current `tokens.css` (some drift predated this session). Radius bumped (`--radius-card` 14px, `--radius-panel` 18px); registry now documents the present Material (`--blur-glass*`, `--hairline`), Motion (`--ease-*`/`--dur-*`), `--focus-ring`, accent gradient/glow, and 8pt `--space-*` families. §4 type scale corrected to **tokenized (current)** and extended with `--type-display/large-title/reading` + `--leading-*`/`--tracking-*`. §5 voice-pill tints corrected to **current** (`--pill-*` exist in `tokens.css`); real-Voices-page adoption remains target. |
| 1.3.0   | 2026-06-19 | **Style-guide completion pass.** Added **§2.4 Color & contrast** (computed WCAG AA ratios for the key pairs in both themes, with composited-color math for `rgba` tints) and **§10 Brand identity** (Cross-References renumbered §10→§11). §2.1 registered the previously-undocumented **Cloud-engine** and **Waveform-strip** token families + the **progress barber-pole stripe** tokens, completed missing State/Surface/Brand rows, and flagged `--focus-ring` as *defined-but-unused*. §4: typeface decision recorded — **Inter (+ Space Grotesk wordmark) is now self-hosted** (was declared-but-never-loaded → system-ui fallback); type-token adoption status corrected (one real-app file, not a migration-in-progress). §6: added 6 shipped-but-undocumented primitives (`GlassInput`, `SearchableSelect`, `ColorSwatchPicker`, `VoiceDropzone`, `BrandLogo`, `PluginTrustModal`) + the `PlayerBar` transport. §7: added the 1250px breakpoint. §8: recorded the reduced-motion coverage gap. §9: recorded known real-app glyph violations as tracked deviations. UI copy/voice & tone split out to the new [voice-tone.md](voice-tone.md). Same change set fixed the duplicate `--success-text` token and tokenized the progress-bar `rgba` literals. |
| 1.4.0   | 2026-06-19 | Completed the §9 glyph→lucide migration. The 8 real-app glyph-as-icon usages (a `▶` play label, `›` breadcrumb separators ×3, `▲`/`▼` disclosure carets ×2, an `Export ▾` caret, and `✓` markers ×3) now render the mapped lucide components; the redundant `⚠` decorations on `EditTab`/`AnalysisStrip` were dropped in favor of the existing `AlertTriangle`. §9.1 updated; §9.5 changed from a deviations table to **resolved**. Rendering-only change — no behavior change. |
| 1.5.0   | 2026-06-20 | **P0 fonts.** Self-host Geist Variable + Geist Mono + Source Serif 4 via @fontsource; add `--font-ui`/`--font-display`/`--font-reading`/`--font-mono` tokens; repoint `base.css` stacks; Inter remains as fallback in `--font-ui` stack. Resolves R1. |
| 1.6.0 | 2026-06-20 | **P1 token re-skin.** Alias --accent to #1e4fd8 (light)/#6b9fff (dark); add role-named --action-primary/-hover/-active, --on-action, --primary-border-inset, --live-indicator; studio-dark --bg #0d0f14; 3-stop dark text ladder (--text-secondary #a8b2c4, --text-muted #8b95a8, NEW --text-subtle #6b7a92); light --text-primary #1c2b4a, --text-muted #5c6a80, --text-subtle #64748b; NEW --surface-reading; --on-success, --status-cached-text/-ring; tightened radii (card 10, button 8, NEW compact 6); --pulse-duration; double-ring :focus-visible; solid --progress-preparing-fill; calm-pulse keyframe; flat buttons (.btn-primary/-success/-home — no gradient/glow/translateY lift). §2.4 recomputed against new --bg. Review fixes: made `--text-on-accent` dark-aware (#0d0f14 — the lightened dark accent needs dark on-accent text, 7.33:1) and wired the `.is-running` reduced-motion exemption so the calm-pulse genuinely survives the guard. |
| 1.6.1 | 2026-06-20 | **P1 audit fixes.** Synced accent-derived rgba tokens (--accent-rgb/-glow/-tint-bg/-tint-border/-focus-ring) to the new #1e4fd8/#6b9fff channels (were stale #2b6eff); wired success fills (.btn-success, .studio-header-actions__commit) to --on-success and three hardcoded white-on-accent consumers to --on-action (dark-mode AA); removed the blanket button min-height that deformed compact buttons (kept on form controls); corrected §2.4 --success bg values (#10b981, not #16a34a/#22c55e), the §10 --as-blue/--accent equality, and the --pulse-duration mechanism wording. |
| 1.6.2 | 2026-06-20 | **Adversarial-review fixes.** Exempted essential busy indicators (.animate-spin/-slow, indeterminate progress barber-pole) from the reduced-motion guard at a calm cadence (§8.5) — the blanket guard had frozen the only "working vs hung" cue for reduced-motion users. Documented --action-primary/--on-action as the canonical action tokens (--accent/--text-on-accent retained aliases, P5 collapses); marked six not-yet-consumed tokens as pending (not dead); de-duplicated --pulse-duration. |
| 1.6.3 | 2026-06-20 | **Adversarial-review round 2 fixes.** Added dark-mode `--accent-rgb` override (was inheriting light channels — the sibling `--accent-tint-*` were synced but this wasn't). Removed the spec's own "don't mix on-color families" counter-examples: action buttons (ConfirmModal confirm, ApiGuidePanel link) now pair `--on-action` with `--action-primary`; the NarratorCard accent avatar pairs `--text-on-accent` with `--accent`. Doc-accuracy fixes: corrected the `--accent` consumer count (~94 files, was ~36), corrected mislabeled "pending P3" markers on reading-column/chrome tokens, completed the §8.5 fenced code block to show the busy-indicator exemptions, and documented the per-cadence derivation. |
| 1.6.4 | 2026-06-20 | **§2.2 compliance (QW-7).** Registered two on-color tokens — `--text-on-error` (#ffffff, fixed in both themes) and `--text-on-warning` (#1c1300, fixed in both themes) — and converted the last five hardcoded color literals in real-app components to tokens: `StatusOrb` `!`-on-error and triangle-on-warning, `LiveOutputTable` two on-accent button labels (→ `--text-on-accent`), and the `ColorSwatchPicker` highlight dot (→ `--surface-glass-half`). Light theme unchanged. Two intentional dark-mode effects: `LiveOutputTable` on-accent labels now resolve to dark text on the lightened dark accent (a contrast fix — the old `#fff` was low-contrast there), and the warning glyph shifted from pure `#000` to `#1c1300`. Known pre-existing item (not introduced here, decorative 10px glyph): dark `--text-on-error` #ffffff on dark `--error` #f87171 ≈ 3.5:1 — tracked for the a11y pass. |
| 1.8.0 | 2026-06-21 | **P3: StatusOrb icon-insets (INV-4); PredictiveProgressBar terminus icon + calm-pulse (.is-running); progress-presentation.md cross-ref.** `StatusOrb` queued→`Clock`, running→`Loader2`+calm-pulse ring, done→`Check`, error→`X`, cached→`Archive`; orb fills switch to tinted rgba, ring stroke carries the semantic color. `PredictiveProgressBar` gains a 12px terminus icon at the fill leading edge (visible when fill > 8%): `Clock` preparing, `Loader2` running, `Check` done, `X` failed/cancelled; fill div gets `.is-running` class when live-animated (calm-pulse via `--pulse-duration`). `@keyframes calm-pulse` added to `utilities.css`; `.is-running` updated in `components.css` with `--pulse-duration: 3s` INV-5 override. |
| 1.9.0 | 2026-06-21 | **P4: glass material audit.** Pinned chrome (nav rail, top bar) → solid `var(--surface-alt)` + `1px solid var(--hairline)` border, no `backdrop-filter`. Floating layers (ActionMenu popover, VoiceUtils speed popover, `.popover-panel`) retain glass; hardcoded blur literals replaced with `var(--blur-glass-strong)`. `--blur-glass-strong` tightened 40px → 28px. Material token doc updated to make pinned=solid+hairline / floating=glass rule explicit. |
| 1.10.0 | 2026-06-21 | **P5 Sub-task A: inline-style extraction + hardcoded-color tokenization for four form/modal primitives.** `ConfirmModal`: `borderRadius` → `var(--radius-card)`/`var(--radius-button)`; removed `backgroundColor`/`color` inline overrides on confirm button (fought `btn-danger`/`btn-primary` classes); close-button styles → `.modal-close-btn` class. `SearchableSelect`: dropdown panel radius → `var(--radius-card)`; search input radius → `var(--radius-button)`, `fontSize` → `var(--type-callout)`. `ColorSwatchPicker`: wrapper layout extracted to `.color-swatch-picker` class; `COLORS_64` palette grandfathered (intentional character-color data). `VoiceDropzone`: file-item card and info-strip radii → `var(--radius-button)`; drag-zone static layout extracted to `.voice-dropzone` class; dynamic `isDragging` styles stay inline as token expressions. Four new classes added to `components.css` under `/* ─── Form Primitives (P5) ─── */`. Sub-task B (`--accent` → `--action-primary` rename) deferred — alias kept permanent (see §2.1). |
| 1.12.0 | 2026-06-21 | **Post-P3 owner feedback — declutter PredictiveProgressBar.** Removed the leading-edge terminus icon (the spinner/check at the moving fill edge) and the redundant uppercase status pill (`PREPARING`/`RUNNING`/`DONE`) — both duplicated what the right-side status/ETA text and fill already convey. `formatStatusLabel`/`displayStatusLabel` and the `lucide-react` icon imports dropped from the component; `.is-running` calm-pulse retained. State stays non-color-only (label + right-side text + fill), so WCAG 1.4.1 holds. StyleguidePage progress specimens relabeled to a realistic task name. |
| 1.13.0 | 2026-06-27 | **§9.6 Attribution encoding (binding) — color is identity.** Added the cross-cutting rule for dialogue surfaces (Studio chapter editor + Book/Screenplay/Stage views): speaker color encodes **identity only** (exactly one color per character — never the voice, variation, or state); performance variation (Natural/Whisper/Urgent/custom) is a **text label** beneath the speaker name, never color; a voice shared by two characters is an `AlertTriangle` **⚠ flag** on the cast row + a tier-header count, never re-coloring. One meaning per channel; overloading color = mud at scale + WCAG 1.4.1 failure. Mirrors the `StatusOrb` icon+color philosophy (§6) and the §9.3 color-marker exception. Rationale + rejected color-by-voice alternative: [ADR-0015](../decisions/ADR-0015-attribution-color-is-identity.md). Realized in the mock (`siteMockup/panes/directorsConsole.tsx`). |
| 1.11.0 | 2026-06-21 | **P6: demo polish + Quiet Studio baseline (INV-7 complete).** `siteMockup/panes/platform.tsx`: three hardcoded `backdropFilter: 'blur(4px)'` modal overlay instances replaced with `var(--blur-glass)` token. `siteMockup/panes/splash.tsx`: decorative logo-halo `filter: 'blur(6px)'` annotated with `/* decorative */` comment (grandfathered non-interactive background). `StyleguidePage.tsx`: StatusOrb live specimens added to Section 3 Components (queued, running, partial, done, cached, stale, error, empty states); updated section note — StatusOrb is no longer skipped. `docs/style-guide/current.html` regenerated as the Quiet Studio baseline (2026-06-21): token values updated to final shipped state (`--bg: #f5f7fb`, `--accent/#action-primary: #1e4fd8` light / `#6b9fff` dark, `--blur-glass-strong: saturate(180%) blur(28px)`, tightened radii, corrected text/muted values); color swatches and WCAG contrast table updated; footer note records the Quiet Studio baseline. `docs/style-guide/README.md` updated: `current.html` row reflects 2026-06-21 snapshot; `proposed-quiet-studio.html` noted as shipped design direction retained as historical reference. |
| 1.7.0 | 2026-06-21 | **P2 forms/Switch.** New Switch component (role="switch", TDD); accent-color checkboxes/radios (18px, 44px region); drop pill radii GlassInput 100px + VoiceDropzone 99px → --radius-button; PredictiveProgressBar badge 999px → --radius-compact; GlassInput inline styles extracted to .form-input token class. |
| 1.6.5 | 2026-06-21 | **A4/A6/A7/A8/A10 a11y pass.** `StatusOrb` gains `role="img"` (A8, §8.2). Icon-only buttons in `ScriptView` (Play, Generate/Rebuild), `ReorderableQueueItem` (Trash2 remove, GripVertical drag handle), and the existing `ActionMenu`/`PlayerBar`/`ConfirmModal` are now all labelled — §8.2 binding rule met. `GlobalQueue` mounts an always-present `role="status" aria-live="polite"` region that announces job completions; `App.tsx` toast already had an equivalent region (A6). `JsonSchemaForm` wires `htmlFor`/`id` on every rendered control (range, select, text/password, toggle, read-only display) via a `setting-${key}` stable id; `ToggleButton` accepts an optional `id` prop (A7). Visually-hidden `<h1>` added to `ProjectLibrary`, `VoicesPage`, and `GlobalQueue` (page mode only); `NavRail` keeps `aria-label="Primary"` (matches existing Layout tests) and `<main>` was already present in `AppShell` (A10). A5 (keyboard drag-reorder for `ChapterTable`) deferred — Framer Motion `Reorder` does not provide a keyboard reorder API; would require bespoke ArrowUp/Down handlers + position arithmetic. |

---

## 1. Purpose & Scope

This spec is the authoritative reference for the frontend design system: the design-token registry, the theming contract, the type scale, the voice-attribute pill presentation, the shared component primitives, the responsive model, and the accessibility baseline.

It governs how UI looks and behaves consistently across pages — brand identity (§10), colors and their measured contrast (§2, incl. §2.4), surfaces, spacing, radius, typography, focus, keyboard access, and the canonical building blocks every screen reuses. It does **not** own page layout/routing (see `site-shell-and-book-pipeline.md`), progress-bar internals (see `progress-presentation.md`), the voice-attribute *vocabulary* (see `voice-bundles.md` §8), or UI *copy / voice & tone* (see [voice-tone.md](voice-tone.md)).

Specs and code are jointly authoritative. If this spec and the implementation disagree, resolve the drift explicitly by changing one or the other in the same PR.

Throughout this spec, **current** marks behavior that ships in the running app today; **target** marks behavior that is approved and mocked but not yet wired into the real pages (implementation tracked in `design-docs/plans/reference/site_redesign_rollout/`).

---

## 2. Design Tokens

### 2.1 Token registry

All design tokens are CSS custom properties declared in `frontend/src/theme/tokens.css`. The light/default values live on `:root`; the dark overrides live on `[data-theme="dark"]`. This file is the single registry — tokens MUST NOT be redefined per-component or per-page.

Token categories (current):

| Category | Example tokens |
|----------|----------------|
| Background / surface | `--bg`, `--background`, `--surface`, `--surface-alt`, `--surface-light`, `--surface-white`, `--surface-pressed`, `--surface-code`, `--surface-code-border`, `--surface-dim`, `--surface-tinted-light`, `--surface-reading` (warm off-white for manuscript/reading columns) |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-subtle` (NEW — large/chrome only; MUST NOT carry body text), `--text`, `--text-on-accent`, `--text-on-error` (NEW — text/icon on error fills; #ffffff in both themes), `--text-on-warning` (NEW — text/icon on warning fills; #1c1300 in both themes), `--text-code-muted`, `--text-code-info` |
| Border | `--border`, `--border-muted`, `--glass-border` |
| Accent | `--accent` (#1e4fd8 light / #6b9fff dark — value changed in P1; name kept as alias), `--accent-hover`, `--accent-active`, `--accent-secondary`, `--accent-glow`, `--accent-tint`, `--accent-tint-bg`, `--accent-tint-border`, `--accent-focus-ring`, `--accent-rgb`; **role-named family (NEW):** `--action-primary` / `--action-primary-hover` / `--action-primary-active` (semantic alias for `--accent`), `--on-action` (text on action-primary fills), `--primary-border-inset` (1px inset border on flat buttons), `--live-indicator`. **Canonical:** use `--action-primary` / `--on-action` for new action surfaces. **`--accent` is a permanent compatibility alias for `--action-primary`** (same value; new code should prefer `--action-primary`). The full `--accent` → `--action-primary` rename across all 127 consumer files (R3, Sub-task B) shipped in 1.17.0 (2026-07-16); `--accent` itself is not being retired — it remains a permanent alias, only its call sites were renamed. `--text-on-accent` is likewise a permanent alias for `--on-action` for existing consumers. Don't mix — pair `--on-action` with `--action-primary`, `--text-on-accent` with `--accent`. |
| State (success / warning / error / cached) | `--success`, `--success-muted`, `--success-strong`, `--success-strong-hover`, `--success-color`, `--success-text`, `--success-tint-bg`, `--on-success` (NEW — text on success fills), `--warning`, `--warning-text`, `--warning-text-strong`, `--warning-tint-bg`, `--warning-tint-border`, `--text-on-warning` (NEW — text/icon on warning fills; fixed dark #1c1300 both themes), `--error`, `--error-text`, `--error-text-strong`, `--error-tint-bg`, `--error-tint-border`, `--error-glow`, `--text-on-error` (NEW — text/icon on error fills; fixed white #ffffff both themes); **Cached state (NEW):** `--status-cached-text` (amber text on surface — #9a4d0a light / #fbbf24 dark), `--status-cached-ring` (ring/icon use only — #a8530a light / #fbbf24 dark) |
| Cloud engine | `--cloud-color`, `--cloud-tint-bg` (the cloud/API-engine accent family — distinct from the local-engine `--accent`) |
| Waveform strip | `--color-wave`, `--color-wave-progress`, `--color-wave-cursor`, `--color-wave-bg`, `--color-wave-btn-bg`, `--color-wave-btn-border`, `--color-wave-btn-active-{bg,border,text}` (audio scrubber; see [audio-player.md](audio-player.md)) |
| Glass / overlay | `--glass`, `--glass-hover`, `--glass-subtle`, `--glass-surface-light`, `--surface-glass-white`, `--surface-glass-half`, `--overlay-backdrop` |
| Radius | `--radius-button` (8px — tightened in P1), `--radius-card` (10px — tightened in P1), `--radius-panel` (18px), `--radius-round` (9999px), `--radius-compact` (6px — NEW; compact controls, badges) |
| Shadow / elevation | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl` (soft layered ambient — a wide diffuse halo + a tight contact shadow) |
| Material (Liquid Glass) | `--blur-glass`, `--blur-glass-strong` (`saturate(180%) blur(28px)` — for `backdrop-filter` on **floating layers only**: popovers, drawers, modals, player while overlapping — NOT on pinned chrome), `--hairline` (low-alpha inner divider, softer than `--border`). **Rule (PART-glass):** pinned chrome (top bar, nav rail, sidebar) MUST be `background: var(--surface-alt); border: 1px solid var(--hairline)` with NO `backdrop-filter`. Floating overlays (popover, modal, drawer, player overlapping content) MAY use glass with `backdrop-filter: var(--blur-glass-strong)`. |
| Motion | `--ease-standard`, `--ease-emphasized`, `--ease-spring`, `--dur-fast`, `--dur-med`, `--dur-slow`, `--pulse-duration` (NEW — 3s; the reduced-motion guard sets `animation-duration: .01ms` on all elements; `.is-running` re-enables `animation-duration: var(--pulse-duration)` (with `!important` + higher specificity) so the calm-pulse survives the guard) |
| Focus | `--accent-focus-ring` (low-alpha glow). **Note:** the keyboard focus ring in `base.css` is now a **double-ring** — `outline: 3px solid var(--action-primary)` plus a 5px `box-shadow` halo (see §8.1). The `--focus-ring` token (`0 0 0 3px …`) is effectively **superseded** by this inline double-ring implementation; `--accent-focus-ring` remains for component-level glow overlays but `--focus-ring` should be considered legacy. |
| Accent treatments | `--accent-gradient`, `--accent-gradient-hover`, `--accent-glow-strong`, `--hero-glow` (primary-action fills + hero glow) |
| Spacing (8pt scale) | `--space-1` (4px) … `--space-8` (48px) |
| Typography | `--type-*` sizes + `--type-weight-*`, `--leading-*`, `--tracking-*` (see §4) |
| Voice-pill tints | `--pill-{class,gender,age,extended,tag}-{bg,border,text}` (see §5) |
| Layout metrics | `--header-height` (56px), `--rail-width` (190px), `--rail-width-collapsed` (56px) |
| Brand | `--as-ink`, `--as-muted`, `--as-blue`, `--as-amber`, `--as-amber-tint-bg`, `--as-amber-tint-border`, `--as-info-tint` (see §10) |
| Progress visual states | `--progress-track`, `--progress-finalizing-fill`, `--progress-preparing-fill`, `--progress-queued-fill`, `--progress-done-fill`, `--progress-failed-fill`, `--progress-badge-*`, and the barber-pole overlay family `--progress-stripe-{sheen,pending,finalizing,…}` (see `progress-presentation.md`) |

An 8pt **spacing scale** (`--space-1` = 4px, `--space-2` = 8px, … `--space-8` = 48px) is now defined in `tokens.css` and is the preferred way to express gaps and padding. Adoption is **in progress**: the North-Star mock (`frontend/src/demo/stages/siteMockup/`) uses `--space-*` throughout; some legacy real-app pages still apply literal `rem`/`px` values and should migrate onto the scale when next touched.

### 2.2 Token usage rule (binding)

Components MUST style themselves through tokens, not hardcoded color/elevation values. This is the existing rule in `.agent/rules/frontend-interactions.md` ("Prefer theme variables over hardcoded colors") promoted to a binding design-system constraint:

- **MUST** reference `var(--token)` for any color, surface, border, shadow, radius, or overlay value.
- **MUST NOT** introduce raw hex/`rgb()`/`rgba()` literals in component code for themed surfaces. Where a literal is unavoidable (e.g. `color: '#fff'` on a known-colored fill such as the error orb glyph), it MUST be a value that is correct in *both* themes by construction.
- A handful of exempt literals exist (e.g. white text on a saturated accent fill); new code SHOULD prefer `--on-action` over a raw `white`/`#fff` (the canonical token for text on action-primary fills); `--text-on-accent` remains valid as its alias but `--on-action` is preferred for new code.

There is currently **no automated lint/CI gate** enforcing token usage; enforcement is by review against this rule. A stylelint/CI check is a reasonable **target** but is not asserted to ship today.

### 2.3 Light + dark parity (binding)

Every surface MUST work in **both** light and dark. Because dark is implemented purely as token overrides on `[data-theme="dark"]`, a component that uses only tokens gets dark mode for free. A component that hardcodes a value will break one theme — which is why §2.2 is binding.

When a new visual state needs a color, add the token (with both `:root` and `[data-theme="dark"]` values) to `tokens.css` rather than inlining a literal.

### 2.4 Color contrast (AA — computed)

**Target: WCAG 2.2 AA** — **4.5:1** for normal text, **3:1** for large text (≥ 24px, or ≥ 18.66px bold) and non-text UI (focus rings, control borders). The ratios below are **computed from the shipped token values** (sRGB relative luminance per WCAG). Tint backgrounds (`*-tint-bg`, pill `-bg`, `*-muted`) are `rgba` over their surface, so each is **composited against the underlying opaque surface first** — measuring against the bare `rgba` overstates contrast. Recompute when a token value changes.

**Light theme**

| Foreground | Background | Ratio | Verdict |
|------------|------------|-------|---------|
| `--text-primary` #1c2b4a | `--bg` #f5f7fb | 13.11 | AAA |
| `--text-primary` #1c2b4a | `--surface` #ffffff | 13.11 | AAA |
| `--text-secondary` #475569 | `--surface` #ffffff | 7.58 | AAA |
| `--text-muted` #5c6a80 | `--surface` #ffffff | 5.49 | AA |
| `--text-muted` #5c6a80 | `--surface-alt` #f0f3f9 | 4.94 | AA |
| `--text-subtle` #64748b | `--surface` #ffffff | 4.76 | AA (chrome/large only — MUST NOT carry body text) |
| `--on-action` #ffffff | `--action-primary` #1e4fd8 | 6.63 | AA |
| `--status-cached-text` #9a4d0a | `--surface` #ffffff | 6.10 | AA |
| `--status-cached-ring` #a8530a | `--surface` #ffffff | 5.38 | AA (UI/non-text ≥ 3) |
| `--on-success` #04240f | `--success` #10b981 | 6.55 | AA |
| `--error-text` #991b1b | `--error-tint-bg` | 7.28 | AAA |
| `--error-text-strong` #b91c1c | `--error-tint-bg` | 5.66 | AA |
| `--warning-text` #92400e | `--warning-tint-bg` | 6.66 | AA |
| `--warning-text-strong` #b45309 | `--warning-tint-bg` | 4.72 | AA |
| `--success-text` #15803d | `--success-tint-bg` | 4.56 | AA |
| `--success-text` #15803d | `--success-muted` #d1fae5 | 4.42 | ⚠ large-only (< 4.5) |
| `--pill-class-text` #4338ca | `--pill-class-bg` | 6.81 | AA |
| `--pill-gender-text` #be185d | `--pill-gender-bg` | 5.35 | AA |
| `--pill-age-text` #92400e | `--pill-age-bg` | 6.56 | AA |
| `--pill-extended-text` #0f766e | `--pill-extended-bg` | 5.00 | AA |
| `--pill-class-text` #4338ca | `--surface` #ffffff | 7.90 | AAA |
| `--pill-gender-text` #be185d | `--surface` #ffffff | 6.04 | AA |
| `--pill-age-text` #92400e | `--surface` #ffffff | 7.09 | AA |
| `--pill-extended-text` #0f766e | `--surface` #ffffff | 5.47 | AA |
| `--pill-extended-text` #0f766e | `--surface-alt` #f0f3f9 | 4.92 | AA |

**Dark theme**

| Foreground | Background | Ratio | Verdict |
|------------|------------|-------|---------|
| `--text-primary` #e8eaf0 | `--bg` #0d0f14 | 15.94 | AAA |
| `--text-primary` #e8eaf0 | `--surface` #1a1d27 | 13.98 | AAA |
| `--text-secondary` #a8b2c4 | `--surface` #1a1d27 | 7.87 | AAA |
| `--text-muted` #8b95a8 | `--surface` #1a1d27 | 5.57 | AA — RESOLVES prior failure |
| `--text-muted` #8b95a8 | `--surface-alt` #161922 | 5.82 | AA |
| `--text-subtle` #6b7a92 | `--surface` #1a1d27 | 3.86 | AA (chrome/large only — MUST NOT carry body text) |
| `--on-action` #0d0f14 | `--action-primary` #6b9fff | 7.33 | AAA |
| `--on-success` #052e16 | `--success` #10b981 | 5.88 | AA |
| `--error-text` #fca5a5 | `--error-tint-bg` | 7.60 | AAA |
| `--warning-text` #fbbf24 | `--warning-tint-bg` | 8.21 | AAA |
| `--success-text` #34d399 | `--success-tint-bg` | 7.23 | AAA |
| `--pill-class-text` #a5b4fc | `--pill-class-bg` | 6.93 | AA |
| `--pill-gender-text` #f9a8d4 | `--pill-gender-bg` | 7.70 | AAA |
| `--pill-age-text` #fcd34d | `--pill-age-bg` | 9.07 | AAA |
| `--pill-extended-text` #5eead4 | `--pill-extended-bg` | 8.91 | AAA |
| `--pill-class-text` #a5b4fc | `--surface` #1a1d27 | 8.43 | AAA |
| `--pill-gender-text` #f9a8d4 | `--surface` #1a1d27 | 9.27 | AAA |
| `--pill-age-text` #fcd34d | `--surface` #1a1d27 | 11.66 | AAA |
| `--pill-extended-text` #5eead4 | `--surface` #1a1d27 | 11.37 | AAA |

**Binding rules & known borderline pairs:**

- ✓ **RESOLVED — white-on-accent:** `--on-action` #ffffff on `--action-primary` #1e4fd8 is now **6.63:1** (AA). The prior borderline (white on #2b6eff = 4.40) is resolved by the P1 accent shift to #1e4fd8. Primary-button labels in both themes are now fully AA-compliant at normal text sizes.
- ✓ **RESOLVED — dark-mode `--text-muted`:** `--text-muted` #8b95a8 on `--surface` #1a1d27 is now **5.57:1** (AA). The prior failure (#6b7280, 3.48:1) is resolved by the P1 dark text ladder update. `--text-muted` may now be used for body text in dark mode.
- ⚠ **`--text-subtle` is chrome/large-only in both themes:** #64748b on surface (light) = 4.76 and #6b7a92 on surface (dark) = 3.86. The dark value meets AA only for large text (≥ 24px or ≥ 18.66px bold) and UI elements (≥ 3:1). **`--text-subtle` MUST NOT carry body text in either theme** — use `--text-muted` or `--text-secondary` instead.
- `--text-muted` in **light** mode (#5c6a80) is 5.49 on `--surface` and 4.94 on `--surface-alt` — both pass AA.
- **`--pill-*-text` on `--surface`/`--surface-alt` (F3.1):** attribute section headers (`OneSelect`/`ManySelect`/`OverviewTab`) tint their label text directly with a facet's `--pill-*-text` token so the header hue matches its pills — a different pairing than the pill's own `-text`-on`-bg` rows above, since the header sits on the page surface, not the pill's tinted background. Every facet clears AA on both surfaces in both themes (light low: `--pill-extended-text` on `--surface-alt` = 4.92; dark low: `--pill-class-text` on `--surface` = 8.43).
- Every other pair meets AA (most AAA). **New colors MUST be added as tokens whose *composited* contrast meets AA in both themes** — verify before adding, not after.

---

## 3. Theming

### 3.1 Theme model (current)

The theme preference is the union type `Theme = 'light' | 'dark' | 'system'`, defined in `frontend/src/utils/theme.ts`. `system` is the default and follows the OS color scheme.

- `getEffectiveTheme(pref)` resolves `system` to `'light' | 'dark'` via `window.matchMedia('(prefers-color-scheme: dark)')`.
- `applyTheme(pref)` writes the **effective** theme onto the root element: `document.documentElement.setAttribute('data-theme', effective)`. All dark styling keys off this `[data-theme="dark"]` attribute.
- `loadThemePref()` reads the preference from `localStorage` under `STORAGE_KEY = 'studio-theme'`, defaulting to `'system'` (and on any storage error).
- `saveThemePref(pref)` persists to `localStorage` and immediately calls `applyTheme(pref)`.

### 3.2 No-flash bootstrap (current)

`frontend/src/main.tsx` applies the persisted theme **before first React render** to avoid a flash-of-wrong-theme:

```ts
applyTheme(loadThemePref());
```

It also registers a `matchMedia('(prefers-color-scheme: dark)')` `change` listener that re-applies the theme live **only when** the stored preference is `'system'` — so `system` reacts to OS changes in real time without overriding an explicit light/dark choice.

### 3.3 Theme controls (current)

Two entry points set the theme:

- **Settings → General** (`frontend/src/pages/Settings/components/GeneralSettingsPanel.tsx`): a labeled `<select aria-label="Theme">` with the full `System | Light | Dark` choice. Selecting an option calls `saveThemePref`. This is the canonical place to choose `system`.
- **Nav rail bottom** (`frontend/src/app/layout/NavRail.tsx`) and the **mobile drawer** (`MobileNavDrawer.tsx`): a quick toggle via the `useThemeToggle` hook. The rail toggle flips between explicit `light` and `dark` only (it reads the current effective theme from `documentElement.dataset.theme` and writes the opposite); it does not cycle through `system`. To return to OS-follow mode, use Settings → General.

The toggle, route map, and navigation model are shared between the rail and the drawer (cross-ref `site-shell-and-book-pipeline.md` §2.4–2.5).

---

## 4. Type Scale

The approved 6-step semantic type scale (owner decision U3, approved 2026-06-12 in `design-docs/plans/reference/site_experience_north_star.md` §12):

| Step | Size | Weight | Role |
|------|------|--------|------|
| title | 1.5rem | 700 | Page / section title |
| headline | 1.125rem | 600 | Card and panel headings |
| body | 0.9375rem | 400 | Default reading text |
| callout | 0.875rem | 400 | Secondary / supporting text |
| caption | 0.75rem | 500 | Labels, metadata |
| micro | 0.6875rem | 600 | Pills, badges, smallest legible text |

**Status: tokenized (current).** The scale lives in `tokens.css` as the size tokens `--type-title`, `--type-headline`, `--type-body`, `--type-callout`, `--type-caption`, `--type-micro`, each paired with a `--type-weight-*` weight. Three larger sizes extend it for hero/reading surfaces:

| Token | Size | Role |
|-------|------|------|
| `--type-display` | 2.25rem | Splash / large hero |
| `--type-large-title` | 1.875rem | Page greeting / section hero |
| `--type-reading` | 1.0625rem | Long-form manuscript / script body |

Companion **line-height** and **letter-spacing** tokens pair with the sizes: `--leading-tight | --leading-snug | --leading-normal | --leading-reading` and `--tracking-display | --tracking-tight | --tracking-wide`.

### 4.1 Typeface (current)

Four typefaces are **self-hosted** via `@fontsource` and assigned to role tokens in `tokens.css`:

| Role | Font | Token | Self-hosted via |
|------|------|-------|-----------------|
| UI body | **Geist Variable** | `--font-ui` | `@fontsource-variable/geist` |
| Display / headings | **Space Grotesk** | `--font-display` | `@fontsource/space-grotesk` |
| Reading column | **Source Serif 4** | `--font-reading` | `@fontsource/source-serif-4` |
| Code / logs | **Geist Mono** | `--font-mono` | `@fontsource/geist-mono` |

All four are imported in `frontend/src/main.tsx` (Inter → Geist → Geist Mono → Source Serif 4 → Space Grotesk order). **Inter remains as an explicit third-fallback** in `--font-ui` (`'Geist Variable', 'Geist', 'Inter', system-ui, …`) so a failed import never silently regresses to system-ui. `base.css` consumes the tokens: `body` uses `var(--font-ui)`; `h1–h4` use `var(--font-display)`; `code, pre` use `var(--font-mono)`. Reading-column layouts should apply `var(--font-reading)` directly. (Before 2026-06-19 Inter and Space Grotesk were named in CSS stacks but never delivered — no `@font-face`, no bundled file — so the app silently fell back to system-ui; self-hosting all four faces is the Quiet Studio P0 fix, resolving open question R1.)

### 4.2 Weight & tracking pairing (current + gaps)

Six of the nine sizes have a paired weight token (`--type-weight-display/title/headline/body/caption/micro`). **`--type-large-title`, `--type-reading`, and `--type-callout` have no weight token** — authors pick a weight by hand for those. Letter-spacing tokens are likewise asymmetric (`--tracking-display/-tight/-wide` only; no `normal`/`snug`), so some size+leading pairings have no matching tracking token. Closing these gaps is a tracked follow-up; until then default `--type-callout`/`--type-reading` to weight 400 and `--type-large-title` to 700.

### 4.3 Adoption status (current)

Token adoption in the **real app is minimal**: of ~615 `var(--type-*)` references in the frontend, ~604 are in the demo (`frontend/src/demo/`) and **only ~11 are in real pages — all in `WelcomePage.tsx`**. Real pages otherwise render through the `base.css` globals plus ~96 literal `font-size` declarations, several off-scale (e.g. `0.72rem`, `0.82rem`, `0.65rem`) or duplicating a token value as a literal. This is a **not-yet-started migration**, not one "in progress"; migrating real pages onto the `--type-*` tokens is a tracked follow-up (`design-docs/plans/reference/site_redesign_rollout/`) — apply tokens whenever a page is next touched.

---

## 5. Voice Attribute Pill Taxonomy (Presentation)

This section governs the **presentation** of voice-attribute pills only. The attribute *values/vocabulary* (class, gender, age, language, accent, style, etc.) are owned by `voice-bundles.md` §8 and `design-docs/specs/voice-taxonomy.json` — do not duplicate them here.

**Status: current.** The `--pill-*` tint tokens (class / gender / age / extended / tag, each with `-bg` / `-border` / `-text`, and light + dark values) are defined in `tokens.css`. The owner-approved styling (`design-docs/plans/reference/site_experience_north_star.md` §12) originated in the `VoiceAttrPill` primitive in the site mockup demo stage (`frontend/src/demo/stages/siteMockup`) and is now also **wired into the real Voices page**: `VoicePillRow` / `voicePillsFromMetadata` (`frontend/src/pages/Voices/components/VoicePills.tsx`) consume the same tokens and are rendered by `VoiceCatalogCard` (catalog grid) and the Voice Lab header/pill row.

Approved presentation rules:

- **Tinted fills, not outlined chips (Apple-style):** each pill is a muted **tinted fill** with **same-hue text** and a **low-alpha same-hue border**. Do NOT use a colored outline on a neutral fill.
- **No leading icons** on attribute pills.
- **Distinct hues per primary facet:** `class`, `gender`, and `age` each get their own distinct hue.
- **Shared hue for extended attributes:** `language`, `accent`, and `style` SHARE a single hue (one extended-attribute color family).
- **Free-form tags are neutral:** user tags render as neutral ghost pills (no hue).
- **Fixed order:** `class · gender · age · extended · tags`.
- **Overflow:** excess pills collapse into a `+N` affordance that expands on tap.

These pill tints live in `tokens.css` as `--pill-*` tokens (light + dark per §2); components MUST consume the tokens rather than inlining hex.

---

## 6. Shared Component Primitives

These are the canonical building blocks. New UI MUST reuse them rather than re-implementing equivalent behavior. They live under `frontend/src/components/`.

| Primitive | File | Purpose | Rule |
|-----------|------|---------|------|
| `StatusOrb` | `components/ui/StatusOrb.tsx` | Chapter status indicator: a colored orb with icon-insets, circumferential render-progress ring, and token-keyed fills. State is dual-encoded as icon + color (WCAG 1.4.1 / INV-4). Icon per state: `Clock` queued (static), `Loader2` running (spin + calm-pulse ring via `.is-running`), `Check` done, `X` error, `AlertTriangle` stale/stuck, `Archive` cached-M4A (empty state only). Orb fill is a tinted rgba; ring stroke carries the semantic token (`--live-indicator` running, `--success` done, `--error` error, `--status-cached-ring` M4A). Props and arc/SVG geometry are unchanged (P3 is view-layer only). | **Binding:** preserved everywhere chapter status appears (rail chapter list, Manuscript/chapter tables, Activity). Plain colored dots are NEVER an acceptable substitute (owner directive, north star §12 round 5c). Color is never the sole signal (INV-4). |
| `ActionMenu` | `components/ui/ActionMenu.tsx` | Canonical kebab / overflow menu. Portal-rendered, viewport-flip-aware, closes on outside-click and Escape, supports dividers, destructive items, and disabled items. | The standard overflow / "⋯" affordance. MUST be used for row/card action menus rather than bespoke dropdowns. |
| `GhostButton` | `components/ui/GhostButton.tsx` | Canonical low-emphasis icon/icon+label button with hover/active states and built-in `aria-label` fallback. | The default for secondary/tertiary actions and toolbar buttons. |
| `InlineEdit` | `components/forms/InlineEdit.tsx` | Canonical click-to-edit text field: single click to edit, save on blur/Enter, cancel on Escape, no pencil affordance, auto-select on focus, optional multiline. | The standard pattern for in-place rename/edit of titles and labels. |
| `ConfirmModal` | `components/overlays/ConfirmModal.tsx` | Canonical confirmation/alert dialog. `role="dialog"`, `aria-modal`, `aria-labelledby`, backdrop scrim, Escape-to-cancel, focus-trapped via `useFocusTrap`, destructive vs. neutral confirm styling. `isDestructive` defaults **true** (→ `btn-danger`); `isAlert` collapses to a single Close button. **P5:** radii tokenized (`var(--radius-card)` on modal surface + icon wrapper, `var(--radius-button)` on footer buttons); inline `backgroundColor`/`color` overrides removed from confirm button (class `btn-danger`/`btn-primary` now wins); close-button static styles extracted to `.modal-close-btn` CSS class. | The standard destructive-confirm / alert surface (per north star U1, modals remain for project delete and bulk audio reset). Copy rules live in [voice-tone.md](voice-tone.md). |
| `PluginTrustModal` | `components/overlays/PluginTrustModal.tsx` | Second canonical focus-trapped (`useFocusTrap`) modal: a security-confirm for plugin import / dependency install that surfaces remote requirement sources. | The standard trust/permission confirmation. Same focus-trap + dialog-semantics contract as `ConfirmModal`. |
| `Switch` | `components/ui/Switch.tsx` | `role="switch"` `aria-checked` toggle. Props: `checked`, `onChange`, `label?`, `id?`, `disabled?`. ~48×26px pill track with `--action-primary` ON / neutral OFF. Knob translate snaps under reduced-motion (R6). 44px min-height interactive target. Dual-encoded: position + color. TDD. | The canonical boolean toggle. Callers adopt this rather than hand-rolling `role="switch"` buttons. |
| `GlassInput` | `components/forms/GlassInput.tsx` | Glass text input; optional leading icon; focus ring via `.form-input:focus` CSS. Inline styles extracted to `.form-input` token class in `components.css` (P2); pill radius dropped from 100px to `var(--radius-button)` (8px); `transition: all` replaced with explicit property list. Adds `form-input--with-icon` class when `icon` prop is truthy. No size variants (size follows context). | The default single-line text / search input. |
| `SearchableSelect` | `components/forms/SearchableSelect.tsx` | Filterable select (**default export**) with a none-option and an optional create-new affordance. **P5:** dropdown panel radius → `var(--radius-card)`; search input radius → `var(--radius-button)`; search input `fontSize` → `var(--type-callout)`. Dynamic `isOpen` focus styles remain inline as token expressions. | The standard typeahead/select for long option lists (voices, characters). |
| `MultiSelect` | `components/forms/MultiSelect.tsx` | Compact multi-value combobox — chip trigger + checkbox-style panel. | MUST be used for any new multi-value filter/select rather than a bespoke chip-toggle row. |
| `ColorSwatchPicker` | `components/forms/ColorSwatchPicker.tsx` | 64-swatch palette popover (`sm`/`md`) plus a custom-color pipette. Picker panel renders via `.popover-panel` class (glass surface, `var(--radius-panel)`, `var(--shadow-xl)`). **P5:** wrapper layout extracted to `.color-swatch-picker` class. `COLORS_64` (64-entry character-color data array) is **grandfathered** — intentional presentational palette data, not theme tokens; the dynamic per-swatch `backgroundColor` styles are also grandfathered. | The canonical color chooser for character / voice colors. |
| `VoiceDropzone` | `components/forms/VoiceDropzone.tsx` | Drag-drop audio upload with per-file validation/warnings and a duration readout. **P5:** file-item card and info-strip `borderRadius: '8px'` → `var(--radius-button)`; drag-zone static layout (flex, padding, cursor, transition, radius) extracted to `.voice-dropzone` class; dynamic `isDragging` border-color and background stay inline as token expressions. | The standard audio-file drop target (voice-sample ingest). Domain-leaning but reusable. |
| `BrandLogo` | `components/layout/BrandLogo.tsx` | Scalable brand wordmark + optional pictorial mark; single-line vs stacked. Uses bespoke `--as-title-fs`/`--as-sub-fs` clamp sizes (outside the `--type-*` scale). | The canonical brand mark — never hand-roll the wordmark. See §10. |
| `PlayerBar` | `app/layout/PlayerBar.tsx` | Global audio-transport chrome — a **singleton** bound to the player store that renders `null` when no audio is loaded; lucide transport icons, scrub/waveform via `WaveformStrip`. | The single audio-transport surface (cross-ref [audio-player.md](audio-player.md)). There is **no** standalone `PlayButton` primitive — transport lives only here. |

`PredictiveProgressBar` is also a shared primitive but is fully specified in `progress-presentation.md` — see that spec; do not re-document its contract here. Visual layer: the fill div receives `.is-running` when `isLiveAnimatedStatus(presentationState)` is true, wiring `@keyframes calm-pulse` via `--pulse-duration` (INV-5). The fill background uses `var(--progress-preparing-fill)` (solid slate) for preparing and `var(--live-indicator)` (full-opacity action blue) for running — both from tokens, no hardcoded colors. The P3 leading-edge terminus icon and the uppercase status pill were **removed** (owner feedback, v1.12.0) as redundant — state is conveyed by the label, the right-side status/ETA text (`Working…` / ETA+% / `Complete`), and the fill, satisfying WCAG 1.4.1 without color alone. Props, ETA math, lane logic, and invariants are unchanged.

**Not yet primitives (gaps).** Two common patterns are *not* extracted and currently have no canonical component: **Toast** (success/notice feedback is inline `useState` + `setTimeout` in `app/App.tsx`, not a reusable component or hook) and **Tooltip** (hover hints are native `title=` attributes only — there is no `.tooltip` class or `Tooltip` component). Building a `Toast` and a `Tooltip` primitive, or formally ratifying the `title=` convention, are tracked follow-ups; until then, do not hand-roll bespoke toast/tooltip implementations per page.

---

## 7. Responsive

### 7.1 Breakpoints (current)

The codebase uses a small set of `max-width` breakpoints across `theme/components/` (domain-scoped CSS, see §1's sources) and `theme/utilities.css`. The load-bearing one is the rail → drawer switch:

| Breakpoint | Behavior |
|------------|----------|
| `max-width: 768px` | **Rail → drawer.** `.nav-rail { display: none }` (`theme/components/nav.css`); the global navigation is served by the mobile drawer instead (cross-ref `site-shell-and-book-pipeline.md` §2.5). Form/layout utilities also stack at this width (`utilities.css`). |
| `max-width: 1450px` | Chapter header collapses to a 2-column grid. |
| `max-width: 1250px` / `1100px` / `1000px` / `800px` / `640px` | Page-level grid/flex columns collapse to single-column (publish stage, activity page, assembly picker, etc.). |

### 7.2 Graceful degradation (binding)

Layouts MUST degrade gracefully on smaller screens (`.agent/rules/frontend-interactions.md`): sticky controls and two-pane layouts must remain usable, and global navigation must remain reachable via the drawer below 768px.

The **390px ChapterEditor tablet minimum** is a documented design **target** (the editor should remain operable down to ~390px width); it is **not** currently expressed as a hardcoded breakpoint in the theme CSS. Tracking lives in `design-docs/plans/reference/site_redesign_rollout/`.

---

## 8. Accessibility Baseline

The accessibility target is **WCAG 2.2 AA**. The following are binding.

### 8.1 Focus management (current)

- **Focus trap in modals/dialogs:** `useFocusTrap(ref, isOpen)` (`frontend/src/hooks/useFocusTrap.ts`) traps Tab / Shift-Tab inside the container, focuses the first focusable element on open, and restores focus to the trigger element on close. It manages focus only — it does NOT call `onClose`; the caller owns Escape handling. `ConfirmModal` uses it; every new modal/dialog MUST use it.
- **`:focus-visible` rings (current — double-ring):** `base.css` suppresses the outline for pointer interaction and applies a keyboard-only **double-ring** on `:focus-visible` for buttons, inputs, selects, textareas, anchors, and `[tabindex]`: `outline: 3px solid var(--action-primary); outline-offset: 2px` plus a 5px halo via `box-shadow: 0 0 0 5px rgba(255,255,255,.55)` (light) / `rgba(0,0,0,.5)` (dark). The `[data-theme="dark"]` selector overrides the `box-shadow` halo for studio-dark contrast. New interactive elements MUST keep a visible keyboard focus ring (via `:focus-visible`, not a global `outline: none`). The `--focus-ring` token in `tokens.css` is effectively **superseded** by this inline double-ring implementation (see §2.1 Focus note).

### 8.2 Semantics & ARIA (current/binding)

- Prefer semantic HTML before adding ARIA; when ARIA is needed, keep labels and live regions accurate (`.agent/rules/frontend-interactions.md`).
- Interactive chrome carries accessible names: the rail, player bar, and drawer expose `aria-label`/roles; `ConfirmModal` sets `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; `ActionMenu` trigger has `aria-label="More actions"`; `GhostButton` derives an `aria-label` from `ariaLabel || title || label`.
- Icon-only controls MUST have an `aria-label`.

### 8.3 Contrast (binding)

Color contrast is delivered through the token system: text and surface tokens are tuned per theme (§2.3). New colors MUST be added as tokens with contrast that meets AA in both light and dark, rather than inlined literals that satisfy only one theme. **The computed AA ratios for every key text/surface/state/pill pair (both themes) are in §2.4** — consult it before choosing token pairings. The two previously-known failures (white-on-`--accent` and dark-mode `--text-muted`) are **RESOLVED** as of P1; the only remaining chrome/large-only restriction is `--text-subtle` (see §2.4 borderline pairs).

### 8.4 The five UI states (binding)

**44px minimum touch target (current):** form controls (`input`, `select`, `textarea`) have `min-height: 44px` enforced in `base.css` (INV-6). The blanket `button` `min-height: 44px` was **removed** because it deformed compact icon/transport buttons (e.g. `.player-btn`, voice-card buttons) — standard buttons rely on their padding (~40px natural height), and a 44px hit-area for compact icon buttons is a tracked follow-up rather than a blanket `min-height`. This satisfies WCAG 2.5.5 Target Size (AA, 24×24px minimum) for form controls. New form controls MUST not undercut 44px. **Resolved instance:** the voice-catalog-card play/pause overlay button (`.voice-catalog-card__avatar-play-btn`, `voice-lab.css`) grew from 24px to 44px once its avatar doubled as a play target, and the avatar itself grew 40px → 56px to give that 44px button clearance (F5.7).

From `.agent/rules/frontend-ux.md`: every meaningful screen change MUST account for these states, and each MUST be user-meaningful and testable by role/label/visible behavior (not a bare spinner):

1. **loading**
2. **empty**
3. **error**
4. **reconnecting**
5. **recovered** (and the related interrupted/stale/queued/rendering/rendered/failed markers)

Prefer interfaces that explain *why* something is waiting or stale over generic spinners, and prefer inline recovery actions over forcing the user out of the editor. UI-copy rules for these states live in [voice-tone.md](voice-tone.md).

### 8.5 Reduced motion (implemented)

The `prefers-reduced-motion` guard is now the **first rule in `base.css`** (INV-5), applied globally before any other styles:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
  /* Essential-motion exemptions re-enabled inside the guard (see prose below):
     .is-running (calm-pulse, var(--pulse-duration)), .animate-spin (1.6s),
     .animate-spin-slow (3s), and the indeterminate-progress barber-pole
     (.progress-bar-animated / -pending::before / -finalizing::before, 1.2s). */
}
```

This resolves the prior coverage gap (was demo-only). The `--pulse-duration` token is **not** changed by this guard — the guard zeroes `animation-duration` on all elements; `.is-running` re-enables `animation-duration: var(--pulse-duration)` (with `!important` + higher specificity) so the calm-pulse survives the guard — an exemption that is semantically meaningful (a live running indicator is structural status, not decorative motion).

**Functional-motion exemptions (essential, per WCAG 2.3.3):** the blanket guard must NOT freeze motion that is the *sole* cue distinguishing "working" from "hung". Loading spinners (`.animate-spin`, `.animate-spin-slow`) and indeterminate progress (`.progress-bar-animated`, `.progress-bar-pending::before`, `.progress-bar-finalizing::before`) are therefore re-enabled (slowed to a calm cadence) inside the guard alongside `.is-running`. These are the universal busy indicators across the app (boot screen, every submit button, modals, the predictive progress bar's preparing/finalizing states); freezing them would leave a reduced-motion user unable to tell a running render from a stalled one. Framer Motion animations on real-app pages remain a tracked follow-up for explicit `useReducedMotion()` adoption, but the global guard provides a safety net for all *decorative* CSS transitions and keyframe animations.

---

## 9. Iconography

### 9.1 Canonical icon library (binding)

`lucide-react` (pinned in `frontend/package.json`) is the **single** icon system for the app. Every functional or decorative *icon* MUST be rendered as a lucide component. Unicode media/arrow/caret glyphs (`▶ ⏸ ⏮ ⏭ ⏪ ⏩ ■ ▾ ▲ ▼ › ‹ ← → ✓ ✗`) and emoji (`🌙 ☀️`) MUST NOT be used to render an icon: glyphs do not inherit `currentColor`, stroke weight, or optical sizing, and they drift visually between platforms and fonts. lucide gives one coherent, `currentColor`-driven, stroke-consistent set that themes for free.

This rule is binding for the real app and the North-Star mock (`frontend/src/demo/stages/siteMockup/`) alike. The live `PlayerBar` already complied; the mock was standardized onto lucide on 2026-06-16, and the **remaining real-app glyph-as-icon usages were migrated on 2026-06-19** (the 8 sites formerly tracked in §9.5). The real app is now glyph-clean; the intent of recording the rule here is to prevent regressions back to glyphs.

### 9.2 Canonical control → icon mapping (binding)

When one of these controls is rendered, it MUST use the named lucide icon:

| Control / meaning | lucide icon |
|---|---|
| Play / Resume | `Play` |
| Pause | `Pause` |
| Previous / jump to start | `SkipBack` |
| Next / jump to end | `SkipForward` |
| Skip back N seconds | `Rewind` |
| Skip forward N seconds | `FastForward` |
| Stop | `Square` |
| Waveform ↔ bar toggle | `AudioLines` |
| Breadcrumb separator · drill-in · disclosure-collapsed | `ChevronRight` |
| Dropdown / expander caret · disclosure-open | `ChevronDown` |
| Reorder up | `ChevronUp` |
| Back within a pane | `ArrowLeft` |
| Forward / "continue" CTA | `ArrowRight` |
| Affirmative · success · completed | `Check` |
| Negative · failed · dismiss/close | `X` |
| Theme toggle — switch to dark (currently light) | `Moon` |
| Theme toggle — switch to light (currently dark) | `Sun` |

Transport icons render **outlined** (lucide default, `strokeWidth` ≈ 2–2.2) to match the live `PlayerBar`; see [audio-player.md](audio-player.md). New control types pick the closest semantically-correct lucide icon and SHOULD be added to this table.

### 9.3 Deliberate non-icon exceptions

These are intentionally NOT lucide and are exempt from §9.1:

- **Status dots** — the connection indicator and character/voice color markers are a small colored **fill**, not an icon. (Chapter status remains `StatusOrb` only, per §6 — a plain dot is still never an acceptable substitute for `StatusOrb`.)
- **Raster artwork** — the brand mark (`logo.png`), AI-generated voice-avatar images, and plugin-provided engine logos (`engine.logo_url`) are purposeful images, not glyph icons.
- **"From → to" notation** — a `→` inside inline text such as `184 → 186` is typographic notation, not a control, and stays as a glyph.

### 9.4 Accessibility

Icon-only controls MUST carry an `aria-label` (reaffirms §8.2). A decorative icon paired with a visible text label SHOULD be `aria-hidden`.

### 9.5 Glyph migration (resolved 2026-06-19)

All real-app glyph-as-icon usages have been migrated to lucide. The 8 sites formerly tracked here — a `▶` play label (`VoiceCatalogCard`), `›` breadcrumb separators ×3 (`TopBar`), `▲`/`▼` disclosure carets (`EditTab`, `AnalysisStrip`), an `Export ▾` caret (`StudioHeaderActions`), and `✓` markers (`QueueNotice`, `PhaseStepper`, `ChapterTextPanel`) — now render the mapped lucide components per §9.2 (`Play`, `ChevronRight`, `ChevronUp`/`ChevronDown`, `ChevronDown`, `Check`). The redundant `⚠` text decorations on `EditTab`/`AnalysisStrip` were dropped in favor of the existing lucide `AlertTriangle`. Stale glyph references in nearby code comments were cleaned too, so the app is glyph-clean by grep.

New code MUST NOT introduce glyph-as-icon usage. A `grep`/CI gate on the banned glyph set (§9.1) is a reasonable **target** to lock this in.

### 9.6 Attribution encoding — color is identity (binding)

In dialogue surfaces (the Studio chapter editor, the Book/Screenplay/Stage views — see [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md) §3.2), three distinct facts about a line — *who* speaks it, *how* it is performed, and whether its voice *collides* with another character — are encoded on three **separate** channels. Each channel carries exactly one meaning; none is overloaded.

- **Speaker color = identity, and only identity.** A character's color (the dot in the cast palette, the sentence underline in Book view, the speaker-colored bar at the leading edge of a speech block in Screenplay/Stage) encodes **which character** speaks — nothing else. Exactly **one color per character**. Color MUST NOT encode the assigned voice, the performance variation, or any state. (A character keeps one color even across Whisper/Urgent variations; two characters never share a color.)
- **Performance variation = a text label, never color.** Natural / Whisper / Urgent (and any custom per-voice label such as "Commanding") render as a small **text** label beneath the speaker name, using the voice's own variation label. Variation MUST NOT be encoded by color, opacity, or a second swatch — that would multiply one character into many colors.
- **Voice collision = an `AlertTriangle` ⚠ flag, never re-coloring.** When two characters are cast to the same voice, surface it as a `⚠` flag on each affected cast row (with `aria-label` naming the other character) and a collision count on the tier header — so the conflict is discoverable even when the tier is collapsed. It MUST NOT be surfaced by re-coloring rows to match the shared voice: that breaks one-color-per-character and overloads the identity channel.

**Why (binding rationale):** overloading color is how attribution surfaces turn to mud — a chapter with 15 characters, each with 2–3 variations, becomes unreadable the moment color tries to carry more than identity. Keeping one meaning per channel also satisfies WCAG 1.4.1 (information never by color alone): variation is text, collision is an icon, and identity-color is backed by the speaker name. This mirrors the `StatusOrb` philosophy in §6 (status is icon + color, never a bare color) and the §9.3 rule that character/voice markers are a colored fill. Rejected alternative — coloring the bar by *voice* to reveal collisions — and its rationale are recorded in [ADR-0015](../decisions/ADR-0015-attribution-color-is-identity.md).

---

## 10. Brand Identity

> Brand assets and naming. The visual brand is carried by the `BrandLogo` primitive (§6) and the two brand-blue/amber accent families, not by ad-hoc imagery.

- **Product name:** **Audiobook Studio** (per `frontend/index.html` `<title>` and OpenGraph). The short form is **Studio**. The repository directory name `audiobook-factory` is an internal name and is **never** user-facing — do not surface it in UI copy (see [voice-tone.md](voice-tone.md) §9).
- **Wordmark:** rendered by `BrandLogo` (`components/layout/BrandLogo.tsx`) — the wordmark uses **Space Grotesk** (self-hosted, §4.1) at bespoke `--as-title-fs`/`--as-sub-fs` clamp sizes that sit outside the `--type-*` scale by design. Always use `BrandLogo`; never re-typeset the wordmark by hand.
- **Brand colors:** brand-blue `--as-blue` (`#2b6eff`) is the stable brand-blue identity; NOTE that `--accent` diverged to `#1e4fd8` in the Quiet Studio re-skin, so `--as-blue` is intentionally **no longer equal** to `--accent`. Brand-amber is `--as-amber` (`#f97316`). The amber has light+dark tint tokens (`--as-amber-tint-bg`/`-border`); `--as-blue`, `--as-amber`, and `--as-info-tint` currently have **no dark override** (they inherit their light values) — a known parity gap to revisit if they read low-contrast on dark surfaces.
- **Logo / favicon:** `frontend/public/logo.png` (raster brand mark) and `frontend/public/favicon.ico`. *(Two packaging nits to fix as follow-ups: `index.html` declares the favicon `type="image/svg+xml"` but points at an `.ico`; and the OpenGraph `og:image` points at `/docs/assets/banner.png`, which is not served from the built SPA (`frontend/dist`) and will 404. Neither affects in-app rendering.)*
- Brand imagery beyond the logo (AI-generated voice avatars, plugin engine logos) is purposeful raster artwork and is exempt from the lucide icon rule (§9.3).

---

## 11. Cross-References

- Rendered visual style guide (open in a browser, no build needed): [`../style-guide/current.html`](../style-guide/current.html) — a rendered snapshot of this spec's tokens + components, with a light/dark toggle and the computed contrast table; see [`../style-guide/README.md`](../style-guide/README.md). This spec stays canonical; the HTML is a view that can go stale.
- Voice attribute vocabulary / taxonomy: [voice-bundles.md](voice-bundles.md) §8 and `design-docs/specs/voice-taxonomy.json`
- `PredictiveProgressBar` and progress/ETA presentation: [progress-presentation.md](progress-presentation.md)
- App shell, nav rail, mobile drawer, top bar, book pipeline routing: [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md)
- Repository layout and frontend file-placement rules: [code-organization.md](code-organization.md)
- Live-event / reconnecting state source: [live-events.md](live-events.md)
- Informal interaction & UX guidance formalized here: `.agent/rules/frontend-interactions.md`, `.agent/rules/frontend-ux.md`
- Redesign rollout (target tracking for type-scale tokens, pill tints, responsive minimums): `design-docs/plans/reference/site_redesign_rollout/`, `design-docs/plans/reference/site_experience_north_star.md`
