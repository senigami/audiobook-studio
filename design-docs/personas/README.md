# Audiobook Studio Personas

Reusable personas for adversarial testing, product design review, QA planning, and agent prompts.

Use these as review lenses, not as fictional user stories to satisfy mechanically. A good persona review should expose a concrete failure mode, decision ambiguity, missing affordance, or unnecessary complexity.

## Files

- [persona-catalog.md](persona-catalog.md) - canonical persona cards grouped by review domain.
- [review-panels.md](review-panels.md) - ready-made persona panels for common review tasks.
- [prompt-templates.md](prompt-templates.md) - copy-paste prompts for design review, adversarial QA, and implementation planning.

## How To Use

1. Pick 3-7 personas that match the surface under review.
2. Ask each persona to identify blockers, confusion points, and unsafe assumptions.
3. Convert findings into specific defects or design changes.
4. Keep the final decision owned by the product/spec, not by a persona vote.

## Persona Card Schema

Each persona uses the same compact fields:

- `Role`: the user or reviewer type.
- `Primary goals`: what success means to this persona.
- `Stress cases`: flows or states likely to break for them.
- `Review lens`: the perspective they should apply during review.
- `Adversarial prompt`: a one-line question to start a test pass.

## Default Coverage

The catalog covers:

- Creative production and editorial workflows.
- Technical integration, plugin, queue, and diagnostics workflows.
- Accessibility, local-first trust, constrained hardware, and casual first-run use.
- Release, support, education, localization, and high-volume operations.

When adding a new persona, avoid duplicates. Prefer a sharper stress case over another generic "user."
