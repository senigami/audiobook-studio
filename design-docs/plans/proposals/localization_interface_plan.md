# Proposal: Multilingual Interface Support

> **Status: DRAFT for review.** This is a planning artifact, not implementation.  
> **Scope:** interface chrome, page labels, helper copy, errors, empty states, button text, aria labels, and locale-aware formatting.  
> **Non-scope:** manuscript translation, voice-content translation, engine behavior, or automatic translation of user-generated text.

## 1. Why this belongs in Phase 12 planning

Phase 12 is the repo's last cross-cutting polish pass before the release docs and distribution work. Interface localization fits there because it cuts across the shell, book pipeline, voices, activity, settings, dialogs, and validation copy, but it does not belong in the site-redesign rollout itself. The redesign rollout is about route ownership and shell layout; localization is a separate product capability that should be planned once the layout is stable.

This proposal therefore lives beside Phase 12 as a planning artifact and should be treated as the source for an eventual implementation phase. The canonical spec now lives at `design-docs/specs/interface-localization.md`, and the working inventory lives in `design-docs/plans/proposals/localization_interface_examples/`.

## 2. Core decision

The interface should use **file-backed locale catalogs**, not a database as the source of truth.

Why:

- Translation review works better in git than in a SQL table.
- Contributors can open normal PRs against visible text files.
- Missing keys, duplicate keys, and extraction drift are easy to diff.
- The app can ship offline because the locale packs are local assets.

When a database may still help:

- Runtime user-specific overrides.
- A future in-app translation editor.
- Community submission moderation after the translation file has already been accepted.

Those are secondary systems. They should sync back to files, not replace them.

## 3. Identifier model

The user-facing string must never be the identifier.

Every visible string gets a stable semantic key such as:

- `shell.nav.library`
- `book.stage.manuscript`
- `book.manuscript.analysis.words`
- `book.chapter.status.rendered`
- `common.actions.newBook`
- `settings.language.title`

That key is what the code looks up. The English string is only the source locale value.

Rules:

- Keys are stable and human-readable.
- Keys are grouped by feature area, not by rendered sentence order.
- Keys may include ICU-style placeholders and plural forms.
- Icon-only controls still need keys for tooltips and `aria-label`.
- Do not derive keys from rendered text or DOM extraction alone.

## 4. Proposed catalog layout

The catalog should be split by locale directory and namespace file. This keeps one contributor's
work mostly inside one locale folder while preventing a single huge translation file.

```text
frontend/src/i18n/
  manifest.json
  index.ts
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
    es-ES/
      common.json
      shell.json
      book.common.json
      book.manuscript.json
      book.casting.json
      book.studio.json
      book.review.json
      book.publish.json
      ...
    fr-FR/
      ...
```

Catalog rules:

- Locale folders use full BCP-47 tags (`en-US`, `es-ES`, `fr-FR`), not vague language-only
  names, unless a deliberate neutral language pack is created.
- Each namespace JSON file contains exactly one locale's values for that namespace.
- Every selectable release locale must have the same namespace files and required keys as `en-US`.
  Partial locales may exist only as review/preview artifacts; they must not appear as normal
  user-selectable app languages.
- The app merges namespaces at runtime as `{namespace.key -> localized value}`; contributors never
  edit generated bundles.
- Generated helper files may be added later, but they must be derived from the source catalogs and
  should not be the translation source of truth.

`manifest.json` should describe:

- locale code
- display name
- native name
- direction
- fallback chain
- translation status
- maintainers
- completion percentage
- supported namespaces

Example manifest shape:

```json
{
  "sourceLocale": "en-US",
  "fallbackLocale": "en-US",
  "locales": [
    {
      "locale": "es-ES",
      "displayName": "Spanish (Spain)",
      "nativeName": "Español (España)",
      "direction": "ltr",
      "fallbacks": ["en-US"],
      "status": "review",
      "completion": 1,
      "maintainers": ["@translator-handle"]
    }
  ],
  "namespaces": ["common", "shell", "library", "book.common"]
}
```

This proposal intentionally rejects the alternative "one file with every language side by side"
layout. Side-by-side comparison tables are useful in docs, but they become painful in git reviews:
unrelated locales conflict, contributors must edit files outside their language, and automated
missing-key checks become harder to scope.

## 5. Runtime contract

The runtime should support:

- locale selection from a single global preference
- fallback to the source locale for missing keys
- ICU pluralization and parameter interpolation
- locale-aware number, date, time, duration, and unit formatting
- per-page text expansion without layout collapse

