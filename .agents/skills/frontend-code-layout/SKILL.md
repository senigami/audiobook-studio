---
name: frontend-code-layout
description: >-
  Use when writing, refactoring, or reviewing frontend application code
  (React/Vue/Svelte components, pages, dashboards, forms, design-system/shadcn/
  Tailwind UI) to keep three concerns separable — structure, styling, and
  behavior. Trigger when building or changing UI components/pages; making a UI
  easy to re-theme/reskin/rebrand without big code changes; setting up or
  centralizing design tokens / theming / dark mode; replacing hardcoded colors
  or spacing with tokens; or untangling a component — "data fetching and
  rendering are mixed", "organize data logic vs markup", "container vs
  presentational", "this component is too big/messy", "separation of concerns",
  "MVP/MVC/MVVM" — even if no pattern is named. Realizes the CSS Zen Garden
  ideal (swap the look without rewriting structure) the modern way: semantic
  tokens + Model/View/Presenter layering + readability hygiene. Do NOT trigger
  for: backend/data/infra/CI code (API routes, DB/Drizzle schema, server
  architecture, or reorganizing a non-frontend repo such as a Python service);
  build-tool/bundler config or build performance (Tailwind purge/safelist,
  postcss/vite speed); pure CSS visual-effect or animation-technique questions;
  or accessibility/WCAG audits.
---

# Frontend Code Layout

The aim: code where **what it is** (structure), **how it looks** (skin), and
**what it does** (behavior) live in different places — so you can re-theme,
re-test, or restyle one without rewriting the others. This is the CSS Zen
Garden promise ("change the appearance, never touch the markup"), brought into
a component + utility-class world where the swap point is a **design token**,
not a separate `.css` file.

Three pillars. Apply all three; they reinforce each other.

## 1. Separate structure from skin — via tokens, not stylesheets

CSS Zen Garden worked because the HTML carried *meaning*, never *appearance*, so
the whole look could be swapped by replacing the stylesheet. With utility-first
CSS (Tailwind) and component libraries (shadcn), styling deliberately lives in
the markup as classes — so you do **not** chase the literal "all CSS in an
external file" rule. That fights the stack and loses. Instead the seam moves:

> **Components express *intent* through semantic tokens. A theme layer maps
> each intent to a concrete value. Reskinning = changing the mapping, never the
> components.**

Rules that keep that seam intact:

- **Never hardcode raw visual values in markup.** No `#2563eb`, no
  `text-[#1a1a1a]`, no `bg-blue-600`, no `rounded-[7px]`. Reach for a semantic
  token: `bg-primary`, `text-foreground`, `text-muted-foreground`,
  `border-border`, `bg-card`, `text-destructive`, `rounded-md`. A hardcoded
  value is a reskin you'll have to hunt down by hand later.
- **Name tokens by role, not by value.** `primary`, `destructive`, `muted`,
  `card`, `accent` survive a rebrand; `blue`, `red-500`, `gray-light` do not —
  when the brand goes from blue to green you'd be renaming "blue" everywhere,
  which is exactly the pain the token layer exists to prevent.
- **Define the token→value mapping in exactly one place** — CSS custom
  properties in a `:root`/`@theme` block (and a `.dark` / brand block). Light,
  dark, and per-brand themes are just different value maps over the *same*
  token names. That single file is your "Zen Garden stylesheet."
- **Layout/structure utilities stay in the markup.** `flex`, `grid`, `gap-4`,
  `p-6`, `items-center` describe *structure*, not *skin* — they belong with the
  element. The skinnable surface is color, type scale, radius, shadow, and the
  spacing *scale's values* — all token-driven. Don't try to tokenize away every
  flex container; that's structure pretending to be theme.
- **Extend the existing token vocabulary; never start a parallel one.** If a
  design system already defines `muted-foreground`, use it — don't invent
  `text-secondary` beside it. Two vocabularies for one concept is how themes
  drift out of sync.
