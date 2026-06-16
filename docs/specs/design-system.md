# Design System

```
spec_version: 1.2.0
status: active
created: 2026-06-13
updated: 2026-06-16
sources:
  - frontend/src/theme/tokens.css
  - frontend/src/demo/stages/siteMockup/
  - frontend/src/theme/base.css
  - frontend/src/theme/components.css
  - frontend/src/theme/utilities.css
  - frontend/src/utils/theme.ts
  - frontend/src/main.tsx
  - frontend/src/hooks/useFocusTrap.ts
  - frontend/src/components/ui/ActionMenu.tsx
  - frontend/src/components/ui/StatusOrb.tsx
  - frontend/src/components/ui/GhostButton.tsx
  - frontend/src/components/forms/InlineEdit.tsx
  - frontend/src/components/overlays/ConfirmModal.tsx
  - frontend/src/app/layout/NavRail.tsx
  - frontend/src/pages/Settings/components/GeneralSettingsPanel.tsx
  - .agent/rules/frontend-interactions.md
  - .agent/rules/frontend-ux.md
  - plans/site_experience_north_star.md
  - plans/site_redesign_rollout/
```

> **TL;DR:** Every surface is themed through CSS variables in `tokens.css`, works in both light and dark, and is built from a small set of canonical shared primitives. Components consume tokens, never hardcoded colors; theming is `system | light | dark` driven by a `data-theme` attribute with a no-flash bootstrap; and chapter status is always rendered with `StatusOrb`, never a plain dot.

## Changelog

| Version | Date       | Change |
|---------|------------|--------|
| 1.0.0   | 2026-06-13 | Initial canonical spec for the frontend design system |
| 1.1.0   | 2026-06-16 | Added §9 Iconography (binding): `lucide-react` is the single icon system; canonical control→icon mapping; deliberate non-icon exceptions (status dots, raster artwork, "from→to" notation). North-Star mock standardized off Unicode glyphs onto lucide. Cross-References renumbered to §10. |
| 1.2.0   | 2026-06-16 | Reconciled §2/§4/§5 to the current `tokens.css` (some drift predated this session). Radius bumped (`--radius-card` 14px, `--radius-panel` 18px); registry now documents the present Material (`--blur-glass*`, `--hairline`), Motion (`--ease-*`/`--dur-*`), `--focus-ring`, accent gradient/glow, and 8pt `--space-*` families. §4 type scale corrected to **tokenized (current)** and extended with `--type-display/large-title/reading` + `--leading-*`/`--tracking-*`. §5 voice-pill tints corrected to **current** (`--pill-*` exist in `tokens.css`); real-Voices-page adoption remains target. |

---

## 1. Purpose & Scope

This spec is the authoritative reference for the frontend design system: the design-token registry, the theming contract, the type scale, the voice-attribute pill presentation, the shared component primitives, the responsive model, and the accessibility baseline.

It governs how UI looks and behaves consistently across pages — colors, surfaces, spacing, radius, typography, focus, keyboard access, and the canonical building blocks every screen reuses. It does **not** own page layout/routing (see `site-shell-and-book-pipeline.md`), progress-bar internals (see `progress-presentation.md`), or the voice-attribute *vocabulary* (see `voice-bundles.md` §8).

Specs and code are jointly authoritative. If this spec and the implementation disagree, resolve the drift explicitly by changing one or the other in the same PR.

Throughout this spec, **current** marks behavior that ships in the running app today; **target** marks behavior that is approved and mocked but not yet wired into the real pages (implementation tracked in `plans/site_redesign_rollout/`).

---

## 2. Design Tokens

### 2.1 Token registry

All design tokens are CSS custom properties declared in `frontend/src/theme/tokens.css`. The light/default values live on `:root`; the dark overrides live on `[data-theme="dark"]`. This file is the single registry — tokens MUST NOT be redefined per-component or per-page.

Token categories (current):

