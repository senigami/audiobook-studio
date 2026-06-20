# Simplification & Styling-Separation Plan — Overview (the map)

**Status:** proposed · **Created:** 2026-06-19 · **Branch:** `studio2/phase-12.4-polish-and-cleanup`
**Owner decision recorded:** styling direction = **finish the existing token system (no Tailwind).**

This folder is the execution map for a focused effort to *simplify* Audiobook Studio 2.0 —
remove dead weight, cut duplication, split oversized files, and finish separating CSS from
markup ("Zen-garden" style) — **without changing product behavior**.

It is the synthesis of a six-area adversarial audit (frontend styling, frontend dead code,
backend `app/`, plugins, deps/tooling, spec impact). Every task below links back to a verified
finding. Load-bearing claims were re-verified against the code before landing here; where a claim
could not be fully proven safe, the task is marked **verify-first** instead of "delete".

---

## 1. The decision that frames everything: no Tailwind

The starting request floated Tailwind for "a centralized definition of our styles." The audit
showed that goal is **already met and is binding**:

- `frontend/src/theme/tokens.css` is a single CSS-variable registry. `design-system.md` §2.1:
  *"This file is the single registry — tokens MUST NOT be redefined per-component or per-page."*
- `design-system.md` §2.2 (binding): components **MUST** style through `var(--token)`, never raw
  hex/rgb. Dark mode is *only* token overrides on `[data-theme="dark"]`, so token-only styling
  gets both themes for free (§3.2).

Tailwind is **utility-first** — it puts styling *into* the JSX (`className="flex gap-2 text-sm"`),
which is the **opposite** of the requested separation, and it would contradict the binding
single-registry rule (a spec rewrite, not a refactor). So the plan **finishes** the token system:

> **Styling lives in CSS keyed off tokens; JSX carries semantic class names. Inline `style={{}}`
> is reserved for genuinely dynamic values (computed widths, transforms, conditional token
> selection) and must still use tokens, never hardcoded values.**

Dead irony worth clearing: `clsx` and `tailwind-merge` are in `package.json` but imported nowhere
(no Tailwind is even installed). They are removed in Phase 0.

---

## 2. Principles (apply to every task)

1. **Behavior-preserving.** This is cleanup, not a feature change. Every task ends with the
   relevant test suite green; styling tasks additionally need **owner visual verification** (per
   the "verify by asking, not self-preview" working rule) because unit tests don't catch
   appearance regressions.
2. **Specs and code are jointly authoritative.** Changes that alter a documented contract bump
   the matching `spec_version` + add a changelog row **in the same commit** (see §5).
3. **Refactor along existing seams, not by line count** (`code-organization.md` §7). Splits follow
   the module/domain boundaries the audit identified, never a mechanical halving.
4. **No import-time side effects** (`modular_architecture.md` §8 / `code-organization.md` §8.3).
   New theme/CSS-loader or helper modules must not register listeners or mutate global state on
   import.
5. **No engine-ID branching in core** (`modular_architecture.md`). Plugin consolidation lifts
   shared code into the SDK; it must not introduce `if engine == "xtts"` forks.
6. **Extract before delete.** Where live code imports from a dead tree, move the shared symbol to a
   real home and switch callers *first*, in a separate commit, before deleting the dead tree.
7. **Bisectable commits.** One logical change per commit so any regression can be `git bisect`-ed —
   consistent with how this branch has shipped.
8. **TDD discipline** (`testing-standards.md` R1–R4). Pure deletions need a full-suite green run;
   any behavior-touching fix gets a revert-checked test.

---

## 3. Workstreams & sequencing

Phases are ordered by risk and dependency. Phase 0 is independent and can ship immediately;
Phase 1 has a hard *extract-before-delete* ordering; Phases 2–5 can interleave.

| Phase | Doc | Theme | Risk | Rough size |
|-------|-----|-------|------|-----------|
| **0** | [01_quick_wins.md](01_quick_wins.md) | Dead deps, dead files, mandatory color fixes, dead CSS | Very low | ~0.5–1 session |
| **1** | [02_frontend_dead_code_removal.md](02_frontend_dead_code_removal.md) | Remove the ~4,700 LOC dead ProjectDetail/ChapterEditor trees + stub routes + dead components (extract-first) | Medium (touches 31 test files) | ~1–2 sessions |
| **2** | [03_styling_separation.md](03_styling_separation.md) | The core ask: shared classes, inline-style → class conversion by hotspot, split `components.css` | Low logic / high churn | Largest; phased |
| **3** | [04_large_file_splits.md](04_large_file_splits.md) | Split oversized files (frontend hooks/components, backend services) along seams | Medium | Opportunistic |
| **4** | [05_backend_cleanup.md](05_backend_cleanup.md) | Backend dead code, duplicate timing math, repeated queries, `app/jobs` rename | Low–medium | ~1 session |
| **5** | [06_plugin_consolidation.md](06_plugin_consolidation.md) | Lift duplicated plugin boilerplate into the SDK; verify-then-decide on legacy xtts adapter | Medium | ~1–2 sessions |