The implementation library can be chosen later. The plan only requires the catalog contract to be library-agnostic and ICU-friendly.

Formatting rules must respect locale conventions rather than reusing English punctuation:

- numbers: thousand separators, decimal marks, and digit grouping are locale-specific
- dates: year/month/day order and month names follow locale rules
- times: 12h vs 24h clock, separator style, and zero padding are locale-specific
- durations: short UI timers should be formatted consistently with the locale, not hand-concatenated
- units and plural forms: use message rules, not `1 + " items"` style concatenation

### 5.1 First-run language picker

If the user has never chosen a language before, the app should present an initial modal or
full-screen popup selector during first-run onboarding.

Purpose:

- establish a readable default before the user sees the shell
- avoid forcing users into English when the app can infer a better fit
- separate first-run choice from later preference editing

Rules:

- first-run picker appears only when no locale preference exists
- after a locale is chosen, the picker does not reappear unless the user clears preferences
- the picker must show the language in its native name and script
- later changes live in `Settings > General`
- the onboarding picker should not be the only way to change language

Recommended copy:

- title: `Choose your language`
- body: `This sets the app language for buttons, pages, and helper text. You can change it later in Settings.`
- primary action: `Continue`
- secondary action: `Keep English`

## 6. What gets translated first

Start with the highest-visibility interface surfaces:

1. Shell navigation and top-bar labels.
2. Book stage labels and major page headers.
3. Primary action buttons.
4. Empty states and helper copy.
5. Status labels and workflow pills.
6. Dialogs, errors, and validation text.
7. Tooltips and aria labels.

Do not start with deep content text if the shell and page chrome are still hardcoded.

## 7. Frontend sketch

This sketch shows the proposed experience at a high level: the shell stays global, and the locale control lives in settings as a global preference. The labels below are the strings that would come from the locale catalog.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Audiobook Studio   Library                                 Connected       │
│                                                                              │
├──────────────┬───────────────────────────────────────────────────────────────┤
│ CREATE       │ Library                                                       │
│  Library     │                                                               │
│  Voices      │   [ New Book ]   [ View Docs ]                                 │
│ MONITOR      │                                                               │
│  Activity    │   Recent work, cards, statuses, and page content all inherit   │
│ PLATFORM     │   the active locale from the shell.                            │
│  Engines     │                                                               │
│  Integrations│                                                               │
│ MANAGE       │                                                               │
│  Settings    │                                                               │
│              │                                                               │
└──────────────┴───────────────────────────────────────────────────────────────┘

Settings > General
┌──────────────────────────────────────────────────────────────────────────────┐
│ Interface language                                                          │
│ [ English (US) ▾ ]                                                          │
│ Changes shell labels, page headings, buttons, helper text, and errors.     │
│                                                                              │
│ Supported locales                                                           │
│  - English (source)                                                         │
│  - Spanish (complete, community-reviewed)                                   │
│  - French (review-only until complete)                                      │
│                                                                              │
│ [ Preview locale ]   [ Manage translation files ]                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

The important layout point: the shell does not change per language. Only strings do.
That keeps the app readable while still allowing expansion in the rail, top bar, tabs,
buttons, and tables.

## 8. Example mappings

These are representative mappings, not an exhaustive list.

