# 009 — Security backlog (W9)

**Goal:** the pre-release security hardening items (release blockers already shipped; these are the
remaining pre-LAN-hardening items).
**Authoritative source:** [`final_release/12_security_and_opportunities.md`](../../final_release/12_security_and_opportunities.md).

**Open items:**
- **S6** WebSocket auth (pre-LAN hardening — the `/ws` channel currently has no auth gate).
- **S7** rate-limiter docs.
- **S10** secret-aware plugin settings (mask/redact secret fields in schema-driven engine settings).
- **S11** ffmpeg concat quoting (assembly path — shell-safe argument handling).

**Map links:** W9. Feeds W12 release. Honors INV-1 (`security.md`). CodeQL must stay green (all 53
prior alerts already addressed).
**Dependencies:** independent; parallel-safe with 007/008.
**Acceptance:** each item fixed with a revert-checked test where applicable; CodeQL clean; `security.md`
updated if the auth/containment contract changes.
**Out of scope:** Part-2 post-release product backlog (explicitly not gating v2.0.0).
