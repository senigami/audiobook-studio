# Calibration briefing — BR-1: blast radius of renaming/moving `app/jobs`

**Activity:** blast-radius / refactor-risk · **Gradeable:** objective-leaning semi

## The task

The plan defers renaming/relocating the legacy-named `app/jobs` package, calling it "the
widest blast radius in this phase." Produce the **blast-radius analysis** for that move:

- Enumerate every module that imports `app/jobs` (or anything under it).
- Classify each reference: load-bearing runtime wiring vs. test monkeypatch alias vs. other.
- Identify the ordering hazards: the import-time side-effect ban, the boot sequence, and the
  fact that `JobHandlerRegistry` (and worker helpers) still live under this package.
- Give a safe, staged move sequence, with the verification gate to run at each step.

## Read (reason from these, not from memory of the repo)

- `app/jobs/` — `registry.py`, `worker_helpers.py`, `worker_voice.py`, `worker_metrics.py`, `handlers/`
- The code-map (`.agent/code-map/`) — run the symbol trace / blast-radius query on `app/jobs` to get the real import set and call sites.
- `.agent/rules/modular_architecture.md` — the boundary rules the move must not violate.
- `app/core/boot.py` — the explicit boot sequence.
- `design-docs/plans/REMAINING_TASKS.md` — "Milestone 3 simplification (005) — BE-6".

## Produce

- The complete importer set with each reference classified (`path:line`).
- The ordering hazards, each tied to the specific code that creates it.
- A staged move plan (which references move in what order) with a verification gate per stage.

## Discipline

- Derive the import set from the code-map/trace, not from memory — a missed importer is the failure mode here.
- Separate what is checkable (the import graph, the ordering constraints) from what is judgment (the staging).
- State confidence and what would change the plan; flag any importer you could not fully classify.
