# Task 005 — Move the two populated memory-store directories

Status: pending
Risk: none flagged (single mechanical operation) but HIGH cost if done wrong — see `[INV-3]`.
Depends on: Task 001 (final spawn_keys decided)

## Goal

Move (never recreate) the two memory-store directories that currently hold real accumulated
content, to their new spawn-key names. The other 7 seats have no store yet (confirmed via `ls
.claude/agent-memory-local/` during planning — only `abfc-ada`, `abfc-reviewer`, and
`abfc-runner` exist; `abfc-runner` is out of scope, it's a generic executor not part of this
rename).

## Steps

```bash
cd /Users/stevendunn/GitHub-Steven/audiobook-factory
git mv .claude/agent-memory-local/abfc-ada .claude/agent-memory-local/abfc-albus
git mv .claude/agent-memory-local/abfc-reviewer .claude/agent-memory-local/abfc-mcgonagall
```

If these directories are gitignored (check `.gitignore` for `.claude/agent-memory-local` first —
this repo's awakening layer conventions keep some of this local-only), use plain `mv` instead of
`git mv`, since `git mv` on an untracked path will fail or behave unexpectedly. Check first, don't
assume either way.

## Do NOT

- Do not let a fresh `memory: local` auto-create empty `abfc-albus`/`abfc-mcgonagall` directories
  by dispatching the renamed seats BEFORE running this move — that creates the exact orphaned-store
  failure this repo's OD-0024 already documented once. Run this task before any dispatch under the
  new names.
- Do not delete the old directory names after moving — `mv`/`git mv` already removes them as part
  of the move; there should be nothing left named `abfc-ada` or `abfc-reviewer` afterward.

## Verification

```bash
ls .claude/agent-memory-local/
# expect: abfc-albus, abfc-mcgonagall, abfc-runner — NOT abfc-ada or abfc-reviewer
ls .claude/agent-memory-local/abfc-albus/ | wc -l    # expect same file count as abfc-ada had (check before/after)
ls .claude/agent-memory-local/abfc-mcgonagall/ | wc -l
```

## Acceptance criteria

- [ ] `abfc-ada` and `abfc-reviewer` no longer exist as directories anywhere in the repo.
- [ ] `abfc-albus` and `abfc-mcgonagall` exist and contain the SAME file count/content as their
      predecessors (not empty, not freshly created).
- [ ] No dispatch of the renamed orchestrator or reviewer happened before this task ran.

## Map links

`01-map.md` §"The parts" (item 5), `[INV-3]`.

## Out of scope

The other 7 seats' memory stores — they don't exist yet, nothing to move.
