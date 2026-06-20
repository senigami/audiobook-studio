# 001 — Foundation cleanup (W1)

**Goal:** remove all low-risk dead weight so later workstreams start from a clean base.
**Authoritative source:** [`simplification/01_quick_wins.md`](../../simplification/01_quick_wins.md)
(newest, 06-19) — execute its QW-1..QW-8 verbatim.

**Also fold in (older, superseded by 06-19 but not all captured in simplification/01):**
- `final_release/06_code_organization_cleanup.md` §1.2 `audiobook.py`, §1.3 `audit_routes.py`,
  §1.4 `text_progress_demo.html`, §1.5 `state.json` tracking check — confirm + delete (QW-2 covers
  the first two; add `text_progress_demo.html` and the `state.json` tracking check).
- `final_release/09_logic_audit.md` dead-code D1–D4 — reconcile against simplification's dead-code
  findings; anything not already in QW-6/QW-8 or task 005, add here.
- `final_release/06` frontend stubs: `app/infra/` NotImplementedError stubs, `frontend/src/api/client.ts`,
  `queries/index.ts` — verify dead, delete.

**Open items checklist:** QW-1 dead deps (`clsx`/`tailwind-merge` + backend `mistralai`/`beautifulsoup4`);
QW-2 legacy scripts; QW-3 `.coveragerc`; QW-4 `last_test.json` gitignore; QW-5 obsolete FE stubs;
QW-6 dead CSS; QW-7 **5 hardcoded-color §2.2 fixes (mandatory)**; QW-8 `shared/` barrels; + the folded
`final_release/06/09` items above.

**Map links:** W1. Unblocks W2 (005) and feeds W12 release dead-code gate. Honors INV-1 (QW-7 is a
§2.2 spec-compliance fix), INV-7.
**Dependencies:** none. Ship first.
**Acceptance:** `ruff check .`, `pytest -q`, `npm -C frontend run build`, lint all green; QW-7 verified
in light+dark; `wiki/Changelog.md` dated entry.
**Out of scope:** anything behavior-changing (that's 002+).