| Category | Example tokens |
|----------|----------------|
| Background / surface | `--bg`, `--background`, `--surface`, `--surface-alt`, `--surface-light`, `--surface-white`, `--surface-pressed`, `--surface-code`, `--surface-dim` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text`, `--text-on-accent`, `--text-code-muted`, `--text-code-info` |
| Border | `--border`, `--border-muted`, `--glass-border` |
| Accent | `--accent`, `--accent-hover`, `--accent-active`, `--accent-secondary`, `--accent-glow`, `--accent-tint`, `--accent-tint-bg`, `--accent-tint-border`, `--accent-focus-ring`, `--accent-rgb` |
| State (success / warning / error) | `--success`, `--success-strong`, `--success-text`, `--success-tint-bg`, `--warning`, `--warning-text`, `--warning-tint-bg`, `--warning-tint-border`, `--error`, `--error-text`, `--error-text-strong`, `--error-tint-bg`, `--error-tint-border`, `--error-glow` |
| Glass / overlay | `--glass`, `--glass-hover`, `--glass-subtle`, `--glass-surface-light`, `--surface-glass-white`, `--surface-glass-half`, `--overlay-backdrop` |
| Radius | `--radius-button` (10px), `--radius-card` (14px), `--radius-panel` (18px), `--radius-round` (9999px) |
| Shadow / elevation | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl` (soft layered ambient — a wide diffuse halo + a tight contact shadow) |
| Material (Liquid Glass) | `--blur-glass`, `--blur-glass-strong` (for `backdrop-filter` on chrome/overlays), `--hairline` (low-alpha inner divider, softer than `--border`) |
| Motion | `--ease-standard`, `--ease-emphasized`, `--ease-spring`, `--dur-fast`, `--dur-med`, `--dur-slow` |
| Focus | `--focus-ring` (3px keyboard ring, built on `--accent-focus-ring`) |
| Accent treatments | `--accent-gradient`, `--accent-gradient-hover`, `--accent-glow-strong`, `--hero-glow` (primary-action fills + hero glow) |
| Spacing (8pt scale) | `--space-1` (4px) … `--space-8` (48px) |
| Typography | `--type-*` sizes + `--type-weight-*`, `--leading-*`, `--tracking-*` (see §4) |
| Voice-pill tints | `--pill-{class,gender,age,extended,tag}-{bg,border,text}` (see §5) |
| Layout metrics | `--header-height` (56px), `--rail-width` (190px), `--rail-width-collapsed` (56px) |
| Brand | `--as-ink`, `--as-muted`, `--as-blue`, `--as-amber`, `--as-info-tint` |
| Progress visual states | `--progress-track`, `--progress-finalizing-fill`, `--progress-preparing-fill`, `--progress-done-fill`, `--progress-failed-fill`, `--progress-badge-*` (see `progress-presentation.md`) |

An 8pt **spacing scale** (`--space-1` = 4px, `--space-2` = 8px, … `--space-8` = 48px) is now defined in `tokens.css` and is the preferred way to express gaps and padding. Adoption is **in progress**: the North-Star mock (`frontend/src/demo/stages/siteMockup/`) uses `--space-*` throughout; some legacy real-app pages still apply literal `rem`/`px` values and should migrate onto the scale when next touched.

### 2.2 Token usage rule (binding)

Components MUST style themselves through tokens, not hardcoded color/elevation values. This is the existing rule in `.agent/rules/frontend-interactions.md` ("Prefer theme variables over hardcoded colors") promoted to a binding design-system constraint:

- **MUST** reference `var(--token)` for any color, surface, border, shadow, radius, or overlay value.
- **MUST NOT** introduce raw hex/`rgb()`/`rgba()` literals in component code for themed surfaces. Where a literal is unavoidable (e.g. `color: '#fff'` on a known-colored fill such as the error orb glyph), it MUST be a value that is correct in *both* themes by construction.
- A handful of exempt literals exist (e.g. white text on a saturated accent fill); new code SHOULD prefer `--text-on-accent` over a raw `white`/`#fff`.

There is currently **no automated lint/CI gate** enforcing token usage; enforcement is by review against this rule. A stylelint/CI check is a reasonable **target** but is not asserted to ship today.

### 2.3 Light + dark parity (binding)

Every surface MUST work in **both** light and dark. Because dark is implemented purely as token overrides on `[data-theme="dark"]`, a component that uses only tokens gets dark mode for free. A component that hardcodes a value will break one theme — which is why §2.2 is binding.

