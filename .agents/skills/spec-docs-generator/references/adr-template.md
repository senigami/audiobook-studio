# ADR conventions

Architecture Decision Records live in `docs/decisions/`, named `NNNN-short-slug.md` with four-digit zero-padded numbers. Numbers are immutable: once assigned, never reused. A reversed decision gets a **new** ADR that supersedes the old one — the old ADR's Status changes to `Superseded by ADR-XXXX`, but its content stays as history.

## ADR template

```markdown
# ADR-NNNN: Short imperative title

> **TL;DR:** One or two sentences — the decision and the one-sentence why.
> The punchline, before any context.

## Status

Accepted | Superseded by ADR-XXXX | Deprecated

## Date

YYYY-MM-DD

## Context

What forced this decision. The constraints, the problem, what changed.

## Decision

What we're doing. Concrete and specific.

## Alternatives considered

What was rejected and why. A table works well for 3+ options.

## Consequences

Costs accepted, follow-on work created, doors closed and opened.

## Spec docs affected

Which numbered specs implement this decision.
```

## When to write an ADR

Write one when a decision is **expensive to reverse or likely to be questioned**: technology choices (database, framework, hosting), structural choices (monorepo vs polyrepo, sync vs async processing), security postures, and any convention that won a conflict between competing patterns in the codebase. Skip ADRs for choices with one obvious answer or that cost nothing to change later.

When seeding ADRs retroactively (documenting decisions already embodied in the code), use today's date and open the Context with a note like "Retro-documented; this decision was made earlier in the project's life." Reconstruct the alternatives honestly — if you don't know what was considered, list the plausible alternatives and why the chosen path beats them today.

## decisions/README.md

Create `docs/decisions/README.md` containing:

1. One paragraph: what ADRs are for in this repo ("specs say what the system does; ADRs say why it's shaped that way") and the immutable-number / supersede-don't-edit rule.
2. An index table: ADR number, title, status — kept current as ADRs are added.
3. The ADR template above, so future authors copy it from one place.
4. The "when to write an ADR" guidance, condensed.
