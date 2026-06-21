# 001 — Foundation cleanup (W1)

**Status: DONE (2026-06-20)** — QW-2/3/4/5/7/8 done; QW-1 partial (see below). Verified green (ruff,
pytest 1800, FE build+lint+test 1375) and re-checked by a 3-lens adversarial review (2026-06-21).
Notes & adjustments:
- **QW-1 is PARTIAL by design.** Removed the 4 confirmed-dead deps (clsx, tailwind-merge, mistralai,
  beautifulsoup4). **Intentionally retained:** `ruff` (dev/CI tool, not app runtime — annotated in
  `requirements.txt`) and the transitive deps `websockets`/`jinja2`/`python-multipart` (the spec's
  "verify-then-remove via clean-venv" check is deferred to the release dependency pass; `python-multipart`
  is the likely keeper — form uploads).
- **QW-2 end-state correct; partly pre-done.** `audiobook.py`/`audit_routes.py`/`text_progress_demo.html`
  deleted here; `app.db`/`database.sqlite` placeholders were already removed in phase 12.3 (1e475d5e) and
  only verified-absent here (the real `DB_PATH` is gitignored).
- **QW-3 parity preserved.** `.coveragerc` precedes `pyproject.toml` in coverage's config search, so its
  settings were authoritative; on deletion its `concurrency=thread`, `show_missing`, and the
  `if self.debug:`/`pass`/`raise ImportError` excludes were migrated into `pyproject.toml` so coverage
  behavior is unchanged (review finding, fixed 2026-06-21).
- **QW-4 read-path verified:** `app/engines/bridge.py` guards the `last_test.json` read with `.exists()`.
- **QW-6 deferred to [005](005-code-simplification.md)** — `components.css` already moved to
  `theme/components.css` in the re-skin; the dead-CSS *deletion* folds into the components.css split there
  (2 of its 5 dead selectors are used by the kept demo styleguide → relocate, don't delete).
- **3 fold-in delete candidates were STALE and kept (verified live):** `app/infra/` (imported by
  `app/core/logging.py` + both plugins' `app_adapter.py`), `frontend/src/api/client.ts` (imported by
  `app/providers/index.tsx`), `frontend/src/api/queries/index.ts` (3 importers — intentional boundary).

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
