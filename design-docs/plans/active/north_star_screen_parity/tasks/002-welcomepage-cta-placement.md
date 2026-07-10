# Task 002 — WelcomePage: fix CTA placement and secondary-CTA element type

Status: pending

Risk: none (but see Coupling note below — check the concurrent styling lane first)

## Goal

Move the primary/secondary CTAs ("Enter Library" / "View Documentation") up near the hero, matching
the demo, instead of burying them after two full sections at the bottom of the page. Also change
the secondary CTA from a bare `<a>` to the same `Btn` component family the primary CTA uses.

## Why this matters

Demo puts both CTAs directly under the hero chips (`splash.tsx:248-269`) — a first-time user sees
"how to get started" immediately. Live moves them to a separate block after "Getting started" and
"Learn more" (`WelcomePage.tsx:162-170`), so a user must scroll past two sections before finding the
one clickable path forward. This is the exact kind of first-impression friction the Casual
Listener/Nontechnical Author personas (`design-docs/personas/27-casual-listener.md`,
`28-nontechnical-author.md`) are built to catch — see their "Setup flows before value" /
"Red flags that make them quit" sections if you want the user-facing framing.

## Exact files

- `frontend/src/pages/Welcome/WelcomePage.tsx`

## Current shape (verified)

- Hero section: `WelcomePage.tsx:102-123` (logo, title, subtitle, status chips) — ends with no CTA.
- "Getting started" 3-step cards: `WelcomePage.tsx:126-148`.
- "Learn more" 4 doc-link cards: `WelcomePage.tsx:151-159`.
- CTA block (primary `Btn` "Enter Library" wired to `navigate('/library')`, secondary bare `<a
  href="#">` "View Documentation"): `WelcomePage.tsx:162-170`.

## Target shape (matches `splash.tsx:169-270`)

- Hero section ends with the CTA row immediately after the status chips, before "Getting started".
- Secondary CTA (`View Documentation`) becomes a `Btn` (same component/variant family as the primary
  button — check `splash.tsx:264-268` for which variant the demo uses, likely a "secondary"/outline
  style) instead of a bare anchor. It's still a dead link today (`href="#"` in demo too, per
  research) — only the element type/visual affordance changes here, not its behavior.
- "Getting started" and "Learn more" sections remain unchanged and stay below the CTA row.

## Steps

1. Read `WelcomePage.tsx:90-172` fully to see the current JSX structure and identify the `Btn`
   import/component already in use for "Enter Library".
2. Move the CTA row's JSX block from its current position (end of file, ~line 162-170) to
   immediately after the hero's status chips (~end of line 123's block), before the "Getting
   started" section begins.
3. Replace the bare `<a href="#">View Documentation</a>` with the same `Btn` component, choosing
   whatever secondary/outline variant prop the component supports (check the `Btn` component's own
   prop types — grep for its definition) to visually distinguish it from the primary CTA without
   inventing a new style.
4. **Before committing:** check whether the concurrent styling-separation lane
   (`design-docs/plans/active/simplification/styling_separation_execution/`) has already converted
   this file's inline styles to a `WelcomePage.css` file (it was mid-conversion on this exact file
   during this plan's research). If so, move CSS rules for the relocated block along with the JSX
   rather than reintroducing inline styles.

## Acceptance criteria

- [ ] CTA row renders immediately after the hero, before "Getting started" — verify by reading the
      rendered DOM order or a screenshot, not just JSX order (React fragments can reorder oddly if
      done wrong).
- [ ] Both CTAs are `Btn` components with visually distinct primary/secondary treatment.
- [ ] "Getting started" and "Learn more" content/copy is completely unchanged.
- [ ] `npm -C frontend run test -- --run` passes for any existing `WelcomePage` test.
- [ ] `npm -C frontend run build` and `npm -C frontend run lint` are clean.
- [ ] Manually verify in a running dev server (light/dark) that the page still reads well with the
      CTA moved up — this is a small enough change that a screenshot check is sufficient, full
      designer review not required for this task alone (task 011 covers broader visual
      verification).

## Map links

Part: "Welcome/splash" in `01-map.md`'s Parts table. Invariant: INV-2 (tokens only) if any new CSS
is written — reuse `Btn`'s existing variant styling rather than hand-rolling new classes.

## Dependencies

None structurally. Sequencing note: check the styling lane's current state on this file first (see
step 4 and `01-map.md` "Coupling risk").

## Out of scope

Do not touch the "Getting started" or "Learn more" sections' content. Do not fix the dead
`href="#"` link behavior — that's a separate, pre-existing issue in both demo and live, not part of
this plan's parity scope.