**Recommended order:** 0 → 1 → 2 (interleaving 3 where files are already being touched) → 4 → 5.
Phase 2's `components.css` split (ST-1) should land early because new shared classes need a home.

---

## 4. Risk register

| Risk | Where | Mitigation |
|------|-------|-----------|
| Deleting a "dead" page that's actually reachable | Phase 1 | Verified: both routes `<Navigate>` away, pages imported nowhere. Still: full suite + manual smoke before delete. |
| Live code imports from the dead tree | Phase 1 | Extract `VoiceProfileSelect`, `useChapterStatus`, `ResyncPreviewData`, `ChapterEditorTab` to shared homes **first** (DC-1a) — confirmed coupling. |
| Visual regression from inline→class conversion | Phase 2 | Per-file tasks; owner visual verification; consider a screenshot diff on hotspot pages. |
| `app/jobs` rename breaks plugin imports | Phase 4 | These modules are **live** (called by `tts_mixed`, `tts_xtts`, SDK). Rename + update all importers in one commit; run full suite incl. plugin suites. |
| Removing the legacy xtts dispatch adapter | Phase 5 | **Not confirmed dead** (wired in `manifest.json`). Task is *investigate*, not delete. |
| Removing "transitive" backend deps breaks install | Phase 0 | `websockets`/`jinja2`/`python-multipart` only *probably* transitive — verify in a clean venv before removing; `mistralai`/`beautifulsoup4` confirmed unused. |
| Spec drift after refactor | All | §5 spec-bump checklist; treat as part of the same commit. |

---

## 5. Spec impact (joint-authority checklist)

| Trigger | Spec | Action |
|---------|------|--------|
| Add class-based styling convention; reserve inline for dynamic values | `design-system.md` | Bump **1.2.0 → 1.3.0**; changelog row; document the convention in §2.2/§6. |
| Split `components.css` into `theme/components/*.css` | `code-organization.md` | Bump **1.1.0 → 1.2.0**; update §5 frontend-layout table; changelog row. |
| Fix the 5 hardcoded-color violations | `design-system.md` | Already mandated by §2.2 — no bump (fixing drift), but note in changelog if bumping for the convention anyway. |
| Move `PredictiveProgressBar` / shell CSS file paths | `progress-presentation.md`, `site-shell-and-book-pipeline.md` | Update `sources:` lists only; **no** version bump for pure path moves of unchanged CSS. |
| Remove dead pages / rename `app/jobs` | `code-organization.md` | Update layout/module references; changelog row. |
| Dead-dep removal, dead-file deletion | — | No spec impact. Record in `wiki/Changelog.md`. |

**Inline-style removal is NOT itself a §2.2 violation** (inline styles that use `var(--token)`
already comply). It is a *maintainability/separation* improvement — the owner's stated goal — so it
is a first-class workstream, but framed as quality, not compliance. The genuinely-mandated fixes
are the 5 hardcoded colors (QW-7).

---

## 6. Explicitly out of scope

- **The demo tree (`frontend/src/demo/`, ~19.8k LOC).** It is *not* dead — the release checklist
  needs the rebuilt showcase — but it is **stale** vs. the completed R1–R7 redesign. Reconciliation
  is already tracked in [`plans/site_redesign_rollout/10_mock_reconciliation.md`](../site_redesign_rollout/10_mock_reconciliation.md).
  This plan does not touch it; do not use it as a current design reference.
- **Rewriting product behavior, ETA/progress math, or the orchestration contracts.** Those shipped
  recently and are stable; only their *file organization* is in scope (LF-/BE- tasks).
- **Adopting Tailwind or any new styling framework** (decided against, §1).

---

## 7. Master task index

Full detail (files, line refs, steps, verification) lives in each phase doc.

