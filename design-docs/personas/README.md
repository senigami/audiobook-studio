# Audiobook Studio Personas

Reusable personas for adversarial testing, product design review, QA planning, and agent prompts.

Use these as review lenses, not as fictional user stories to satisfy mechanically. A good persona review should expose a concrete failure mode, decision ambiguity, missing affordance, or unnecessary complexity.

## Files

- [00-index.md](00-index.md) - **canonical roster.** Confidence ladder, the full persona table, high-signal pairings, and the validation backlog.
- `NN-*.md` (01–41) - one fully developed persona per file: Identity, Goals, Context, Key workflow moments, Top friction points, What they need, Review lens, Red flags, Evidence basis.
- [review-panels.md](review-panels.md) - ready-made persona panels for common review tasks (every persona appears in at least one panel).
- [persona-matrix.md](persona-matrix.md) - trait matrix (stage / level / stance / scale / optimizes-for) for composing a custom panel or checking panel diversity.
- [prompt-templates.md](prompt-templates.md) - copy-paste prompts for design review, adversarial QA, and implementation planning.
- [persona-catalog.md](persona-catalog.md) - **legacy** compact one-card-per-persona summary, superseded by the individual files. Kept as a quick-scan reference only.

## How To Use

1. Pick 3-7 personas that match the surface under review.
2. Ask each persona to identify blockers, confusion points, and unsafe assumptions.
3. Convert findings into specific defects or design changes.
4. Keep the final decision owned by the product/spec, not by a persona vote.

## Persona Schema

Each fully developed persona (`NN-*.md`) uses the same sections:

- **Identity**: a one-line first-person statement of who they are and what they fundamentally need.
- **Goals**: what success means to this persona.
- **Context & environment**: hardware, how they came to Studio, their work cadence.
- **Key workflow moments**: the concrete points where they touch the app.
- **Top friction points** (F1–Fn): specific friction tied to real app behavior.
- **What they need from the studio**: concrete asks.
- **Review lens**: the questions they ask of any screen.
- **Red flags**: what makes them quit or distrust the app.
- **Evidence basis**: confidence level (all currently INFERRED) and who to interview to validate.

The legacy [persona-catalog.md](persona-catalog.md) uses an older compact schema (Role / Primary goals / Stress cases / Review lens / Adversarial prompt).

## Default Coverage

The catalog covers:

- Creative production and editorial workflows.
- Technical integration, plugin, queue, and diagnostics workflows.
- Accessibility, local-first trust, constrained hardware, and casual first-run use.
- Release, support, education, localization, and high-volume operations.

When adding a new persona, avoid duplicates. Prefer a sharper stress case over another generic "user."
