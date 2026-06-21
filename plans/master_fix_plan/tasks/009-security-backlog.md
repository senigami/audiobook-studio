# 009 — Security backlog (W9)

**Goal:** the pre-release security hardening items (release blockers already shipped; these are the
remaining pre-LAN-hardening items).
**Authoritative source:** [`final_release/12_security_and_opportunities.md`](../../final_release/12_security_and_opportunities.md).

**Open items:**
- ~~**S6** WebSocket auth~~ **DONE (2026-06-21)** — Origin check added to `/ws` upgrade: absent Origin → allow; present Origin → allow only for localhost/127.0.0.1/[::1] or server's own Host; otherwise close(1008). Spec 1.2.3 + revert-checked tests in `test_websocket_broadcast.py`.
- ~~**S7** rate-limiter docs~~ **DONE (2026-06-21)** — limitations documented in the `SimpleRateLimiter`
  docstring + `security.md` §Rate Limiting (→ 1.2.2). No behavior change.
- **S10** secret-aware plugin settings (mask/redact secret fields in schema-driven engine settings).
- ~~**S11** ffmpeg concat quoting~~ **DONE / VERIFIED CORRECT (2026-06-21)** — the finding was wrong;
  the current `'\''` escaping is right (empirically tested, ffmpeg 8.0.1) and the audit's double-quote
  recommendation breaks concat. No code change; regression tests added. See `final_release/12` S11.

## S12 — Dependabot dependency alerts (triaged 2026-06-20)

GitHub flagged **12 open Dependabot alerts** (1 critical, 5 high, 4 moderate, 2 low) on push. **All 12
are npm/frontend; zero are Python/pip.** Triage against the *committed* `frontend/package-lock.json`
(what Dependabot scans) shows most are already remediated in this branch — the alert list lags the
lockfile and is reported against the default branch. **Do NOT fix in this branch right now (owner
call); fix at the dependency-bump step before release** and let the default-branch rescan clear the
stale ones.

**Already remediated in-branch (9 of 12) — stale alerts, no action needed beyond merge:**
- **react-router ×8** (incl. the high RCE via turbo-stream CVE-2026-42211, XSS, DoS; medium open-redirect
  & stored XSS; low CSRF): committed lockfile is **react-router 7.17.0**, above every vulnerable range
  (all were `< 7.15.x`). This is the only *production-runtime* package in the set — and it is already safe.
- **vitest ×1 (the "critical")** CVE-2026-47429 (Vitest UI arbitrary file read/exec): committed lockfile
  is **3.2.6**; the advisory is `< 3.2.6`. Already satisfied. Dev-only test runner regardless.

**Genuinely still vulnerable in-branch (3 of 12) — all dev/build-time, none shipped to production:**
- **vite 7.3.2** → need `> 7.3.4`. Two Windows-only dev-server issues (`server.fs.deny` bypass
  CVE-2026-53571; `launch-editor` NTLM hash disclosure CVE-2026-53632). Build/dev tool — production
  serves the static bundle via uvicorn, not vite.
- **@babel/core 7.29.0** → need `> 7.29.0` (transitive, build-time). Arbitrary file read via
  `sourceMappingURL` (low).
- **js-yaml 4.1.1** → need `> 4.1.1` (transitive, build/tooling). Quadratic-complexity DoS (moderate).

**Risk note:** the one production-facing dep (react-router) is already patched; the remaining three run
only on the developer/build machine and never ship in the FastAPI runtime — and this is a local-first
app (no public multi-tenant surface), so their real-world exposure is low. Still bump them for hygiene.
**Action at release:** `npm update vite` (>7.3.4) + refresh transitive `@babel/core`/`js-yaml` via
`npm audit fix`, rebuild, re-run the suite; confirm Dependabot drops to zero after the default-branch
scan. No production code change required.

**Map links:** W9. Feeds W12 release. Honors INV-1 (`security.md`). CodeQL must stay green (all 53
prior alerts already addressed). S12 is a dependency-hygiene gate, not a runtime-contract change.
**Dependencies:** independent; parallel-safe with 007/008.
**Acceptance:** each item fixed with a revert-checked test where applicable; CodeQL clean; `security.md`
updated if the auth/containment contract changes.
**Out of scope:** Part-2 post-release product backlog (explicitly not gating v2.0.0).