| ID | Task | Phase | Effort | Risk |
|----|------|-------|--------|------|
| QW-1 | Remove dead deps: `clsx`, `tailwind-merge` (fe); triage `mistralai`/`beautifulsoup4`/`ruff`/transitives (be) | 0 | S | low |
| QW-2 | Delete legacy top-level scripts `audiobook.py`, `audit_routes.py` + empty root placeholders | 0 | S | low |
| QW-3 | Delete `.coveragerc` (superseded by `pyproject.toml`) | 0 | S | low |
| QW-4 | Gitignore + untrack `plugins/*/assets/last_test.json` | 0 | S | low |
| QW-5 | Delete self-annotated obsolete frontend files (2× `export {}`) | 0 | S | low |
| QW-6 | Delete 120 lines of dead CSS selectors in `components.css` | 0 | S | low |
| QW-7 | **Fix 5 hardcoded-color §2.2 violations** (StatusOrb, LiveOutputTable, ColorSwatchPicker) | 0 | S | low |
| QW-8 | Delete 4 `shared/` placeholder barrels (or convert intent to a README) | 0 | S | low |
| DC-1a | **Extract** `VoiceProfileSelect`, `useChapterStatus`, `ResyncPreviewData`, `ChapterEditorTab` to shared homes | 1 | M | med |
| DC-1b | Delete dead `ProjectDetail` + `ChapterEditor` trees (~4,700 LOC) + their tests | 1 | L | med |
| DC-2 | Delete stub route infra (`routes/index.tsx`, null `createX` stubs) | 1 | S | low |
| DC-3 | Delete dead components `VoiceDropzone`, `SearchableSelect` (+ tests) | 1 | S | low |
| ST-1 | Split `components.css` (2,956 lines) into `theme/components/*.css` by domain | 2 | M | low |
| ST-2 | Add shared classes for repeated inline patterns (`.form-label` ×52, reuse `.input-field` ×8, +scan) | 2 | M | low |
| ST-3 | Convert inline `style={{}}` → classes, hotspot-by-hotspot (top 15 files first) | 2 | L | low |
| ST-4 | Spec bumps (`design-system` 1.3.0, `code-organization` 1.2.0) + optional stylelint guard | 2 | S | low |
| LF-1 | Split `useStudioChapter.ts` (861) into focused sub-hooks | 3 | M | med |
| LF-2 | Split `EngineCard.tsx` (792) into composition + sub-components | 3 | M | low |
| LF-3 | Split `PredictiveProgressBar.tsx` (754) — extract status/eta/lane | 3 | M | med |
| LF-4 | Split `MetadataEditorModal.tsx` (693) — extract 5 inline widgets | 3 | M | low |
| LF-5 | Slim `App.tsx` (564) — extract `useToast`/`useStartupOverlay`/`useChapterRedirect` | 3 | M | low |
| LF-6 | Split `progress/service.py` (1449) — emit-gate + enrich kernel | 3 | L | med |
| LF-7 | Split `tts_server/server.py` (1333) — extract plugin-staging module | 3 | L | med |
| BE-1 | Remove backend dead code (web.py aliases/stub, dict-mode branch, `_should_emit` shim, `schema_data`) | 4 | S | low |
| BE-2 | Replace dead `INTENDED_*/FORBIDDEN_*` constants with comments or an import-boundary test | 4 | S | low |
| BE-3 | Dedupe `events.py` enum/string command sets | 4 | S | low |
| BE-4 | Remove duplicate segment-timing math (read server's pre-computed `timing`) | 4 | M | med |
| BE-5 | Compute `_resolved_segment_profiles` once per request in `generation.py` | 4 | S | low |
| BE-6 | Rename/move `app/jobs/*` (live) under `orchestration/` + `studio_plugin_sdk/` | 4 | M | med |
| PL-1 | Lift `_get_ctx()` singleton into one SDK factory (9 copies) | 5 | M | low |
| PL-2 | Extract segment-marker `on_output` handler factory (4 copies) + `_group_needs_render` | 5 | M | med |
| PL-3 | Move app-adapter helpers + `run_test` boilerplate into `BaseVoiceEngine` | 5 | M | low |
| PL-4 | Extract shared XTTS synthesis loop (`serve_loop`/`main` duplication) | 5 | M | med |
| PL-5 | Remove unimplemented `validate_environment`/`build_voice_asset` stubs | 5 | S | low |
| PL-6 | **Investigate** legacy xtts dispatch adapter; delete only if proven dead | 5 | M | med |

See each phase doc for the per-task spec.
