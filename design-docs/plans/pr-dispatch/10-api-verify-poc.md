# PR 10 — TTS Gateway API: verify, review, and a POC client app

**Branch:** `studio2/api-verify-poc`
**Target:** `studio-2.0`
**Size:** M
**Gate:** none. Parallel-safe (mostly read + a new self-contained POC dir).

## Why

The owner wants the external "Studio as a TTS gateway" API (`/api/v1/tts`) **functionality verified,
reviewed, and demonstrated with a POC app** that shows it actually working end-to-end. Today the API
exists and is spec'd, but there's no worked example proving the whole loop (auth → submit → poll →
fetch audio) from a real client's perspective.

## The API surface (what you're verifying)

`app/api/tts_api.py` mounts a FastAPI sub-app at `/api/v1/tts`, guarded by `verify_api_key` +
`rate_limit` (`app/core/security.py`), submitting `ApiSynthesisTask`s through the orchestrator.
Endpoints:
- `GET /engines`, `GET /engines/{engine_id}` — capability discovery
- `POST /synthesize`, `POST /preview` — submit a synthesis/preview job
- `GET /jobs/{job_id}` — poll status
- `GET /jobs/{job_id}/audio` — fetch the rendered audio
- `GET /openapi`, `GET /docs` — the API's own OpenAPI + docs

## Read first

- `app/api/tts_api.py` (routes, request/response models, `_validate_voice_ref`).
- `app/core/security.py` (`verify_api_key`, `rate_limit`) — the auth + throttle contract.
- `app/orchestration/tasks/api_synthesis.py` (`ApiSynthesisTask`) — what actually runs.
- `docs/plugin-sdk/studio-as-tts-gateway.md` if present, and `design-docs/specs/` for the API/gateway
  spec (check `api-conventions.md` and the router index in `specs/README.md`).
- The `TTS_API_PRIORITY` scheduling behavior (`studio_first` default) in
  `app/orchestration/scheduler/policies.py` — API jobs share the queue with studio jobs.

## Part 1 — Verify (behavior)

Exercise the full loop against a running instance and record results:
1. Launch the app (`./run.sh --no-reload` or `preview_start`), confirm the TTS server boots.
2. With a valid API key: `GET /engines` lists engines; `POST /synthesize` returns a job id;
   `GET /jobs/{id}` progresses to done; `GET /jobs/{id}/audio` returns valid audio (WAV per render
   convention — confirm the actual content-type/format).
3. Negative paths: missing/invalid API key → 401/403; rate limit → 429 after the threshold; invalid
   `voice_ref` → clean 4xx (not a 500); unknown `job_id` → 404.
4. Confirm API jobs interleave with studio jobs per `TTS_API_PRIORITY` (don't starve or freeze the
   studio queue).
Capture request/response transcripts for the PR.

## Part 2 — Review (correctness + security)

Run a focused review of the gateway path (use the `review-adversarial` / `security-audit` skills):
- Auth: is `verify_api_key` applied to **every** state-changing/audio route (no unguarded endpoint)?
- Path safety: `GET /jobs/{id}/audio` must serve only via the contained-file helpers — no traversal
  from a crafted job id / voice ref. `_validate_voice_ref` actually rejects bad refs.
- Rate limiting: correct per-key accounting, no bypass.
- Info leakage: errors don't leak internal paths/stack traces; job ids aren't guessable into other
  users' audio.
- Contract: responses match the versioned API spec; version declared + validated.
Report findings; fix confirmed blockers in the same PR (small, contained). File anything large as a
follow-up rather than scope-creeping this PR.

## Part 3 — POC client app

Build a **self-contained, minimal** client that demonstrates the loop, so a developer can see the
API work without reading the source. Recommended:
- Location: a new `examples/tts-gateway-poc/` dir (or `docs/plugin-sdk/` example area if that's where
  gateway docs live — match the existing convention; check first).
- A single small script (Python `requests` or a tiny Node/`fetch` script) that: reads a base URL +
  API key from env, lists engines, submits a short synth, polls to completion, downloads the audio,
  and prints where it saved it. Plus a `README.md` with run instructions and expected output.
- Keep it dependency-light and clearly labeled as an example (not part of the app runtime, not
  imported by `app/`). Do **not** hardcode secrets — read the key from env.
- Optional stretch (only if it stays simple): a tiny static HTML page that does the same via
  `fetch`, runnable against a local instance — but a script is enough for a POC.

## Verify

- Backend suite + ruff green (any fixes from Part 2 must have tests; revert-check bug-fix tests per R1).
- The POC runs against a live local instance and produces audio — capture the terminal output +
  resulting file for the PR. This is the deliverable's proof.
- If Part 2 changed behavior, bump the API spec + changelog.

## Definition of done

- A verification report (Part 1 transcripts + Part 2 findings/fixes) in the PR body or a doc under
  `design-docs/`.
- A runnable POC client committed with a README; demonstrated working against a live instance.
- Any confirmed security/correctness blocker fixed with a revert-checked test; larger items filed.
- Code-map changelog-queue entry if mapped source changed.
- PR via `write-pr` → `studio-2.0`.
