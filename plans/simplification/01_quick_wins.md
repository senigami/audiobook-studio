# Phase 0 — Quick wins (low-risk, high-confidence cleanup)

> Map: [00_overview.md](00_overview.md). All tasks here are independent, behavior-preserving, and
> verified. Ship as small bisectable commits. End with `./venv/bin/python -m pytest -q`,
> `npm -C frontend run build`, and `ruff check .` green.

---

## QW-1 — Remove dead dependencies

**Why:** declared but imported nowhere. Confirmed by repo-wide grep (zero import sites).

**Frontend (confirmed dead — `frontend/package.json`):**
- `clsx` `^2.1.1` and `tailwind-merge` `^3.4.0` — no imports in `frontend/src`, no Tailwind installed.

```
cd frontend && npm uninstall clsx tailwind-merge
```
Remove both lines from `package.json`, commit the updated `package-lock.json`.

**Backend (`requirements.txt`):**
- **Confirmed unused** (zero imports in `app/` + plugins): `mistralai`, `beautifulsoup4`. Remove.
- **CLI-only tool:** `ruff` — move to a dev-only requirements section if one exists, else leave with a
  comment; harmless but not a runtime dep.
- **Verify-then-remove (likely transitive via FastAPI/uvicorn/starlette):** `websockets`, `jinja2`,
  `python-multipart`. Do **not** blind-remove — in a clean venv, remove → `pip install -r
  requirements.txt` → boot the app + run the suite; restore any that break. `python-multipart` is
  required for form uploads (the app has multipart upload endpoints) so it is the most likely keeper.

**Verify:** `npm -C frontend run build` (fe); clean-venv boot + `pytest -q` (be).
**Spec impact:** none.

---

## QW-2 — Delete legacy top-level scripts + empty placeholders

