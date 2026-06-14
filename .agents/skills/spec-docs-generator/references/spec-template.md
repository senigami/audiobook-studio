# Spec document anatomy

Every numbered spec is plain Markdown — no YAML frontmatter. The structure below is the convention; adapt section names to the topic, but keep the title → TL;DR → Overview → body → cross-reference shape.

## Skeleton

```markdown
# <Topic Title>

> **TL;DR:** One or two sentences — what this spec governs and the single most
> important rule in it. Related decisions: [ADR-0003](decisions/0003-slug.md).

## Overview

Two to four paragraphs of prose: what this part of the system does, why it
exists, how it relates to neighboring specs. Written for a reader with zero
prior context.

## Scope

What this spec covers and — just as important — what it explicitly does not.
Mark deferred work inline: "Multi-region deploys are **post-v1**; the design
assumes one region and the seams for more are noted in §Deployment."

## <Topic Section 1>

The normative content. Rules in the imperative with the reason attached.

## <Topic Section 2>

...

## Related specs

- [docs/02-system-architecture.md](02-system-architecture.md) — where these components are defined
- [ADR-0004](decisions/0004-slug.md) — why this approach over the alternative
```

## Formatting conventions

- **H1 once**, at the top. H2 for major sections, H3 for subsections. No deeper.
- **TL;DR blockquote immediately after the title**, before any prose. Lead with the punchline; a reader who stops there should still know the headline rule.
- **Tables for enumerable reference data**: endpoints, error codes, env vars, stack components, status values. One concept per row, explanation in surrounding prose, not crammed into cells.
- **Fenced code blocks with language tags** for examples: schemas, payloads, config, commands.
- **Inline code** for identifiers: table names, env vars, package names, file paths, error codes.
- **Cross-references as relative Markdown links**, filename as the link text: `[docs/03-data-model.md](03-data-model.md)`. ADR links use the number as text: `[ADR-0002](decisions/0002-slug.md)`.
- **Status markers in bold inline**: `**post-v1**`, `**deprecated**`, `**migration in progress**`. An agent reading the spec must be able to tell intentional gaps from oversights.
- File naming: `NN-kebab-case-topic.md`, two-digit zero-padded numbers, assigned once and never reused.

## Writing normative rules

A spec is a contract, not a tour. The difference:

- ❌ "Errors are generally returned as JSON with a message field."
- ✅ "Every error response is `{ code, message, details? }`. `code` is `<domain>.<reason>` in snake_case (`auth.token_expired`). HTTP mapping: validation 400, unauthenticated 401, forbidden 403, not-found 404, conflict 409, server 5xx. This shape is shared by the REST API and webhook callbacks, so changing it is a breaking change for integrators."

Three properties of the good version: it's **imperative** (an agent can check compliance), it's **complete enough to apply** (the mapping table is right there), and it carries the **why** (shared with integrators → don't casually change it).

When the codebase deviates from the chosen rule, say so: "Legacy routes under `/v0/` still return bare strings; new routes must not. Migrating `/v0/` is tracked as cleanup debt." This keeps the spec true while still giving one canonical rule.

## Worked example (medium spec, abridged)

```markdown
# API Conventions

> **TL;DR:** snake_case fields, `{ code, message, details? }` errors,
> cursor pagination everywhere. These shapes are shared by REST and the
> CLI — change them only with a deprecation cycle.

## Overview

All HTTP surfaces — the public REST API, the internal admin API, and webhook
payloads — share one set of conventions so clients and reviewers can rely on
them. This spec is the single place those conventions are defined; endpoint
catalogs live with their owning spec.

## Field naming

API payload fields are `snake_case` (`created_at`, not `createdAt`), because
the public API predates the TypeScript rewrite and external integrations
depend on it. Internal TypeScript uses camelCase; the serialization layer
(`src/lib/serialize.ts`) converts at the boundary — handlers never hand-write
snake_case.

## Errors

| HTTP | When | Example code |
| --- | --- | --- |
| 400 | validation failure | `apps.invalid_slug` |
| 401 | missing/expired auth | `auth.token_expired` |
| 404 | resource not found | `apps.not_found` |

## Pagination

Cursor-based: request `{ cursor?, limit? }`, response `{ items, next_cursor }`.
Cursors are opaque and server-issued. No offset paging — offsets break under
concurrent writes and we paginate hot tables.

## Related specs

- [docs/02-system-architecture.md](02-system-architecture.md) — where the API layer sits
- [ADR-0002](decisions/0002-snake-case-api-fields.md) — why snake_case won
```
