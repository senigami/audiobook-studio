# Calibration briefing — AR-1: VRAM/CPU-aware dynamic concurrency auto-throttle

**Activity:** architecture / design decision · **Gradeable:** semi

## The task

Each additional concurrent XTTS worker loads its own model copy into VRAM, so a too-high
`tts_parallel_cap` risks an out-of-memory crash mid-render (which loses in-flight work). A
too-low cap wastes throughput.

Design a mechanism whereby the **effective** concurrency cap can drop below the user's
configured maximum under live memory pressure, and recover as pressure eases. Your design
must decide:

- Where memory sampling lives, and how it feeds the existing cap-resolution point.
- Hysteresis — how to avoid oscillation (rapid throttle down/up).
- How a throttle-down is surfaced to the user: visible, not a silent stall.
- The failure mode if sampling itself fails (no reading available).

## Read (reason from these, not from memory of the repo)

- `app/orchestration/scheduler/cap_settings.py` — `resolve_effective_cap` (~119)
- `app/orchestration/scheduler/resources.py` — `get_engine_id_semaphore` / `get_engine_semaphore` (~397–429), `MAX_GLOBAL_CONCURRENT_SYNTHESIS`
- `.agent/rules/modular_architecture.md` — the boundaries your design must respect
- `design-docs/plans/FUTURE_WORK.md` — "Concurrency / rendering" section
- The code-map (`.agent/code-map/`) for how cap resolution and the semaphores are wired.

## Constraints your design must respect (repo rules, not hints)

- The single-writer cap-resolution chokepoint must remain the one place effective cap is decided.
- Importing a module must not start threads or sampling loops (side-effect ban — see `modular_architecture.md`); sampling belongs behind the explicit boot/orchestration path.
- Core code must not branch on engine IDs for behavior.

## Produce

A concrete design: the sampling source + cadence + where it lives; the exact integration
point with `resolve_effective_cap`; the hysteresis rule; the visibility mechanism; the
sampling-failure fallback. Note the interaction with any per-chapter/per-engine semaphore.

## Discipline

- Ground every claim about current wiring in the actual code (`path:line`).
- Where the shape is a judgment call, say so and give your reasoning and the alternative you rejected.
- State confidence and what would change the design.
