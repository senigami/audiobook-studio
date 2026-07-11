# Interface Localization

```
spec_version: 1.0.4
status: active
updated: 2026-06-16
created: 2026-06-14
sources:
  - frontend/src/app/layout/AppShell.tsx
  - frontend/src/app/layout/NavRail.tsx
  - frontend/src/app/layout/TopBar.tsx
  - frontend/src/pages/ProjectLibrary/
  - frontend/src/pages/Book/
  - frontend/src/pages/Voices/
  - frontend/src/pages/Activity/
  - frontend/src/pages/Settings/
  - design-docs/plans/_archive/phases/phase_12_multilingual_interface_plan.md
  - design-docs/plans/_archive/phases/phase_12_multilingual_interface_examples/
  - design-docs/specs/site-shell-and-book-pipeline.md
  - design-docs/specs/design-system.md
```

> **TL;DR:** The app interface is localized through file-backed locale catalogs with stable
> semantic keys. Locale selection has two entry points: a first-run picker when no language
> preference exists, and `Settings > General` for later changes. Locale-aware formatting is
> required for numbers, dates, times, durations, plurals, and unit labels.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.4 | 2026-06-16 | Corrected `sources` path: `frontend/src/pages/Library/` → `frontend/src/pages/ProjectLibrary/` (`ProjectLibraryPage.tsx`). |
| 1.0.3 | 2026-06-14 | Set locale release policy: AI may seed complete draft translations, but only complete reviewed locales are user-selectable; partial locales are preview/review artifacts only. |
| 1.0.2 | 2026-06-14 | Clarified file structure: locale directories contain namespace files, BCP-47 folders are required, manifests carry locale records and fallback chains, and generated bundles are not the source of truth. |
| 1.0.1 | 2026-06-14 | Tightened locale catalog structure: `en-US` source locale, BCP-47 locale directories, stage-split book namespaces, single-owner shared labels, fallback chains, and no dynamic/user data in catalogs. |
| 1.0.0 | 2026-06-14 | Initial canonical spec for interface localization, locale catalogs, first-run picker, and locale-aware formatting |

## 1. Purpose

This spec is the binding reference for user-visible interface text in Audiobook Studio 2.0:

- navigation labels
- page headings
- actions and tooltips
- helper copy and empty states
- error text and validation text
- status labels and workflow pills
- locale-aware numbers, dates, times, durations, and plural forms

It does **not** govern manuscript content translation, voice-content translation, or engine
runtime behavior. Those are separate concerns.

Specs and code are jointly authoritative. If the implementation and this document diverge,
resolve the drift explicitly in the same change.

## 2. Language model

### 2.1 Source locale

The source locale is `en-US` and acts as the final fallback language for missing keys.
Locale directories MUST use BCP-47 tags such as `en-US`, `es-ES`, and `fr-FR`.

### 2.2 Preference ownership

The selected interface language is a user preference.

- If no preference exists, the app MUST show a first-run language picker before the shell is
  treated as settled.
- If a preference exists, the app MUST use it without re-prompting.
- After first run, the canonical place to change language is `Settings > General`.

### 2.3 First-run picker

The first-run picker MUST:

- appear only when the user has no saved locale preference
- present locale names in their native names/scripts
- explain that the selection changes the app shell, page labels, and helper text
- provide a path to continue without changing the language

The first-run picker is an onboarding step, not the only place the language can be changed.

## 3. Catalog contract

### 3.1 File-backed catalogs

Locale data MUST live in files, not in a database table.

Catalog file format:

- exactly one locale per locale directory
- exactly one namespace per JSON document
- keys are shared across locales
- values vary by locale
- comparison tables may appear in docs, but they are not the runtime format

Recommended layout:

```text
frontend/src/i18n/
  manifest.json
  schema/
    manifest.schema.json
    namespace.schema.json
  locales/
    en-US/
      common.json
      shell.json
      library.json
      book.common.json
      book.manuscript.json
      book.casting.json
      book.studio.json
      book.review.json
      book.publish.json
      voices.json
      activity.json
      engines.json
      integrations.json
      settings.json
      onboarding.json
      errors.json
```

