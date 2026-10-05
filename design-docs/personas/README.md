# Audiobook Studio Personas

Reusable personas for adversarial testing, product design review, QA planning, and agent prompts.

Use these as review lenses, not as fictional user stories to satisfy mechanically. A good persona review should expose a concrete failure mode, decision ambiguity, missing affordance, or unnecessary complexity.

The role is enacted through its constraints, habits, and stakes—not through theatrical dialogue. Reviewers
must not imitate the Harry Potter codename retained in a legacy filename, invent biography beyond the card,
or turn a persona into a costume. The role title and the evidence in its file are authoritative.

## Files

- [00-index.md](00-index.md) - **canonical roster.** Confidence ladder, the full persona table, high-signal pairings, and the validation backlog.
- Role-slug persona files (01–46 in the canonical roster) - one fully developed persona per file: Identity, Goals, Context, Key workflow moments, Top friction points, What they need, Review lens, Red flags, Evidence basis. Some filenames retain legacy character codenames for stable links; use the role title inside the file when identifying the persona.
- [review-panels.md](review-panels.md) - ready-made persona panels for common review tasks (every persona appears in at least one panel).
- [persona-matrix.md](persona-matrix.md) - trait matrix (stage / level / stance / scale / optimizes-for) for composing a custom panel or checking panel diversity.
- [prompt-templates.md](prompt-templates.md) - copy-paste prompts for design review, adversarial QA, and implementation planning.
- [persona-catalog.md](persona-catalog.md) - **legacy** compact one-card-per-persona summary, superseded by the individual files. Kept as a quick-scan reference only.

## How To Use

1. Pick 3-7 personas that match the surface under review.
2. Ask each persona to identify blockers, confusion points, and unsafe assumptions.
3. Convert findings into specific defects or design changes.
4. Keep the final decision owned by the product/spec, not by a persona vote.

## Enactment Contract

For each selected persona, perform the review in this order:

1. **Declare the task and starting state.** Name what this person is trying to accomplish, what they know at
   entry, and the device, scale, time pressure, or assistive technology that materially constrains them.
2. **Walk the real path.** Trace the shortest plausible sequence through the supplied screen, flow, contract,
   or implementation. Do not critique an imagined interface when evidence is available.
3. **Stop at the first consequential break.** Identify the earliest moment they become blocked, form a wrong
   mental model, risk losing work, or lose justified trust. Later findings remain useful, but this one governs
   the experience.
4. **Tie the finding to evidence.** Cite the persona friction point or red flag and the exact UI state, code
   path, spec clause, screenshot region, or missing evidence that triggers it.
5. **Classify the result.** Use `BLOCKER`, `SERIOUS FRICTION`, `PREFERENCE`, or `NO STAKE`. Accessibility
   barriers and destructive-data risks are blockers even when the happy path works.
6. **Name the smallest repair and proof.** State the narrowest change that removes the harm and the observable
   test or artifact that would prove it. A persona may reveal the problem; it does not dictate architecture.

Keep three layers distinct:

- **Observed:** directly visible or verified in the supplied evidence.
- **Inferred:** a likely consequence grounded in this persona's documented behavior.
- **Unknown:** requires a user interview, product decision, runtime trace, or missing artifact.

Never promote an inference to an observed product fact. Never manufacture a finding because a panel seat was
selected. A clean result or `NO STAKE` is evidence that the panel is disciplined, not that it failed.

## Persona Schema

Each fully developed role-slug persona file uses the same sections:

- **Identity**: a one-line first-person statement of who they are and what they fundamentally need.
- **Goals**: what success means to this persona.
- **Context & environment**: hardware, how they came to Studio, their work cadence.
- **Key workflow moments**: the concrete points where they touch the app.
- **Top friction points** (F1–Fn): specific friction tied to real app behavior.
- **What they need from the studio**: concrete asks.
- **Review lens**: the questions they ask of any screen.
- **Red flags**: what makes them quit or distrust the app.
- **Evidence basis**: confidence level (all currently INFERRED) and who to interview to validate.

The first-person Identity expresses the user's governing concern. It is not permission to fabricate quotes,
emotions, demographic details, or usage history beyond the card. When a real interview, support ticket, or
telemetry result changes a persona, record the evidence date and which friction point it supports or refutes.

The legacy [persona-catalog.md](persona-catalog.md) uses an older compact schema (Role / Primary goals / Stress cases / Review lens / Adversarial prompt).

## Default Coverage

The catalog covers:

- Creative production and editorial workflows.
- Technical integration, plugin, queue, and diagnostics workflows.
- Accessibility, local-first trust, constrained hardware, and casual first-run use.
- Release, support, education, localization, and high-volume operations.

When adding a new persona, avoid duplicates. Prefer a sharper stress case over another generic "user."
