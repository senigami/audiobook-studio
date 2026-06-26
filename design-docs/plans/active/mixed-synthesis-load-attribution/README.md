# W-MIX-LA — Mixed-synthesis load attribution (W-MIX follow-up)

**Status:** planned, not started · **Created:** 2026-06-26 · **Owner gate:** re-run the G0 visual check after ML-2.

## What this is

A focused follow-up to the **W-MIX** workstream ([../mixed-synthesis-fused-proposal/](../mixed-synthesis-fused-proposal/)), created because the **G0 visual check failed** on 2026-06-26. A live mixed XTTS+Voxtral render surfaced three real gaps in the sequential render core's model-load presentation. This workstream fixes them so the sequential core is visually correct **before** parallel rendering (W-PAR 002/003) is built on top of it.

It also lands the **log-contract change** (segment-tagged load markers) that W-PAR task 006 (multi-segment display) needs to attribute loads per-segment.

## The three gaps (verified against code)

- **(A)** Mid-chapter XTTS cold-load is not shown as "preparing" — the observed "first letter black, frozen" bug when XTTS is the *second* engine. Root cause: load windows are attributed to a segment by **ambient context**, not identity, and XTTS's load signal is a plain-text line with no segment id.
- **(B)** Chapter/queue progress never pauses and the ETA is not load-aware.
- **(C)** Load durations are **recorded** (`model_load_seconds`) but **never used** for prediction or display.

Full detail and file:line evidence in [01-map.md](01-map.md).

## Folder

| File | Purpose |
|---|---|
| [00-overview.md](00-overview.md) | Task, goal, scope/boundary, success criteria (definition of done) |
| [01-map.md](01-map.md) | The implementation map: parts, connections, invariants, risks |
| [02-roadmap.md](02-roadmap.md) | Ordered tasks, dependency graph, milestones |
| [tasks/](tasks/) | Self-contained, map-linked task files (001–007) |

## Status protocol

Each task file has a `Status:` line (`Not started` / `In progress` / `DONE (date)`). Update it when you pick up / finish a task, and tick the acceptance-criteria boxes. Mirror milestone completion in [../../TASKS.md](../../TASKS.md).

## How to pick up a task

Open the task file in `tasks/` plus [01-map.md](01-map.md). The task file is self-contained (files, anchors, steps, acceptance, map-links). Respect the invariants in the map — especially **INV-2** (warm/cloud groups must never flash "preparing") and **INV-3** (no engine-id branching in core). TDD per testing-standards R1–R4.

## Relationship to other work

- **Gates:** resuming **W-PAR** (002/003) and unblocks **W-PAR 006** (multi-segment display) via the log contract.
- **Must not regress:** W-MIX W1–W4 (XTTS-first preparing path; Voxtral-only no-flash path).
