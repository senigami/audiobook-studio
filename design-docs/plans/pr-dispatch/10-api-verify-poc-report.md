# PR 10 — TTS Gateway API: verification report

**Scope:** verify the external "Studio as a TTS gateway" API (`/api/v1/tts`), review it
for correctness/security, and ship a runnable POC. Per the PR's own guidance, large
issues are **filed as follow-ups** rather than fixed here; only small contained gateway
fixes land in this PR.

**Method:** the API was driven as a real external HTTP client against a live local
instance (`uvicorn run:app` on `:8123`, managed TTS server on `:7862`). "External" here
means the transport path — every call goes through the full `verify_api_key` →
`rate_limit` → sub-app → orchestrator stack a remote client would hit; localhost does not
shortcut any of it.

---

## Bottom line

| Area | Result |
|------|--------|
| Auth (401/403), engine discovery, input validation, negative paths (404/400), rate-limit (429) | ✅ **Verified** — all correct, no info leaks |
| POC client (Python + browser) | ✅ **Delivered** (`examples/tts-gateway-poc/`) |
| Review of the gateway path | ✅ **Done** — 1 blocker + 4 should-fixes, all fixed in this PR with tests |
| Happy path (real audio **through the gateway**) | ⛔ **Broken by two core-synthesis bugs** (BUG 1, BUG 2) — **filed as follow-ups**, not fixed here |
| Real audio at the **engine** layer | ✅ Proven (see below) — the engine renders; the break is in the gateway→server dispatch/readiness path |

---

## Part 1 — Verify (behavior)

### Negative paths — all PASS, no information leakage

Captured live (`scratchpad/verify/negative-paths.txt`):

| # | Check | Expected | Actual | Body |
|---|-------|----------|--------|------|
| a | Missing API key → `GET /engines` | 401 | **401** | `Invalid or missing API key.` |
| b | Invalid API key → `GET /engines` | 401 | **401** | `Invalid or missing API key.` |
| c | Unknown job id → `GET /jobs/does-not-exist` | 404 | **404** | `Job not found.` |
| d | Unknown engine → `GET /engines/bogus` | 404 | **404** | `Engine 'bogus' not found.` |
| e | `voice_ref` traversal `../../../../etc/passwd` | 400 | **400** | `voice_ref path is not within an allowed directory.` |
| f | `voice_ref` `.pth` | 400 | **400** | `voice_ref must not reference a pre-computed latent (.pth) file.` |
| g | Unknown voice name | 404 | **404** | `Voice profile 'no-such-profile' not found.` |
| h | Bad `output_format: "exe"` | 400 | **400** | `Unsupported output format.` |

No negative-path response leaked a filesystem path or stack trace. No `500`-where-`4xx`-expected.

### Rate limiting — PASS

70 rapid `GET /engines` with a valid key from one IP (`scratchpad/verify/rate-limit.txt`):
`SUCCESS(200) count=24 ; first 429 at request #25`. The limiter (30/min per IP; the
window was already partly spent by prior polling) fired correctly with a clean
`Too many requests…` body.

### Auth toggle — PASS

With `tts_api_enabled=False`, every route (including `/docs`, `/openapi`) returns `403`;
with a key set and none/wrong supplied, `401`. Confirmed by the endpoint suite.

### Happy path — real audio

- **Engine layer: WORKS.** Driving the managed TTS server directly
  (`POST 127.0.0.1:7862/synthesize`) with the exact request the gateway forwards produced
  valid audio: `tC.wav` — 265,260 bytes, **5.53s**, 24 kHz mono, `audio/wav`;
  `tB.wav` — 186,924 bytes / 3.89s; `direct_infer.wav` — 224,812 bytes / 4.68s.
- **Gateway path: BROKEN.** `POST /api/v1/tts/synthesize` returns `500 {"detail":"Synthesis
  failed."}` (inline) or a job that polls to `failed` (queued) — see BUG 1 / BUG 2. The
  job lifecycle itself (submit → `job_id` → poll → status transitions) works; only the
  synthesis dispatch fails.

### Interleaving (`TTS_API_PRIORITY`)

Could not be demonstrated end-to-end because gateway synthesis fails for every job (both
terminate `failed`). The queue/job machinery functions; the priority policy has unit
coverage in `tests/orchestration/`. Re-verify once BUG 1/BUG 2 are fixed.

---

## Part 2 — Review (correctness + security)

Focused review of `app/api/tts_api.py`, `app/core/security.py`,
`app/orchestration/tasks/api_synthesis.py`. **Sound:** auth is applied to every route
including the self-served `/docs` + `/openapi`; `_validate_voice_ref` correctly rejects
traversal, absolute-outside, symlink-escape, `.pth`, and Windows separators; rate-limit
accounting is correct; the error envelope matches `api-conventions.md`.

### Fixed in this PR (small, contained — all with revert-checked tests)