Generated bundles, key indexes, and type helpers MAY exist later, but they MUST be derived from
the source catalogs. They are not the translation source of truth.

The locale manifest SHOULD include:

- locale code
- display name
- native name
- text direction
- fallback chain
- translation status
- completion percentage
- maintainers

The manifest MUST define fallback order. Regional locales SHOULD fall back through their
language family before `en-US` when that family exists, for example `fr-CA -> fr -> en-US`.

Release policy:

- AI-generated translations MAY seed the first complete draft of a locale.
- A normal user-selectable locale MUST be complete and reviewed.
- Partial locales MUST NOT appear in the normal language selector.
- Partial locales MAY exist only for reviewer tooling, preview flows, or contribution workflows.

### 3.2 Key rules

- Keys MUST be stable, semantic, and human-readable.
- Keys MUST be grouped by surface, not by render order.
- Keys SHOULD be reusable where the same text appears in multiple places.
- Icon-only controls MUST still have translation keys for tooltips and `aria-label`.
- The visible English string is the source value, not the identifier.
- Do not derive keys from DOM extraction alone; use the extracted text as inventory input, then
  assign keys intentionally.
- Locale catalogs MUST NOT contain user/project/demo fixture values such as book titles,
  author names, voice names, or chapter titles.
- Locale catalogs MUST NOT bake dynamic counts, durations, dates, or numbers into strings.
  Those values are formatted at runtime and inserted through ICU messages or formatter helpers.

Namespace ownership:

- `common` owns truly shared actions and generic labels.
- Page namespaces own page-specific wording.
- Book workspaces are split by stage: `book.common`, `book.manuscript`, `book.casting`,
  `book.studio`, `book.review`, and `book.publish`.
- A label MUST have one owner. Do not define the same label in both `common` and a page
  namespace unless the wording or meaning is intentionally different.

### 3.3 Split guidance

Strings SHOULD be split when they combine reusable or locale-sensitive parts.

Examples:

- `Good evening, Steven` → greeting + name
- `Runtime 1m 3s` → label + formatted duration
- `Status: Ready` → label + value
- `174 words` → count + pluralized noun

## 4. Formatting contract

Locale-aware formatting is mandatory for all user-facing UI text that contains values.

### 4.1 Numbers

Number formatting MUST respect locale conventions for:

- digit grouping
- decimal separator
- minus sign / prefix conventions

### 4.2 Dates and times

Date and time formatting MUST respect locale conventions for:

- ordering
- separator style
- zero padding
- 12h vs 24h clock

### 4.3 Durations and units

Durations and unit labels MUST be formatted as data, not concatenated English fragments.

Examples:

- `57s`
- `1m 03s`
- `1 h 03 min`

### 4.4 Pluralization

Plural-sensitive strings MUST use locale plural rules, not `count + " items"` concatenation.

## 5. UI surface contract

### 5.1 Shell and navigation

The shell MUST localize:

- brand-adjacent labels if they are not part of the brand name itself
- nav items
- connection state
- queue button labels
- theme toggle labels
- rail controls

### 5.2 Book pipeline

The book pipeline MUST localize:

- stage tabs
- top-bar identity labels
- manuscript table headers
- chapter lifecycle pills
- analysis strip labels
- primary book actions

### 5.3 Shared actions and dialogs

All shared actions, modals, errors, and tooltips MUST use locale keys and MUST support
expansion beyond the English source length.

## 6. Example inventory

The working inventory for the current site lives in:

- `design-docs/plans/_archive/phases/phase_12_multilingual_interface_examples/`

That folder is a review aid, not runtime code. It contains:

- surface-by-surface text maps
- current-site source JSON examples keyed by locale key
- formatting and numbering examples

## 7. Validation

The implementation plan for localization MUST include:

- missing-key checks
- unused-key checks
- ICU syntax validation
- fallback coverage checks
- long-string layout checks on the shell and book pipeline
- manual review in at least one expansion-heavy locale

## 8. References

- `design-docs/plans/_archive/phases/phase_12_multilingual_interface_plan.md`
- `design-docs/plans/_archive/phases/phase_12_multilingual_interface_examples/`
- `design-docs/specs/site-shell-and-book-pipeline.md`
- `design-docs/specs/design-system.md`