When a new visual state needs a color, add the token (with both `:root` and `[data-theme="dark"]` values) to `tokens.css` rather than inlining a literal.

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

The approved 6-step semantic type scale (owner decision U3, approved 2026-06-12 in `plans/site_experience_north_star.md` §12):

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

Adoption is **in progress**: the North-Star mock uses these tokens throughout; the global rules in `base.css` (body `font-family`, `line-height`; heading weight/letter-spacing) still cover legacy pages, and literal sizes on older real-app pages should migrate onto the tokens when next touched.

---

## 5. Voice Attribute Pill Taxonomy (Presentation)

This section governs the **presentation** of voice-attribute pills only. The attribute *values/vocabulary* (class, gender, age, language, accent, style, etc.) are owned by `voice-bundles.md` §8 and `docs/specs/voice-taxonomy.json` — do not duplicate them here.

**Status: tint tokens current; real-page adoption target.** The `--pill-*` tint tokens (class / gender / age / extended / tag, each with `-bg` / `-border` / `-text`, and light + dark values) are defined in `tokens.css` and consumed by the `VoiceAttrPill` primitive in the site mockup demo stage (`frontend/src/demo/stages/siteMockup`). The owner-approved styling (`plans/site_experience_north_star.md` §12) is **not yet** wired into the real Voices page; that adoption is tracked in `plans/site_redesign_rollout/`.

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
| `StatusOrb` | `components/ui/StatusOrb.tsx` | Chapter status indicator: a colored orb with a circumferential render-progress ring (partial arc for in-progress segments, full ring ornament for cached M4A), plus spinner / warning / error / done states derived from chapter + active-job data. | **Binding:** preserved everywhere chapter status appears (rail chapter list, Manuscript/chapter tables, Activity). Plain colored dots are NEVER an acceptable substitute (owner directive, north star §12 round 5c). |
| `ActionMenu` | `components/ui/ActionMenu.tsx` | Canonical kebab / overflow menu. Portal-rendered, viewport-flip-aware, closes on outside-click and Escape, supports dividers, destructive items, and disabled items. | The standard overflow / "⋯" affordance. MUST be used for row/card action menus rather than bespoke dropdowns. |
| `GhostButton` | `components/ui/GhostButton.tsx` | Canonical low-emphasis icon/icon+label button with hover/active states and built-in `aria-label` fallback. | The default for secondary/tertiary actions and toolbar buttons. |
| `InlineEdit` | `components/forms/InlineEdit.tsx` | Canonical click-to-edit text field: single click to edit, save on blur/Enter, cancel on Escape, no pencil affordance, auto-select on focus, optional multiline. | The standard pattern for in-place rename/edit of titles and labels. |
| `ConfirmModal` | `components/overlays/ConfirmModal.tsx` | Canonical confirmation/alert dialog. `role="dialog"`, `aria-modal`, `aria-labelledby`, backdrop scrim, Escape-to-cancel, focus-trapped via `useFocusTrap`, destructive vs. neutral confirm styling. | The standard destructive-confirm / alert surface (per north star U1, modals remain for project delete and bulk audio reset). |

`PredictiveProgressBar` is also a shared primitive but is fully specified in `progress-presentation.md` — see that spec; do not re-document its contract here.

---

## 7. Responsive

### 7.1 Breakpoints (current)

The codebase uses a small set of `max-width` breakpoints across `theme/components.css` and `theme/utilities.css`. The load-bearing one is the rail → drawer switch:

| Breakpoint | Behavior |
|------------|----------|
| `max-width: 768px` | **Rail → drawer.** `.nav-rail { display: none }` (`components.css`); the global navigation is served by the mobile drawer instead (cross-ref `site-shell-and-book-pipeline.md` §2.5). Form/layout utilities also stack at this width (`utilities.css`). |
| `max-width: 1450px` | Chapter header collapses to a 2-column grid. |
| `max-width: 1100px` / `1000px` / `800px` / `640px` | Page-level grid/flex columns collapse to single-column (publish stage, activity page, assembly picker, etc.). |

### 7.2 Graceful degradation (binding)

Layouts MUST degrade gracefully on smaller screens (`.agent/rules/frontend-interactions.md`): sticky controls and two-pane layouts must remain usable, and global navigation must remain reachable via the drawer below 768px.

