# Quiet Studio Migration — Plan

Implementation plan for adopting the approved **"Quiet Studio — Precision Pressroom"** redesign into the real app + demo. The design is decided and verified; this folder is the *how*, sequenced so the app never breaks.

## Read in this order

1. [`00-overview.md`](00-overview.md) — the task, success criteria (definition of done), scope boundaries, hard constraints.
2. [`01-map.md`](01-map.md) — **the implementation map**: parts, connections, invariants (`INV-*`), risks (`R*`). The externalized memory — open this alongside any task.
3. [`02-roadmap.md`](02-roadmap.md) — the ordered, rollback-friendly phases + dependency graph + per-phase exit checklist.
4. [`tasks/`](tasks/) — one self-contained, map-linked unit per phase (`000`–`006`).

## Design source of truth

- Rendered proposal (the target look): `docs/style-guide/proposed-quiet-studio.html`
- Canonical written spec (update in lockstep): `design-docs/specs/design-system.md` (+ `design-docs/specs/voice-tone.md` for copy)
- Frozen "before" reference: `docs/style-guide/current.html` (do **not** touch until P6)

## How to pick up a task

Open the task file in `tasks/` **plus** `01-map.md`. The task file is written to be executable from those two alone. Honor the map links (`PART-*`, `INV-*`) — they name the connections you can't see from inside one file. Run the per-phase exit checklist (`02-roadmap.md`) before marking a phase done. This plan is well-suited to `planrunner` (orchestrated implementer slices + adversarial review).

## Status protocol

Mark progress at the top of each task file: `STATUS: todo | in-progress | done | blocked`. When a phase ships, tick its milestone in `02-roadmap.md`. Note any deviation from the plan in the task file (don't silently diverge — reconcile).

## Guardrails (from the constraints)

- **Alias-first** — change token *values*, keep token *names*; add role-named tokens alongside. Never delete a `--token` a consumer still uses (`INV-1`).
- **Spec lockstep** — `design-system.md` updates in the same commit as the code (`INV-3`).
- **AA in both themes**, verified, composited tints recomputed against the new `--bg` (`INV-2`).
- **No Tailwind**; no framework rewrite — this is a token re-skin.
- **Commit isolation** — a concurrent agent is consolidating `design-docs/plans/`; keep commits scoped (`INV-8`).
- **Frozen baseline** — `current.html` untouched until P6 (`INV-7`).
