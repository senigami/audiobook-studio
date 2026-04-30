# Codex and Antigravity Collaboration

Use this file when Antigravity/Gemini is working as an implementation worker whose output will be reviewed by Codex and the user.

## Role

- Act as a bounded worker, not the architect of last resort.
- Follow the user or Codex prompt exactly before expanding scope.
- If a requirement is ambiguous, choose the smallest safe implementation and state the assumption.
- Prefer boring, explicit, testable code over clever abstractions.

## Handoff Discipline

- Start by identifying the exact files and behavior you intend to touch.
- Do not modify unrelated files, formatting, or tests opportunistically.
- Keep temporary reproduction files out of the final diff unless explicitly requested.
- Remove scratch files, root `node_modules`, transient DB files, logs, and command output files before handoff.
- Never delete tracked files as cleanup unless the prompt explicitly asks for that deletion.
- End every response with: changed files, tests run, exact pass/fail result, remaining risks, and any artifacts left behind.

## Implementation Rules

- Preserve user and Codex changes. Do not revert work you did not make.
- Use existing APIs and seams before creating new ones.
- Keep UI components generic. Do not put queue-, chapter-, or segment-specific policy inside reusable display components.
- Use status as the source of truth for job phase. Do not reintroduce progress sentinel hacks such as `0.01` meaning "running".
- New durable Studio 2.0 state belongs in SQLite, not `state.json`.
- Legacy `state.json` reads are acceptable only as migration or compatibility shims, and should remove migrated data when safe.
- For render performance metrics, only successful terminal `done` runs may train history. Failed, cancelled, running, cached, or partial runs must not.
- ETA fields from backend progress updates are `remaining_from_update` unless explicitly documented otherwise.
- Avoid stale event rebroadcasts. Only include ETA/progress metadata when it is fresh or intentionally persisted.

## Testing Rules

- Add or update tests for every behavior change.
- Do not weaken tests just to match a broken implementation.
- If a test expectation changes, explain the product reason.
- Run the narrow relevant tests first, then the broader targeted suite.
- For this repo, backend verification usually starts with:
  `./venv/bin/python -m pytest tests/test_startup_eta.py tests/test_progress_logic.py tests/test_websocket_broadcast.py`
- For queue/progress frontend verification, use:
  `cd frontend && PATH=$PATH:/opt/homebrew/bin npx vitest run src/components/PredictiveProgressBar.test.tsx src/components/GlobalQueue.test.tsx src/components/queue/GlobalQueueFiles.test.tsx`
- If full tests or linting are requested and fail, report the exact failing test, error, and likely cause.

## Review Readiness

- Before handoff, run `git status --short` and inspect the diff.
- Flag unexpected dirty files instead of silently including them.
- If a root-level dependency directory or transient DB appears, treat it as an artifact to clean or explicitly call out.
- Do not claim "no further changes required" if artifacts, failing tests, unverified migrations, or unclear behavior remain.
