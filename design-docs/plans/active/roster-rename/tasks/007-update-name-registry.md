# Task 007 — Update the external name registry

Status: pending
Risk: none (external file, additive)
Depends on: Task 006 (needs the OD number for the "assignment date" field)

## Goal

Register this repo's 9 seat names in `~/.claude/orchestration-primer/name-registry.md`. Confirmed
during planning via `grep -n "audiobook-factory" ~/.claude/orchestration-primer/name-registry.md`
that this repo currently has **zero rows** registered there at all (the session-start hook's
warning about this was accurate) — so this task adds fresh rows under the NEW names; there is no
stale old-name row to remove or update.

## Steps

1. Read `~/.claude/orchestration-primer/name-registry.md` to confirm its current row format (don't
   guess the schema — if the file has a header/table structure, match it exactly).
2. If the file doesn't exist yet, create it using the shape documented in the `awaken-orchestrator`
   skill's playbook §7 (per this repo's own CLAUDE.md pointer to that convention) — but it likely
   already exists given other repos on this machine use it; check first.
3. Add one row per seat: `name@repo` qualified (e.g. `Albus@audiobook-factory`), the seat/role it
   holds, status `active`, and the assignment date — use the date of the OD entry written in Task
   006 (not today's date if they differ), per this repo's own convention for backdating registry
   entries to the decision that actually made the hire/rename.
4. Check for collisions: if any of these 9 names (Albus, McGonagall, Newt, Fred, George, Moody,
   Dean, Percy, Hermione) already appears against a DIFFERENT repo in the registry, do not resolve
   it yourself — surface it to the owner and let them decide if a shared name across repos is
   fine (per this repo's own established convention for handling that situation, already used once
   during the OD-0024 retrofit).

## Verification

```bash
grep -n "audiobook-factory" ~/.claude/orchestration-primer/name-registry.md
# expect 9 new rows, one per seat
```

## Acceptance criteria

- [ ] All 9 seats registered, qualified `name@audiobook-factory`.
- [ ] Assignment dates match the Task 006 OD entry's date, not today's date, if those differ.
- [ ] Any name collision against a different repo is surfaced to the owner, not resolved silently.

## Map links

`01-map.md` §"The parts" (item 7).

## Out of scope

Any other repo's rows in this shared file — read-only with respect to everything except this
repo's own 9 new rows.
