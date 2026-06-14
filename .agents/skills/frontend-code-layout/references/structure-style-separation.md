# Structure / Style Separation — the token-based reskin model

Read this when you need the *how* behind pillar 1: setting up tokens, fixing
hardcoded values, supporting multiple themes, or applying the idea outside
Tailwind/shadcn.

## The mental model

CSS Zen Garden's lesson is timeless: **if the structure carries meaning and not
appearance, the appearance is swappable.** What's dated is the *mechanism* —
"put all CSS in one external stylesheet." In a utility-first / component world,
styling lives in the markup on purpose (it's colocated, dead-code-free, and
scoped). So the swap point moves up one level of abstraction:

```
Zen Garden (2003)         Modern (tokens)
-----------------         ----------------
semantic HTML        →    components express INTENT via semantic tokens
swap the stylesheet  →    swap the token→value MAPPING (the theme)
```

Same payoff — restyle without touching structure — different seam.

## Token anatomy

A token is a **named intent**, defined once as a CSS variable and consumed
everywhere by name. Two layers:

```css
/* Layer 1: primitive scale (raw values — referenced only by Layer 2) */
:root {
  --blue-600: oklch(0.55 0.2 255);
  --neutral-50: oklch(0.98 0 0);
  --neutral-900: oklch(0.2 0 0);
}

/* Layer 2: semantic tokens (role names — what components actually use) */
:root {
  --background: var(--neutral-50);
  --foreground: var(--neutral-900);
  --primary: var(--blue-600);
  --primary-foreground: var(--neutral-50);
  --destructive: oklch(0.6 0.22 25);
  --muted-foreground: oklch(0.55 0 0);
  --radius: 0.5rem;
}

/* A theme is just a different Layer 2 mapping */
.dark {
  --background: var(--neutral-900);
  --foreground: var(--neutral-50);
}
.brand-acme {
  --primary: oklch(0.6 0.18 150);   /* green instead of blue — one line */
}
```

Components only ever reference Layer 2 role names (`bg-primary`,
`text-foreground`). Because `primary` is a *role*, the Acme rebrand above is a
single line — nothing in the components knows or cares that primary went green.

## Before / after

**Before — appearance welded into the markup (un-reskinnable):**

```tsx
<button className="bg-blue-600 hover:bg-blue-700 text-white rounded-[7px] px-4 py-2">
  Save
</button>
<p className="text-[#6b7280] text-sm">Last saved 2m ago</p>
```

To rebrand you'd grep every `blue-600`, every `#6b7280`, every `[7px]` across
the codebase and pray you caught them all.

**After — intent in the markup, appearance in the theme:**

```tsx
<button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md px-4 py-2">
  Save
</button>
<p className="text-muted-foreground text-sm">Last saved 2m ago</p>
```

Structure (`px-4 py-2`, the element tree) stays put. The skin
(`primary`, `muted-foreground`, `rounded-md`) is now theme-controlled. Rebrand =
edit the token file.

## What is structure vs what is skin

| Belongs in the markup (structure) | Belongs in the theme (skin) |
| --- | --- |
| `flex`, `grid`, `gap-*`, `items-*` | color tokens (`primary`, `card`, `muted`) |
| spacing *application* (`p-6`, `mt-4`) | the spacing *scale's values* |
| element tree / DOM order | radius (`--radius`), shadow tokens |
| responsive structure (`md:grid-cols-2`) | type scale / font tokens |

Rule of thumb: if changing it would change the **brand/look**, it's skin → token.
If changing it would change the **layout/meaning**, it's structure → stays put.

## Don't over-rotate

- Don't tokenize one-off structural utilities (`flex`, `gap-2`) — that's
  structure, not theme, and a token there is just indirection.
- Don't reintroduce a giant hand-written external stylesheet to "honor Zen
  Garden literally." Utility classes + tokens already give you the separation;
  a parallel `.css` file fragments it.
- Don't create a second token for an existing concept. One role, one token.

## Framework-agnostic version

The model isn't Tailwind-specific. Anywhere you have styling, the seam is the
same — name intents, map them once:

- **CSS Modules / vanilla CSS**: components use `var(--primary)`; themes
  redefine the variables on `:root` / a theme class. Identical to above.
- **CSS-in-JS (styled-components, Emotion)**: components read from
  `theme.colors.primary` via the `ThemeProvider`; swap the `theme` object to
  reskin.
- **Vue / Svelte**: same CSS-variable approach; scoped styles reference
  `var(--token)`.

The constant: **components reference roles; one theme layer maps roles to
values; reskin by swapping the map.**