| Key | English source | Spanish example | French example | Notes |
| --- | --- | --- | --- | --- |
| `shell.nav.library` | Library | Biblioteca | Bibliothèque | main rail item |
| `shell.nav.voices` | Voices | Voces | Voix | main rail item |
| `shell.nav.activity` | Activity | Actividad | Activité | main rail item |
| `shell.nav.engines` | Engines | Motores | Moteurs | platform item |
| `shell.nav.integrations` | Integrations | Integraciones | Intégrations | platform item |
| `shell.nav.settings` | Settings | Ajustes | Paramètres | manage item |
| `book.stage.manuscript` | Manuscript | Manuscrito | Manuscrit | stage tab |
| `book.stage.casting` | Casting | Reparto | Distribution | stage tab |
| `book.stage.studio` | Studio | Estudio | Studio | stage tab |
| `book.stage.review` | Review | Revisión | Relecture | stage tab |
| `book.stage.publish` | Publish | Publicar | Publier | stage tab |
| `book.manuscript.table.chapters` | Chapters | Capítulos | Chapitres | chapter list header |
| `book.manuscript.table.words` | Words | Palabras | Mots | chapter list header |
| `book.manuscript.table.stage` | Stage | Estado | État | chapter list header |
| `book.manuscript.analysis.chars` | Chars | Caracteres | Caractères | analysis strip |
| `book.manuscript.analysis.sentences` | Sentences | Oraciones | Phrases | analysis strip |
| `book.manuscript.analysis.segments` | Segments | Segmentos | Segments | analysis strip |
| `book.manuscript.analysis.estimatedGeneration` | Est. Gen. | Gen. est. | Gén. estimée | analysis strip |
| `book.chapter.status.draft` | Draft | Borrador | Brouillon | lifecycle pill |
| `book.chapter.status.ready` | Ready | Listo | Prêt | lifecycle pill |
| `book.chapter.status.cast` | Cast | Reparto | Distribué | lifecycle pill |
| `book.chapter.status.rendered` | Rendered | Renderizado | Rendu | lifecycle pill |
| `book.casting.narratorDefault` | Narrator (default) | Narrador (predeterminado) | Narrateur (par défaut) | pinned row |
| `common.actions.newBook` | New Book | Nuevo libro | Nouveau livre | primary action; plus icon remains UI chrome |
| `common.actions.newChapter` | New chapter | Nuevo capítulo | Nouveau chapitre | primary action; plus icon remains UI chrome |
| `common.actions.editText` | Edit text | Editar texto | Modifier le texte | button |
| `common.actions.chooseFile` | Choose file | Elegir archivo | Choisir un fichier | file input |
| `common.actions.cancel` | Cancel | Cancelar | Annuler | modal button |
| `shell.connection.connected` | Connected | Conectado | Connecté | shell status chip |
| `settings.language.title` | Interface language | Idioma de la interfaz | Langue de l'interface | settings label |
| `settings.language.help` | Changes the app chrome and page labels. | Cambia la interfaz y las etiquetas de página. | Modifie l'interface et les libellés des pages. | helper copy |

## 9. Plural and parameter examples

Use ICU-style message rules for anything count-based or parameterized:

```json
{
  "book.manuscript.analysis.chapterCount": "{count, plural, one {# chapter} other {# chapters}}",
  "queue.jobs.pending": "{count, plural, one {# job pending} other {# jobs pending}}",
  "common.updatedAt": "Updated {time}",
  "book.currentChapter": "Chapter {chapterNumber}"
}
```

This avoids concatenation bugs and gives translators a single complete sentence to work with.

## 10. Contribution model

If the goal is community contribution, file-backed locale packs are the right base:

- Contributors submit PRs against locale files.
- Maintainers review visible diffs instead of database rows.
- A manifest shows locale completion and ownership.
- CI rejects malformed ICU strings and missing required keys.
- The app can later import/export locale packs if a non-git workflow is needed.

Recommended policy:

- `en-US` is the source locale and should be complete first.
- AI-generated first-pass translations are allowed and expected; they should fill the initial
  catalog so reviewers are correcting a complete draft rather than translating from scratch.
- A locale may be marked `draft`, `review`, or `release`.
- Only complete `release` locales are selectable in the normal app UI.
- Partial or incomplete locales stay hidden from everyday users and are available only in reviewer
  tooling or explicit preview flows.

### 10.1 AI-assisted extraction workflow

AI should be used across the full interface surface, not just one page, but as a drafting and
inventory tool rather than the final authority.

Recommended flow:

1. Extract every visible string from the site into a draft inventory.
2. Group strings by surface and decide whether they should stay whole or split into smaller
   reusable keys.
3. Generate source-locale catalogs from the approved key map.
4. Produce complete AI-seeded draft translations for community review.
5. Run formatter, missing-key validation, and human review before any pack is accepted.

This keeps the coverage broad while still preserving human control over grammar, layout risk,
and product terminology.

## 11. Validation plan

The implementation plan should include:

- key completeness checks
- no-unused-key checks
- ICU syntax validation
- fallback coverage checks
- long-string layout checks on the shell and book pipeline
- manual review in at least one expansion-heavy locale

High-risk screens for overflow:

- the top bar breadcrumb / identity line
- the rail, especially collapsed mode
- stage tabs
- chapter table headers
- analysis strip metrics
- modal buttons and toolbars

## 12. Open questions for approval

1. Do we want a future in-app translation editor, or should contribution stay PR-based?

## 13. References

- `design-docs/plans/phases/phase_12_polish_and_cleanup.md`
- `design-docs/plans/master_agnostic_tasks.md`
- `design-docs/specs/site-shell-and-book-pipeline.md`
- `design-docs/specs/design-system.md`
- `design-docs/plans/site_experience_north_star.md`
- `design-docs/plans/proposals/localization_interface_examples/`
- `design-docs/specs/interface-localization.md`
