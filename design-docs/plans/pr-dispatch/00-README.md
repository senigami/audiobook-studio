# PR Dispatch — remaining Studio 2.0 work order

Each file in this folder is a **self-contained brief for one projected PR**. Take one into a fresh
session on its own branch, do the work, then open the PR with the `write-pr` skill targeting
**`studio-2.0`** (never `main`).

These briefs were written 2026-07-16 by cross-checking the owner's list against
`design-docs/plans/TASKS.md` and the linked plan folders. Where the brief and TASKS.md disagree,
re-verify against the live tree first — TASKS.md has drifted before.

## The PRs

| # | Brief | Size | Owner gate before starting? | Runs solo? |
|---|---|---|---|---|
| 01 | [StatusOrb preparing appearance](01-statusorb-preparing.md) | XS | no | no |
| 02 | [W-QS P5-B: `--accent` → `--action-primary` rename](02-wqs-p5-accent-rename.md) | S (mechanical, 94 files) | **yes** | **yes** |
| 03 | [Milestone 3 / 005 — Code simplification](03-simplification-005.md) | L | no | mostly |
| 04 | [Milestone 3 / 006 — Backend namespace rename + code-org](04-backend-namespace-006.md) | L (widest blast radius) | **yes** | **yes** |
| 05 | [Milestone 3 / 010 — Standalone plugin repos](05-standalone-plugin-repos-010.md) | L | no | no |
| 06 | [W-PERF — safe foundation only (Workloads 1–3)](06-wperf-safe-foundation.md) | M | (owner already decided) | no |
| 07 | [Milestone 2 / DC-1b — dead-tree deletion (investigate-first)](07-dc1b-dead-tree.md) | S–M | no | must not run with 03 |
| 08 | [video_utils.py — decision + wiring](08-video-utils-decision.md) | XS decision / S wiring | **yes (product decision)** | no |
| 09 | [North Star demo parity with production](09-northstar-demo-parity.md) | M | no | no |
| 10 | [API functionality — verify, review, POC app](10-api-verify-poc.md) | M | no | no |

## Sequencing (what NOT to run at the same time)

The hard ordering is about **merge-conflict blast radius**, not logic:

```
Independent, run anytime, in parallel:   01, 06, 09, 10
Decision-gated (resolve first):          02 (owner), 08 (product)

Simplification chain (order matters):    03 (005) ─► 04 (006 rename) ─► 05 (010)
                                          07 (DC-1b) must NOT overlap 03 — both touch FE dead-code trees
```

- **04 (namespace rename `plugins/`→`tts_engines/`)** has the widest blast radius in the whole plan.
  Run it **alone** on a quiet tree, after 03 lands, before 05. Nothing else should be mid-flight in
  `plugins/`, core imports, or manifests while it merges.
- **02 (`--accent` rename)** is a 94-file mechanical CSS-var rename. Same rule: land it alone so it
  doesn't fight every other frontend PR for conflicts. Owner-gated — get the go-ahead first.
- **05 (010)** depends on 03's plugin-SDK consolidation being clean and must match whatever name 04
  settled on. Do it last of the three.
- **07 (DC-1b)** and **03** both touch frontend dead-code; don't run them concurrently.

## Did the list miss anything?

Cross-checked against every open `[ ]` in TASKS.md. The owner's list covers the discrete,
dispatchable items. Deliberately **not** turned into PRs here (still deferred/gated by design, or
owner-run):

- **W-PERF Workloads 4–6** (AI extraction pipeline + export layer + review UI) — on hold pending a
  separate reliability/cost + cloud-manuscript-privacy decision (see brief 06).
- **Milestone 4 chapter-editor art-program catalog** (Cast/Booth/Revise tool additions, a11y
  keyboard model, Casting Call / Script Supervisor tool slots) — large, still-open feature backlog;
  its own planning effort, not a cleanup PR.
- **Milestone 5 / 011 release gating** — owner-run, last (manual render verification, screenshot
  refresh, Pinokio, spec-conformance, tag).
- **LF-6 `enrich()` extraction** — deliberately left for a supervised session (dense bug-fix math).
- **L-LIB 001–004** (library/series usability) — marked `[~]`; check status before treating as open.

If you want any of these turned into briefs too, say so.
