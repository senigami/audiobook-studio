# Mixed-Engine Model-Load Fix — Fused Proposal

**Status:** Ready to execute (W1–W4 + W6). All decisions locked; task files written. No code changed yet.

This folder is the **fused** root-cause analysis and fix proposal for the mixed-engine model-load progress/ETA problem. It reconciles three independent analyses (two prior plans + an independent code-grounded RCA). The prior plan folders have been deleted; all decisions and reconciliation are captured in `00-overview.md`.

## Read in this order
1. [00-overview.md](00-overview.md) — problem, fused layered root cause, reconciliation of the two prior plans, decisions, scope, success criteria.
2. [01-map.md](01-map.md) — fix-surface by ownership boundary, invariants, contracts, risks.
3. [02-roadmap.md](02-roadmap.md) — ordered workstreams W1–W6 + dependency graph.

## Owner decisions (resolved 2026-06-23)
1. **Resource-claim scope (W5): DEFERRED.** Ship the core fix (W1–W4 + W6 specs) first; the mixed `ResourceClaim.none()` gap is tracked as separate follow-up work (cross-job GPU contention, distinct from the reported within-chapter symptoms).
2. **Frontend depth: FULL per-group phase model.** Implement a first-class preparing/synthesizing phase the UI reads — robust to future engines and mid-render warm-model eviction/reload — not the minimal threading variant.

Next step: write per-task files under `tasks/` for W1–W4 + W6, following the `task-plan-architect` template, each linked to `01-map.md`.