- **Color is never the only signal** (accessibility): pair it with text, an
  icon, or a shape, so a reskin or a color-blind user can't lose the meaning.

Litmus test: *"To rebrand this app, how many component files must change?"* The
answer should be **zero** — only the theme/token file. If you'd have to edit
components, a raw value leaked into the markup.

See `references/structure-style-separation.md` for token-anatomy, a
before/after, multi-theme setup, and the framework-agnostic version.

## 2. Separate behavior from markup — Model / View / Presenter

A component that fetches data, formats it, holds state, *and* renders markup is
the same tangle as a page with inline styles: you can't touch one concern
without risking the others, and you can't restyle the view without dragging the
logic along. Split along MVP:

- **Model** — the data and domain truth. Types, schemas (e.g. Zod), the API
  client, server/cache state, validation. Knows nothing about rendering.
- **Presenter** — the glue. Hooks / container components / selectors that fetch
  model data, transform and **format** it into view-ready props (dates,
  currency, pluralization, derived flags), and turn user events back into model
  operations. All the conditional logic lives here.
- **View** — presentational components. Receive plain props, render markup +
  tokens, emit callbacks. No data fetching, no formatting, minimal branching.
  "Dumb" on purpose.

Why it pays off, beyond tidiness:

- **The view becomes a pure function of props**, so reskinning (pillar 1) is
  safe — you change markup/tokens without going near the logic.
- **The presenter is testable without a DOM** — assert it returns the right
  props for given model state; no render, no jsdom gymnastics.
- **The model is shared** across views and screens without duplication.

In React this maps cleanly: Model = types + schemas + API client + query hooks;
Presenter = custom hooks (`useInvoiceList`) and container components + pure
formatter functions; View = presentational components taking only props. Keep a
View prop-driven and you can drop it into Storybook, a test, or a redesign
untouched. See `references/mvp-separation.md` for the React mapping, a
container/presentational split, and how it differs from MVC/MVVM.

## 3. Organize for the next human (and the next reskin)

Separation only stays real if the layout makes the seams obvious:

- **One responsibility per file.** A file should have one reason to change. Keep
  files small (~300 lines is a good nudge, ~500 a firm one); when one grows,
  split it or promote it to a folder — don't let a 900-line component hide three
  components and a hook.
- **Colocate by feature, then by layer.** Group a feature's model/presenter/view
  together once it's more than a file or two; within `components/`, keep the
  layers legible (primitives → composed components → feature components →
  pages/routes) with dependencies pointing *one way* (pages use features use
  components use primitives, never the reverse).
- **Mirror tests beside the structure, not inside source.** `Foo.tsx` →
  `Foo.test.tsx` in the test tree. Test the **view** for rendering/states and the
  **presenter** for logic — the split makes both easy.
- **Name to reveal intent.** Components/types `PascalCase`; vars/functions
  `camelCase`; functions are verbs (`formatCurrency`), booleans read as
  predicates (`isLoading`, `hasError`). A good name removes the need for a
  comment.
- **Comments say *why*, not *what*.** The code already says what it does. A
  comment earns its place by explaining a non-obvious reason, a constraint, or a
  trap — not by narrating the next line or the migration history.
- **Always handle the four states in a view**: loading, empty, error, and data.
  A view that only renders the happy path is an unfinished view.

## Quick checklist before you call UI work done

- [ ] No raw hex / arbitrary `[...]` color or radius values in components — tokens only
- [ ] Tokens named by role (`primary`, `destructive`) not value (`blue`, `red-500`)
- [ ] Theme/token mapping lives in one file; light/dark/brand are value maps over the same names
- [ ] Data fetching + formatting live in a presenter/hook, not in the view
- [ ] The view is prop-driven and would render in a test/Storybook with no network
- [ ] Files single-responsibility and within size limits; tests mirror source
- [ ] Names reveal intent; comments explain *why*; loading/empty/error/data all handled
- [ ] To rebrand: only the token file changes, zero component files
