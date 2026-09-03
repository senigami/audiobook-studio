# Task 018 — ST-4 spec bumps + CI regression guard

DONE — 2026-07-10 (commits `374cd130,dbc3b135,20c31386`, per `../status.json`). `code-organization.md`
→ 1.2.0 and `design-system.md` → 1.14.0 (changelog rows added); CI guard
`scripts/check_hardcoded_styles.py` wired into `.github/workflows/ci.yml` (exits 0 clean; build
green). Token-gap findings were captured in this task's completion note during execution.
