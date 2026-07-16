# 45 · Design-Systems Consistency Reviewer  ☆ INFERRED

**Identity:** "Every one-off color, every hand-typed pixel value, every 'just this once' spacing hack is a debt somebody pays later — usually in a dark-mode bug six months from now. I catch it now."

---

## Goals
- Confirm every color, spacing value, radius, and type size traces back to a design token — never a hardcoded hex, a bare `px` value, or a magic number
- Catch component reinvention — a new one-off button/card/modal built from scratch where an existing, already-correct component would have done the job
- Keep light/dark mode parity mechanical, not manual — if it's a token, both modes are handled by construction; if it's hardcoded, someone will forget the other mode
- Notice drift between similar surfaces (two modals that should look related but have diverged spacing/radius/shadow treatments over time)
- Prevent the token system itself from becoming inconsistent — a new token added carelessly is the same debt as a hardcoded value, just deferred

## Context & environment *(INFERRED)*
- Has maintained a design system (or a component library) long enough to have seen what happens when nobody enforces it: three near-identical badge components, none of them quite the same, all three now load-bearing somewhere
- Reviews by diffing against the actual token source (`tokens.css`, a `taxonomy.ts`-style config, whatever the project's canonical style truth is) — not by eyeballing whether something "looks about right"
- Treats a new component's existence as a question, not a given: "does this need to be new, or does an existing component already do 90% of this and just need a prop?"
- Cares more about the system staying coherent over time than about any single screen looking impressive in isolation — a beautiful one-off that fragments the system is a net loss to them

## Key workflow moments
- **New component review:** before approving a new UI piece, checks whether it duplicates an existing component's job, and if genuinely new, confirms it's built from tokens rather than ad-hoc values
- **Token audit:** periodically greps the codebase for raw hex colors, raw `px` spacing, and inline `style` overrides that bypass the token system, tracking which are justified exceptions vs. accumulating debt
- **Cross-screen comparison:** opens two conceptually-similar surfaces (two modals, two card types, two empty states) side by side and checks whether their spacing/radius/shadow/type treatment actually match or have quietly diverged
- **Dark-mode spot check:** flips every reviewed screen to dark mode specifically to catch hardcoded light-mode-only values that a token would have handled automatically
- **New-token gatekeeping:** when someone proposes adding a new token (a new color, a new spacing value), asks whether it's genuinely a new need or a near-duplicate of an existing token that should be reused instead

## Top friction points *(INFERRED)*
- **F1 — Hardcoded values instead of tokens:** a component with `color: #3d3d3a` or `padding: 13px` instead of `var(--text-secondary)`/`var(--space-3)` — invisible in light mode, often broken in dark mode, and untraceable when the design system changes
- **F2 — Near-duplicate components:** three different badge/pill/chip implementations across the app, each slightly different, none reused, all now separately maintained
- **F3 — Silent visual drift between related surfaces:** two modals that started identical and have drifted apart over many small changes, so a user unconsciously notices "these feel different" without being able to say why
- **F4 — One-off spacing "just for this screen":** a padding value that doesn't match the established scale, added under time pressure, that then gets copy-pasted into the next screen because it's now "the pattern people see"
- **F5 — Token sprawl:** new tokens added faster than old ones are consolidated, so the system itself becomes as inconsistent as the hardcoded values it was meant to replace

## What they need from the studio
- A single canonical token source (colors, spacing, radius, type scale, shadows) that every component reads from — no parallel hardcoded values anywhere in component code
- A lint rule or review habit that catches new hardcoded values before merge, not after
- A living inventory of existing components, checked before building a new one, so near-duplicates get caught at design time instead of after two versions already exist
- Dark mode treated as automatic-by-construction (every token has both-mode values) rather than a manual per-component pass
- Periodic drift audits between conceptually-related surfaces, not just one-time consistency at ship

## Review lens — questions they ask of any screen
- "Is this color/spacing/radius/shadow value a token, or did someone type a raw number?"
- "Does a component that does 90% of this job already exist, and if so, why wasn't it reused or extended?"
- "If I put this next to the other screen that's supposed to feel related, do they actually match?"
- "Does this look right in dark mode because it's tokenized, or because someone manually patched it and will forget to next time?"
- "Is this a genuinely new design need, or a new token/component that duplicates something already in the system?"
- "If I changed this token's value right now, would this screen update correctly, or is there a hardcoded copy somewhere that would silently go stale?"

## Red flags that make them quit or distrust the app
- Grepping the codebase and finding raw hex values or magic-number spacing scattered through component files instead of token references
- Three or more components solving the same visual problem (badge, chip, pill) with slightly different implementations, none canonical
- A screen that visibly diverges from its sibling screens in spacing/radius/shadow with no design rationale — just accumulated drift
- Dark mode bugs that trace directly to a hardcoded light-mode value with no dark-mode counterpart
- A new token added to "fix" one screen that turns out to duplicate an existing token within a few percentage points — sloppy token hygiene compounding over time

**Evidence basis:** INFERRED. Validate by running an actual token/hardcoded-value audit against this app's real `frontend/src/theme/` and component tree, and checking whether the friction points named here (near-duplicate components, drift between related surfaces) show up as real, confirmed instances rather than hypothetical risk.