The **390px ChapterEditor tablet minimum** is a documented design **target** (the editor should remain operable down to ~390px width); it is **not** currently expressed as a hardcoded breakpoint in the theme CSS. Tracking lives in `plans/site_redesign_rollout/`.

---

## 8. Accessibility Baseline

The accessibility target is **WCAG 2.2 AA**. The following are binding.

### 8.1 Focus management (current)

- **Focus trap in modals/dialogs:** `useFocusTrap(ref, isOpen)` (`frontend/src/hooks/useFocusTrap.ts`) traps Tab / Shift-Tab inside the container, focuses the first focusable element on open, and restores focus to the trigger element on close. It manages focus only — it does NOT call `onClose`; the caller owns Escape handling. `ConfirmModal` uses it; every new modal/dialog MUST use it.
- **`:focus-visible` rings (current):** `base.css` suppresses the outline for pointer interaction and applies a keyboard-only focus ring — `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible` for buttons, inputs, selects, textareas, anchors, and `[tabindex]`. New interactive elements MUST keep a visible keyboard focus ring (via `:focus-visible`, not a global `outline: none`).

### 8.2 Semantics & ARIA (current/binding)

- Prefer semantic HTML before adding ARIA; when ARIA is needed, keep labels and live regions accurate (`.agent/rules/frontend-interactions.md`).
- Interactive chrome carries accessible names: the rail, player bar, and drawer expose `aria-label`/roles; `ConfirmModal` sets `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; `ActionMenu` trigger has `aria-label="More actions"`; `GhostButton` derives an `aria-label` from `ariaLabel || title || label`.
- Icon-only controls MUST have an `aria-label`.

### 8.3 Contrast (binding)

Color contrast is delivered through the token system: text and surface tokens are tuned per theme (§2.3). New colors MUST be added as tokens with contrast that meets AA in both light and dark, rather than inlined literals that satisfy only one theme.

### 8.4 The five UI states (binding)

From `.agent/rules/frontend-ux.md`: every meaningful screen change MUST account for these states, and each MUST be user-meaningful and testable by role/label/visible behavior (not a bare spinner):

1. **loading**
2. **empty**
3. **error**
4. **reconnecting**
5. **recovered** (and the related interrupted/stale/queued/rendering/rendered/failed markers)

Prefer interfaces that explain *why* something is waiting or stale over generic spinners, and prefer inline recovery actions over forcing the user out of the editor.

---

## 9. Iconography

### 9.1 Canonical icon library (binding)

`lucide-react` (pinned in `frontend/package.json`) is the **single** icon system for the app. Every functional or decorative *icon* MUST be rendered as a lucide component. Unicode media/arrow/caret glyphs (`▶ ⏸ ⏮ ⏭ ⏪ ⏩ ■ ▾ ▲ ▼ › ‹ ← → ✓ ✗`) and emoji (`🌙 ☀️`) MUST NOT be used to render an icon: glyphs do not inherit `currentColor`, stroke weight, or optical sizing, and they drift visually between platforms and fonts. lucide gives one coherent, `currentColor`-driven, stroke-consistent set that themes for free.

This rule is binding for the real app and the North-Star mock (`frontend/src/demo/stages/siteMockup/`) alike. The live `PlayerBar` already complied; the mock was standardized off glyphs onto lucide on 2026-06-16. The intent of recording it here is to prevent regressions back to glyphs.

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

---

## 10. Cross-References

- Voice attribute vocabulary / taxonomy: [voice-bundles.md](voice-bundles.md) §8 and `docs/specs/voice-taxonomy.json`
- `PredictiveProgressBar` and progress/ETA presentation: [progress-presentation.md](progress-presentation.md)
- App shell, nav rail, mobile drawer, top bar, book pipeline routing: [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md)
- Repository layout and frontend file-placement rules: [code-organization.md](code-organization.md)
- Live-event / reconnecting state source: [live-events.md](live-events.md)
- Informal interaction & UX guidance formalized here: `.agent/rules/frontend-interactions.md`, `.agent/rules/frontend-ux.md`
- Redesign rollout (target tracking for type-scale tokens, pill tints, responsive minimums): `plans/site_redesign_rollout/`, `plans/site_experience_north_star.md`
