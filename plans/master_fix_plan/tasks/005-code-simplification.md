# 005 — Code simplification (W2)

**Goal:** the simplification refactor — remove FE dead code, separate styling, split oversized files,
clean the backend, consolidate plugin duplication. Behavior-preserving.
**Authoritative source:** the [`simplification/`](../../simplification/00_overview.md) folder
(newest, 06-19), docs 02–06. Execute those task docs; this file only places them in the master order
and records what older plans they supersede.

**Sub-parts & folded-in older items:**
- **FE dead-code removal** → `simplification/02`. ⚠️ Its dead-tree deletion (DC-1b) is **GATED on 002
  (restoration)** per INV-2. Folds `final_release/09` R4/R5.
- **Styling separation** → `simplification/03`. Folds `final_release/10` **U3** (semantic type scale),
  **U9** (button/input system), **U10** (z-index single source) — do them here, not in 008.
  Supersedes `final_release/07` residue.
- **Large-file splits** → `simplification/04`. Folds `file_split_plan` split #5 (`scriptViewProgress.ts`)
  + backend seams (`state_jobs.py`, `speakers.py`, `plugin_loader.py`). ⚠️ INV-4: do NOT strip
  `useStudioChapter` segment-playback exports (004 needs them).
- **Backend cleanup** → `simplification/05`. Folds `organizational_cleanup` overlaps (speakers
  decomposition, router restructure) + `final_release/06 §3` legacy engine-path deletions.
- **Plugin SDK consolidation** → `simplification/06`, incl. **PL-6**: the xtts adapter is the LIVE
  path (INV-5) — document or unify the redundant `to_bridge_request`; do NOT delete the adapter.

**Map links:** W2. DC-1b ← gated by W3 (002). Styling folds W7 items. Splits touch the surface W3/W4/W5
build on (INV-4). Honors INV-1/3/5/6/7.
**Dependencies:** 001 (clean base) first; DC-1b after 002. Otherwise parallel-safe.
**Acceptance:** per `simplification/` done-checks (suites green, specs bumped: `design-system.md` 1.3.0,
`code-organization.md` 1.2.0); owner visual verification for styling.
**Out of scope:** namespace rename (006); restoration (002).
