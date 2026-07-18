# 12 — Security Hardening & Product Opportunities

Part 1: code-verified security findings (2026-06-10), severity-rated for both localhost use and the LAN/public 2.0 release — fix the "release blocker" set before Phase 13 ships. Part 2: post-release product ideas not already covered in `design-docs/plans/` (owner picks; none gate the release).

Note: this audit found live code under `app/orchestration/tasks/` (e.g. `api_synthesis.py`) — reconcile with doc 06's "empty package" item before deleting anything there.

## Part 1 — Security

### Release blockers (fix in Phase 12.2)

- [x] **S1. API key returned in plain text by unauthenticated endpoints** — `app/api/routers/system.py:220` (`GET /api/system`) and the `/api/home` settings inline (~line 92) return `tts_api_key` raw. Redact (`"***"` if set) in every settings-bearing response.
  *Accept:* grep responses — no endpoint returns the raw key; key entry remains write-only from the UI.
- [x] **S2. Timing-unsafe API key comparison** — `app/core/security.py:31`. Use `hmac.compare_digest(credentials.credentials, expected_key)`.
- [x] **S3. Zip path traversal (Windows entries)** — `app/tts_server/server.py:770-772` validates with `PurePosixPath`, which doesn't split backslash entries (`foo\..\..\x`); latent traversal on Windows. After `extractall`, verify every extracted file resolves inside the staging dir before `staging_dir.rename(target_dir)`.
  *Accept:* unit test with a crafted backslash-entry zip is rejected.
- [x] **S4. `voice_ref` path not contained** — `app/api/tts_api.py:53` → `app/orchestration/tasks/api_synthesis.py:151,169` pass caller-supplied paths to the engine unchecked. If it contains a separator, resolve + assert containment in `VOICES_DIR`/`TRANSIENT_DIR`; otherwise resolve via the voice registry.
- [x] **S5. Plugin trust boundary undocumented + requirements auto-install unrestricted** — `app/tts_server/plugin_loader.py:606-706` (plugins run unsandboxed in the TTS Server process) and `app/tts_server/server.py:323-398` (`pip install -r` accepts `git+`/URL lines even though `_check_dependencies` skips them). For 2.0: (a) pre-install confirmation dialog listing engine_id, display_name, and full dependency lines; (b) state the trust model explicitly in the plugin contract (doc 02) and wiki — installing a plugin = running its code; (c) post-release candidate: checksum/signing for "verified" plugins.

### Hardening (before enabling LAN binding by default)

- [x] **S6. WebSocket `/ws` unauthenticated** — `app/api/web.py:202-234`. Origin check on upgrade: absent Origin → allow (non-browser clients); present Origin → allow only if host is localhost/127.0.0.1/[::1] or matches server's Host header; otherwise close(1008). LAN exposure documented in `security.md` §S6.
- [x] **S7. Rate limiter in-memory, keyed by IP** — `app/core/security.py:40-78`. Acceptable for 2.0; restart-reset and NAT-shared-key limits **documented** (2026-06-21) in the `SimpleRateLimiter` docstring and `security.md` §Rate Limiting → 1.2.2. No behavior change.
- [x] **S8. `safe_basename("…/")` returns ""** — `app/utils/pathing.py:6-7`. Raise on empty result (caller at `voices_actions.py:231` is currently saved by a downstream containment check).
- [x] **S9. Backup filename check cosmetic** — `app/api/routers/projects_backups.py:199,244,308`: `endswith(".zip")` passes `../x.zip`; real containment comes from the scandir name-match. Replace with `os.path.basename(filename) == filename` for defense-in-depth clarity.
- [x] **S10. Secret-aware plugin settings** — `app/tts_server/settings_store.py` stores engine API keys as plain JSON with no secret flag. Add `"secret": true` support in `settings_schema.json` (doc 02 contract): masked on read, never logged. Encryption-at-rest is a post-release candidate.
- [x] **S11. ffmpeg concat quoting — VERIFIED CORRECT, no change (2026-06-21).** The original finding
  was **wrong**. `_ffmpeg_concat_entry` (`app/engines/audio_ops.py:140`) uses the documented
  ffmpeg-utils single-quote escaping (`'` → `'\''`), which is exactly right for the concat demuxer.
  Empirically tested on ffmpeg 8.0.1: the current escaping concatenates `O'Brien.wav` correctly
  (output = both segments); the audit's recommended **double-quoted paths FAIL** entirely
  (`Impossible to open '"plain.wav"'`). Applying the recommended "fix" would have broken all audio
  assembly. Locked in by regression tests in `tests/engines/test_audio_ops_finalize.py` (unit + a
  real-ffmpeg integration test, skipped when ffmpeg is absent).
  *(ffmpeg invocation overall is list-based, no shell=True — no injection found.)*


### 2026-07-09 — Gateway API surface verification (Phase 12 backlog: "Verify system API surface for future third-party/LLM controller plugins")

Audited `app/api/tts_api.py` (the external "Studio as a TTS gateway" sub-app at `/api/v1/tts`) against `docs/studio-as-tts-gateway.md` and `design-docs/specs/api-conventions.md` for adequacy as a programmatic surface for a third-party/LLM controller (submit job → poll status → retrieve result → discover engines/voices, with consistent auth/errors).

