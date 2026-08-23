# Git hooks

Tracked so every clone gets them. Git will not run hooks out of a fetched repo on its own —
cloning must never execute someone else's code — so each clone opts in once:

```bash
git config core.hooksPath tools/git-hooks
```

That one line replaces `.git/hooks/` wholesale, so both hooks here take over together.

- **`pre-commit`** — applies Ruff and ESLint auto-fixes and re-stages the files that were
  already staged.
- **`pre-push`** — runs the repo's gates against the files changed since the upstream base:
  tracked-link resolution, Ruff, pytest, ESLint, Vitest.

Two things not to change without reading why:

- **Each gate runs as its own command with its status captured separately.** No `&&` chains
  and no `set -e`. A chain stops at the first failure while still printing a status, so a gate
  that never ran looks exactly like one that passed.
- **The upstream fallback prefers `origin/studio-2.0`, not `origin/main`.** `main` is still the
  v1 line; diffing a new branch against it drags in the whole v1/v2 divergence and the gates
  then lint thousands of unrelated files, which reads as a hang.

`--no-verify` still skips these. That is deliberate: this is a speed bump against forgetting,
not a wall against deciding. Bypassing it is something to say out loud, not leave implied.
