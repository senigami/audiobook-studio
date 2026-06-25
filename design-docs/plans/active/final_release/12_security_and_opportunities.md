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


## CodeQL alert inventory (added 2026-06-10)

**All 53 alerts addressed in code 2026-06-10 (Stage 1d); awaiting scan re-run to confirm closure.** GitHub Advanced Security had **53 open alerts** on the Phase 12.2 PR head: 33 `py/path-injection` (clusters: `app/db/speakers.py`, `app/tts_server/settings_store.py`, voice/bundle routers), 16 `py/stack-trace-exposure` (mostly `app/api/routers/engines.py` returning exception text to clients), 4 `py/polynomial-redos` (`app/utils/text/textops_cleaning.py` regexes). Full list: [audits/codeql_open_alerts_pr123.md](audits/codeql_open_alerts_pr123.md). Execute as part of Stage 1d alongside S1–S5: path-injection fixes follow the constant-selection + resolved-containment pattern used in `app/api/tts_api.py` (commit de15cca5); stack-trace exposures return generic messages and log the detail server-side; ReDoS regexes get linear rewrites or input length caps.

## Part 2 — Product opportunities (post-release backlog, owner to cherry-pick)

Ranked by value-for-effort for the audiobook-author audience:

1. **ACX loudness QA + normalization (M)** — ffmpeg `loudnorm` analysis per chapter, pass/warn/fail column, optional EBU R128 normalize at assembly. Makes Studio output upload-ready for Audible/ACX. Lives in `app/engines/audio_qa.py` + assembly option.
2. **Voice A/B audition panel (S–M)** — render one test sentence across 2–4 variants in parallel, inline compare/accept. Natural fit with the casting work in doc 04.
3. **Keyboard-driven render loop (S)** — shortcuts for render-segment / play-last / next / flag in the Chapter Editor; frontend-only. Pairs with doc 10 U5.
4. **Silence trim & breath control (S)** — `silenceremove` post-step with per-project aggressiveness setting.
5. **Pronunciation lexicon (M)** — per-project + global word→pronunciation map applied pre-synthesis; "test pronunciation" button in the Voice Lab. Huge for fantasy/technical names.
6. **Diff-aware re-render (M)** — hash rendered text per segment; after edits queue only changed segments. Extends the existing revision-safe artifact model.
7. **Dialogue detection & cast suggestions (M)** — regex/light-NLP speaker attribution feeding the Characters tab and the doc 04 casting recommendations, no cloud LLM required.
8. **Onboarding tour (S)** — first-run guided path to first audio; complements doc 10 U13.
9. **Local insights dashboard (S)** — words/hours produced, render speed trends, voice usage; all from existing DB, zero telemetry.
10. **Listening review mode with annotations (L)** — waveform playback, timestamped issue notes that convert to re-render jobs. The biggest workflow gap, but large.
    - *First step (owner request, 2026-06-11):* a **waveform visualization spike** — determine what's needed to render a waveform with a playhead bar on the VCR-style segment player (and anywhere else audio appears), level of effort, and where it's practical (short segment audio: yes; very long chapter audio: evaluate downsampled peaks or skip). Spike only — no implementation commitment yet.
11. **Project templates (S)** — save/restore structure + cast + settings for series authors.
12. **Export presets (M)** — named ACX/podcast/M4B/custom output configs at assembly.
13. **Crash-recovery checkpoints (M)** — persist task state periodically; on boot offer resume/discard for interrupted jobs (extends existing startup reconciliation).
14. **SSML-lite performance markup (M–L)** — `[pause:1s]`, `[whisper]` inline tags normalized to a `SpeakAnnotation` model; engines declare support via manifest capabilities (slots into the doc 02 contract).