**Why:** `audiobook.py` (header: *"standalone reference script; the main application uses
app/engines.py instead"*) and `audit_routes.py` are v1 utilities imported nowhere in `app/` or
`plugins/` — exactly the legacy the clean-break policy says to delete. CLAUDE.md also notes the
root `app.db` and `database.sqlite` are empty placeholder files.

**Steps:**
- `git rm audiobook.py audit_routes.py`
- Confirm `app.db` and `database.sqlite` at repo root are 0-byte and not the live DB
  (`DB_PATH` resolves under the storage root, not repo root) → `git rm` them and ensure the real DB
  path is gitignored.

**Verify:** `pytest -q` (nothing imports them); grep confirms no references.
**Spec impact:** none (record in `wiki/Changelog.md`).

---

## QW-3 — Delete `.coveragerc`

**Why:** `pyproject.toml` already carries `[tool.coverage.run]` / `[tool.coverage.report]`, which
supersede the standalone `.coveragerc`. Two sources of coverage config invite drift.

**Steps:** confirm `pyproject.toml` coverage sections cover what `.coveragerc` declared (omit
patterns etc.), then `git rm .coveragerc`. Run `pytest -q` (which uses `--cov=app`) and confirm the
coverage report is unchanged.
**Spec impact:** none.

---

## QW-4 — Stop tracking `last_test.json`

**Why:** `plugins/tts_xtts/assets/last_test.json` and `plugins/tts_voxtral/assets/last_test.json`
are **runtime-written** artifacts (written by `app/engines/bridge.py`, read by
`app/api/routers/engines.py`) yet committed — so every dev's first engine test dirties the tree.

**Steps:**
- Add `plugins/*/assets/last_test.json` to `.gitignore` (next to the existing
  `plugins/*/assets/test_output.wav` ignore).
- `git rm --cached plugins/tts_xtts/assets/last_test.json plugins/tts_voxtral/assets/last_test.json`
- Confirm the read path tolerates a missing file (it should already — it's a "last run" cache).

**Verify:** `git status` clean after an engine test run; engines router still returns gracefully
when the file is absent.
**Spec impact:** none.

---

## QW-5 — Delete self-annotated obsolete frontend files

**Why:** both files are literally `export {};` with a header saying they're obsolete and unused.
Confirmed imported nowhere.

- `frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarEngine.ts`
- `frontend/src/utils/predictiveProgress.ts`

**Steps:** `git rm` both; `npm -C frontend run build` + `npm -C frontend run test -- --run` green.
**Spec impact:** none (the live logic already lives in `PredictiveProgressBar.tsx`; check
`progress-presentation.md` `sources:` doesn't list these stubs — if it does, drop the lines).

---

## QW-6 — Delete dead CSS selectors in `components.css`

**Why:** 5 class families (~120 lines) with zero production JSX references.

| Selector | Lines | Note |
|----------|-------|------|
| `.btn-home` | 77–103 | only used by demo `StyleguidePage.tsx:630`, not production |
| `.btn-menu-destructive` | 117–119 | unreferenced |
| `.action-menu-item` | 121–138 | `ActionMenu.tsx` styles inline, never uses this class |
| `.select-glass` | 2204–2227 | only a `tokens.css` comment mentions it |
| `.engine-chunk` | 2229–2276 | unreferenced |

**Steps:** before deleting, re-grep each class name across **all** `.tsx`/`.ts` (incl. dynamically
built `className` strings) to confirm zero production hits; delete the blocks; update the stale
`tokens.css:109` comment referencing `.select-glass`. If the demo's `.btn-home` reliance matters,
move that one rule into the demo's own CSS rather than keeping it in production `components.css`.

> Do this **after / together with** ST-1 (the `components.css` split) to avoid touching the file
> twice — but it is listed in Phase 0 because it's trivially safe on its own.

**Verify:** `npm -C frontend run build`; visual smoke unaffected (dead rules render nothing).
**Spec impact:** none.

---

## QW-7 — Fix the 5 hardcoded-color violations (MANDATORY per §2.2)

**Why:** these are real `design-system.md` §2.2 violations (raw color literals break one theme).
This is the one styling item that is *compliance*, not preference. Small and high-value.

| File:line | Current | Fix |
|-----------|---------|-----|
| `frontend/src/components/ui/StatusOrb.tsx:52` | `color: '#fff'` | `var(--text-on-accent)` (token exists, `tokens.css:103`) |
| `frontend/src/components/ui/StatusOrb.tsx:67` | `color="#000"` | a token for icon-on-warning surface (confirm correct token; add one if none fits) |
| `frontend/src/components/LiveOutputTable.tsx:228` | `'#fff' : 'var(--text-primary)'` | `var(--text-on-accent) : var(--text-primary)` |
| `frontend/src/components/LiveOutputTable.tsx:249` | `... : '#fff'` | `... : var(--text-on-accent)` |
| `frontend/src/components/forms/ColorSwatchPicker.tsx:80` | `rgba(255,255,255,0.5)` | existing translucent-surface token, or add `--surface-glass-dot` to `tokens.css` (both themes) |

**Steps:** for each, confirm the chosen token has a `[data-theme="dark"]` value; if a new token is
added, define it in **both** selectors in `tokens.css`. Verify in light **and** dark.
**Verify:** owner visual check in both themes (toggle `data-theme`); existing component tests green.
**Spec impact:** fixing drift against §2.2 — fold a one-line note into the `design-system.md`
changelog if you're already bumping it for ST-4; otherwise no bump needed.

---

## QW-8 — Remove (or repurpose) `shared/` placeholder barrels

**Why:** four files export only a placeholder constant and are imported nowhere:
`shared/components/index.ts`, `shared/hooks/index.ts`, `shared/lib/index.ts`, `shared/types/index.ts`.

**Nuance:** their header comments encode a real architectural boundary ("shared UI only when truly
cross-feature"). Don't lose that intent.

**Steps (pick one):**
- (a) Delete all four; capture the boundary intent in `code-organization.md` (it likely already
  documents it), **or**
- (b) Keep the directories with a one-line `README.md` stating the boundary and delete the
  placeholder `.ts` exports.

Recommend (a) — the intent is already in CLAUDE.md / `code-organization.md`; empty barrels that no
one imports are noise.

**Verify:** `npm -C frontend run build` (nothing imports them).
**Spec impact:** none.

---

### Phase 0 done-check
`ruff check .` · `./venv/bin/python -m pytest -q` · `npm -C frontend run lint` ·
`npm -C frontend run test -- --run` · `npm -C frontend run build` — all green. Owner visual check
for QW-7 (light + dark). Add a dated `wiki/Changelog.md` entry.
