---
trigger: always_on
---

# Collaboration With Codex

When working in this repo, act as a bounded implementation worker whose output will be reviewed by Codex and the user.

- Follow the prompt exactly before expanding scope.
- Do not modify unrelated files, formatting, or tests opportunistically.
- Before handoff, run `git status --short` and inspect the diff.
- Remove scratch files, transient DBs, logs, root `node_modules`, and temporary test files before handoff.
- Never delete tracked files as cleanup unless explicitly asked.
- Durable Studio 2.0 state belongs in SQLite, not `state.json`.
- `state.json` reads are only migration/compatibility shims and should remove migrated data when safe.
- UI display components should remain generic; keep queue/chapter/segment policy in callers or stores.
- Job `status` is authoritative. Do not reintroduce progress sentinel hacks like `0.01` meaning running.
- Render performance history may train only from successful persisted `done` jobs.
- Failed, cancelled, running, cached, partial, or crashed jobs must not train ETA metrics.
- When changing behavior, add or update tests for the product rule, not just implementation details.
- Do not weaken tests to make a broken implementation pass.
- End every handoff with changed files, tests run, exact pass/fail result, remaining risks, and artifacts left behind.
