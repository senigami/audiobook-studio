# Calibration briefing — AD-2: adversarial read of the `resolve_effective_cap` clamp chain

**Activity:** adversarial review · **Gradeable:** semi

## The task

`resolve_effective_cap` can silently return a value lower than what was requested, when a
requested concurrency setting is clamped by a manifest ceiling or a global backstop. Separately,
an engine-class admission gate (`_engine_class_admission_enabled`) gates which semaphore path a
synthesis claim takes.

Do a **hostile read** of the cap-resolution + admission chain end to end. Hunt specifically for:

- Silent-clamp UX bugs (a requested cap quietly lowered with no observable signal).
- A stale default / gate mismatch (does what the code defaults to match what the surrounding
  docs/lessons claim? verify against the actual default logic).
- Off-by-one or keying bugs in the per-engine-id semaphore (it is shared across chapters).
- Any path where a requested cap setting has **no observable effect** at all.

## Read (reason from these, not from memory of the repo)

- `app/orchestration/scheduler/cap_settings.py` — `resolve_effective_cap` (~119)
- `app/orchestration/scheduler/resources.py` — the admission gate (~49–68), the semaphores (~397–429), and ~657, ~783
- `.agent/lessons/INDEX.md` — read the always-on lesson about a raised default; verify it against the code rather than trusting it
- `design-docs/plans/FUTURE_WORK.md` — "Settings UI silent-clamp warning"
- The code-map for how a claim flows: user setting → manifest ceiling → global backstop → admission gate → semaphore keying.

## Produce

A findings list. Each finding: the exact path (`path:line`), the concrete input/state that
triggers it, the wrong observable outcome, and severity. Include the requested-cap-has-no-effect
paths if any exist. If the chain is sound on a given axis, say so and name the strongest assumption
it rests on.

## Discipline

- Verify every claimed bug against the actual code before reporting it — no smells without a path.
- Where the always-on lesson and the code disagree, trust the code and say which is authoritative.
- State confidence per finding; separate demonstrable bugs from judgment calls.