| ID | Severity | Problem | Fix |
|----|----------|---------|-----|
| **R1** | **blocker** | Queued-job download flow entirely non-functional: `/jobs/{id}` and `/jobs/{id}/audio` gated on `job.status == "completed"`, but the terminal-success `Status` is `"done"` (`app/db/models.py`); and `getattr(job, "payload", {})` is always `{}` (no such field) so `output_path` was unreachable. Shipped with **no completed-download test**. | Compare against `"done"`; reconstruct the audio path from `job_id` + allowlisted ext via `contained_path` (no reliance on a non-existent field). |
| R2 | note→proactive | `/jobs/{id}` returned `getattr(job, "message", None)` — currently always `None` only by accident (Job has no `message` field). A future wiring to `job.error`/`job.reason_code` would leak raw exception text (internal paths / server URL), violating `api-conventions.md`. | Return a fixed generic message (`_public_job_message`) keyed only on status; never surface raw error text. |
| R7a | should-fix | `/preview` rejected only `len > 500`, so a 500-char body was delegated and **queued** (inline threshold is `< 500`), contradicting "always inline". | Reject `>= 500`. |
| R7b | should-fix (DoS) | `SynthesisRequest.text` had no `max_length` — unbounded body accepted onto the queue. | `Field(min_length=1, max_length=100_000)`. |
| R4 | convention | `resolve()` + `is_relative_to()` guard violated the repo's `normpath`+`startswith` / `contained_path` path-barrier convention (CodeQL shape). Not exploitable (server-generated paths). | Switched inline + audio paths to `contained_path`. |

### Filed as follow-ups (out of PR-10 scope — see below)

- **BUG 1**, **BUG 2** (happy-path blockers), and a minor **job-id enumeration** note
  (`GET /jobs/{id}` reveals existence/status of any job id, incl. Studio jobs; audio
  serving is safely confined to `TRANSIENT_DIR/api`, so no cross-serving of Studio audio).

---

## Follow-up bugs (filed, NOT fixed here)

### BUG 1 — XTTS is permanently gated `needs_setup`; all synthesis returns 503

The managed TTS server runs in the app venv (`./venv`; watchdog spawns it with
`sys.executable`). Its readiness check `app/tts_server/plugin_loader.py::_check_dependencies`
reads `plugins/tts_xtts/requirements.txt` — which lists the heavy inference deps
(`torch`, `coqui-tts`, `transformers`, …) — and looks for them **in `./venv`**. But
`run.sh` installs those deps **only** into `~/xtts-env` (line 318), never `./venv`
(line 316). So `dependencies_satisfied=False` → `engine_status()` returns `needs_setup`
→ `app/tts_server/server.py::/synthesize` rejects with `503`, even though `verify()` and
`check_env()` pass. This is reproducible from a clean `run.sh` install and is **not**
gateway-specific — it sits below the gateway, so it affects normal Studio renders too.
Root cause: the same `requirements.txt` is both "what to install into the external env"
and "what the server-venv readiness check verifies" — the two environments are conflated.

*Verified independently at the code + `run.sh` level for this report.*

### BUG 2 — Gateway cannot wire an XTTS voice through, and dispatch fails silently

- `app/engines/bridge_remote.py` forwards the API `voice_ref` straight to the server with
  no profile-name → `voice_profile_dir` resolution, so a valid profile name (which the
  API's `_validate_voice_ref` accepts) reaches the server as a literal path and fails.
- Even with a valid absolute `.wav` `voice_ref` (which the server accepts when called
  directly — see `tC.wav`), the full gateway path still returns `500` and writes no file,
  with no orchestrator error logged. The failure is isolated to
  `orchestrator.submit → _dispatch` in the web process and was not root-caused in a
  read-only verify pass.

**Note:** XTTS has **no built-in-voice fallback** — `xtts_generate` / `_resolve_voice_inputs`
hard-require a `speaker_wav` or `voice_profile_dir`. A no-`voice_ref` request cannot
succeed; the API should either require a voice or the gateway should supply a default.

---

## Part 3 — POC client

`examples/tts-gateway-poc/` — `poc_client.py` (Python `requests`), `index.html` (browser
`fetch`), `README.md`, `.env.example`. Both clients read base URL + key from env (no
hardcoded secrets), and handle the API's two-mode `/synthesize` behavior (inline `< 500`
chars, queued+poll `>= 500`). The queued path (fixed by R1) is unit-tested; end-to-end
audio through the POC is blocked only by BUG 1/BUG 2 and will work once those land.

---

## Artifacts

Live-run transcripts and audio proof: `scratchpad/verify/` — `negative-paths.txt`,
`rate-limit.txt`, `server.log`, and engine-layer audio `tC.wav` / `tB.wav` /
`direct_infer.wav`. (Scratchpad is session-local; the evidence is embedded above.)