**Adequate, with one gap found and fixed:**

- Engine/voice discovery: `GET /engines` (list) and `GET /engines/{engine_id}` (detail) both exist and are implemented — a controller can discover available engines/voices before submitting a job.
- Job lifecycle without polling `/api/jobs`: `POST /synthesize` returns either an inline audio response (< 500 chars) or a `job_id` + `poll_url`; `GET /jobs/{job_id}` reports status/progress/message; `GET /jobs/{job_id}/audio` retrieves the completed result. This is a complete, self-contained job lifecycle inside the `/api/v1/tts` gateway — no dependency on the internal Studio `/api/jobs` surface.
- Errors are structured and consistent: FastAPI's standard `{"detail": "..."}` shape throughout, with correct status codes (400 invalid format/voice_ref, 401 bad/missing key, 403 API disabled, 404 unknown engine/job/voice profile, 410 expired audio, 422 preview-too-long, 429 rate limited, 500 synthesis failure).
- Versioning: URL-prefixed (`/api/v1/tts`) plus an explicit `version="1.0.0"` field on the FastAPI sub-app. Adequate for a third party to depend on without breakage risk — a `/api/v2/tts` prefix is the natural path for a future breaking change. No dedicated ADR exists for this (not required — it's covered by the URL-version convention already in place).
- `docs/studio-as-tts-gateway.md` vs. code: the walkthroughs (engine discovery, inline/queued synthesize, job polling/download) all match the implemented routes. Doc omits `GET /engines/{engine_id}` and `POST /preview` (both implemented, both documented in `design-docs/specs/api-conventions.md` instead) — cosmetic, not a functional gap. Doc also lists the default port as 8000; the app in fact serves on 8123 per `CLAUDE.md`/`run.sh` — flagged here as a minor doc inaccuracy, not fixed in this pass (out of scope for this backlog item; someone touching that doc for another reason should correct it).
- Note: the correct path for this doc per `CLAUDE.md`/`AGENTS.md` conventions is `docs/plugin-sdk/studio-as-tts-gateway.md`; it currently lives at `docs/studio-as-tts-gateway.md` (one level up). Not moved in this pass — flagged for whoever next touches the plugin-sdk docs tree.

- [x] **S12. Auto-generated `/docs` and `/openapi` routes on the TTS gateway sub-app were NOT covered by `verify_api_key`/`rate_limit`** — `app/api/tts_api.py`. `design-docs/specs/api-conventions.md:143` states "All routes require `verify_api_key` + `rate_limit`", but FastAPI registers its auto-generated docs/openapi/redoc routes via `add_route()` (plain Starlette routing), which bypasses FastAPI's dependency-injection system entirely — so the `dependencies=[...]` passed to the `FastAPI(...)` constructor never applied to them. Confirmed empirically: `GET /api/v1/tts/docs` and `GET /api/v1/tts/openapi` returned `200` with no `Authorization` header, and even when `tts_api_enabled=False`. Severity: schema/route-shape disclosure only (no voice/job/audio data reachable through these routes) but a real, verifiable spec/code drift and a real gap in "enforced on every route."
  *Fix:* `docs_url`/`openapi_url`/`redoc_url` disabled on the `FastAPI()` constructor; `/docs` and `/openapi` are now served as ordinary routes on `router` (which is included into the sub-app and therefore inherits the same `verify_api_key` + `rate_limit` dependencies as every data route). Verified: both now return `401` unauthenticated, `403` when `tts_api_enabled=False`, and `200` with a valid key. Regression tests: `tests/api/test_api_tts_api.py::test_docs_requires_auth`, `::test_openapi_requires_auth`, `::test_docs_rejected_when_api_disabled`, `::test_docs_and_openapi_accessible_with_valid_key` (revert-checked red on pre-fix code per testing-standards.md R1).

## CodeQL alert inventory (added 2026-06-10)

**All 53 alerts addressed in code 2026-06-10 (Stage 1d); awaiting scan re-run to confirm closure.** GitHub Advanced Security had **53 open alerts** on the Phase 12.2 PR head: 33 `py/path-injection` (clusters: `app/db/speakers.py`, `app/tts_server/settings_store.py`, voice/bundle routers), 16 `py/stack-trace-exposure` (mostly `app/api/routers/engines.py` returning exception text to clients), 4 `py/polynomial-redos` (`app/utils/text/textops_cleaning.py` regexes). Full list: [audits/codeql_open_alerts_pr123.md](audits/codeql_open_alerts_pr123.md). Execute as part of Stage 1d alongside S1–S5: path-injection fixes follow the constant-selection + resolved-containment pattern used in `app/api/tts_api.py` (commit de15cca5); stack-trace exposures return generic messages and log the detail server-side; ReDoS regexes get linear rewrites or input length caps.

## Part 2 — Product opportunities (post-release backlog, owner to cherry-pick)

**Moved 2026-07-14 to `design-docs/plans/FUTURE_WORK.md`**
— the canonical, standalone home for post-2.0 ideas (this doc's Part 1 security content is
release-scoped and stays here; product-opportunity ideas don't belong mixed in with security
findings, and `active/` gets archived once the release ships while the backlog should persist).
Add new post-release ideas there, not here.
