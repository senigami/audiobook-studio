# Execution Strategy — Mixed-Engine Model-Load Fix

> **TL;DR:** Run it with **planrunner**. W1 is a contract-sensitive keystone (implement on **mid**, review on **top**); W2→W3 must run **serially** (both edit `orchestrator_helpers.py`); W4 follows W3; W6 specs land alongside. Spend concentrates on W1 + the final adversarial pass — everything else is mid/light.

## Model tier map (this session)
| Tier | Model | Use for |
|------|-------|---------|
| light | Haiku 4.5 | running tests/lint, file audits, the mechanical version-bump edits |
| mid | Sonnet 4.6 | implementing each task slice from its (precise) task file |
| top | Opus 4.8 | the keystone design check (W1), invariant-sensitive review, final adversarial pass |

Orchestrator/reviewer stays on your session model (top). You're routing the delegated slices.

## Routing — tier per task
| Task | Tier · model | Why | Vehicle |
|------|--------------|-----|---------|
| **W1** marker resolution + `generation.py` engine propagation | **mid · Sonnet** to implement, **top · Opus** to review | Keystone: touches core marker resolution; must avoid engine-ID branching and honor the map. A wrong call here breaks W2/W3. | planrunner slice + mandatory top review |
| **W2** synthesis-only duration, sole writer | mid · Sonnet | Implementation from a precise spec; metrics correctness. | planrunner slice |
| **W3** ETA suspension + per-group preparing phase | mid · Sonnet | From spec, but invariant-sensitive (monotonic status, null-ETA clear) → careful top review. | planrunner slice |
| **W4** frontend preparing presentation | mid · Sonnet | Multi-file frontend; R3 contract-shaped tests. | planrunner slice |
| **W6** spec reconciliation | mid · Sonnet (light for the pure version-bump/changelog mechanics) | Accuracy matters (joint authority), but bounded. | planrunner slice |
| Verification (pytest/vitest/ruff/lint) | light · Haiku | Mechanical, no judgment. | runner subagent |
| Final adversarial review (whole change) | top · Opus | Correctness/contract/security across boundaries; expensive if wrong. | planrunner review round |

## Parallelization plan
- **Wave 1:** **W1 alone** — it's the keystone and blocks W2 + W3. Nothing else can correctly proceed first.
- **Wave 2:** **W2 → W3 SERIAL, not parallel.** Both depend only on W1 *and would otherwise run concurrently* — but **both edit `app/orchestration/scheduler/orchestrator_helpers.py`**, so running them together would clobber edits. Do W2, then W3 (W3 also edits `orchestrator_publish.py`, no conflict there).
- **Wave 3:** **W4** after W3 (it consumes W3's per-group phase / `reason_code` signal). Entirely separate files (frontend), so no isolation needed.
- **Alongside:** **W6** edits only `docs/specs/*` — zero file overlap with code. Draft as the code settles, finalize with the behavior so specs+code land together. No worktree isolation needed.
- **Worktree isolation:** not required here — the only same-file contention (W2/W3) is resolved by serializing, and the remaining tracks touch disjoint files.

## Execution vehicle
**planrunner.** This is an approved multi-slice plan with task files already written — planrunner consumes the roadmap/task files directly, delegates each slice to a mid implementer, verifies, and runs the adversarial round. It inherits the routing above (W1 review on top; verification on light). Not a Workflow case — there's no large fan-out/pipeline over many items; it's a short dependency chain.

## Cost / quality
- **Spend concentrates** on W1 (keystone, gets a top review) and the final adversarial pass (top). W2/W3/W4/W6 are mid; verification is light.
- **Top-tier justified at:** W1's design check and the final whole-change review — both touch contracts/invariants where a wrong call is expensive (monotonic status, no engine-ID branching, metrics correctness).
- **Would be waste at:** the per-slice implementation (mid is right), version bumps and test runs (light).
- **Lean variant (recommended):** mid implements every slice; one top review pass at the end + a top spot-check on W1 specifically. **Thorough variant:** top review after each of W1/W3 individually (the two most invariant-sensitive) plus the final adversarial pass — worth it only if a regression here would be costly to catch later.

## How to run it
Invoke **planrunner** starting at **W1** (it's `Not started`; it unblocks everything). Tell it: implement slices on Sonnet, force a top (Opus) review on W1 and on the final whole-change pass, run verification on Haiku. W6 spec edits land in the same slices that change the behavior (joint authority).
