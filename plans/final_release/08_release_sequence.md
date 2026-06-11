# 08 — Release Sequence

Execution order for everything in this folder, from today (Phase 12.2, branch `studio2/phase-12.2-polish-and-cleanup`) to the 2.0 public release (Phase 13). Each batch lists its doc(s), what gates it, and what it unblocks. Batches within a stage can run in parallel; stages are sequential. A Haiku-level agent executes one checkbox-doc at a time; this doc is the map.

Owner policies in force throughout (see `01`): Studio 2.0 is not in production — legacy code is deleted, not kept (only the v1→v2 migration path survives); every contract/manifest/schema declares an explicit, load-time-validated version.

## Stage 1 — Stabilize (finish Phase 12.2)

Goal: correct behavior before any reorganization, so later refactors are verified against a trustworthy baseline.

- [x] **1a. Critical logic fixes** (done 2026-06-10) — doc 09 Backend B1–B4 + Frontend F1–F5 (the broadcast races, reconcile bug, event-drop windows, unchecked `res.ok`). These are the prime suspects behind the queue/segment flakiness; land with the new regression tests.
- [x] **1b. Likely-bug fixes** (done 2026-06-10) — doc 09 B5–B13, F6–F13 (includes the segment join-separator fix B12).
- [x] **1c. Progress confidence model** (done 2026-06-10) — doc 15 (ETA trust handoff). After 1a so velocity work sits on correct events.
- [x] **1d. Security release blockers** (done 2026-06-10 — S1-S5 + 53 CodeQL alerts + S8/S9; S6/S7/S10/S11 remain as pre-LAN hardening) — doc 12 S1–S5 (key redaction, timing-safe compare, zip traversal, voice_ref containment, plugin trust dialog).
- [x] **1e. Test quality audit (T1+T2)** (done 2026-06-10) — doc 17: classify queue/job/segment/progress tests, delete vacuous & mocked-out ones, rewrite real scenarios. Runs after 1b so the new tests are audited in the same pass; T1+T2 gate Stage 1 exit.
- [x] **1f. Specs for stabilized areas** (done 2026-06-10 — docs/specs/{live-events,queue-jobs,text-processing,testing-standards}.md; spec-writing surfaced doc 09 B18-B20) — doc 18 SP1 (live events), SP4 (queue/jobs), SP6 (text processing), SP8 (testing standards) — written once Stage 1 behavior is final.
- [ ] **Gate:** doc 17 T1+T2 classification done; `pytest` + `npm test` + Playwright green; one full real render session (multi-chapter, cancel, requeue, reconnect mid-render) behaves per the wiki lifecycle contract.

## Stage 2 — Clean house

Goal: delete what shouldn't exist so the contract work refactors only living code.

- [ ] **2a. Repo + dead-code cleanup** — doc 06 (root cruft, 0-byte DBs, legacy engine path deletion, frontend stubs, dev-route gating, App.tsx split). Owner confirms the flagged destructive steps.
- [ ] **2b. Phase 11 formal closeout + plan-file corrections** — doc 01 P-items (checkpoint Phase 11, supersede the GitLab doc, sync phase docs).
- [ ] **Gate:** builds green; greps in doc 06 all pass; no `OWNER_CONFIRMED` flags left unresolved.

## Stage 3 — The plugin contract (the heart)

Goal: plugins talk to Studio only through the versioned SDK.

- [ ] **3a. Studio-side SDK (`StudioPluginContext`) + version validation** — doc 02 (sections 3, 4, 6). Includes `check_output`, contract-version enforcement, `_ensure_plugin_package_hierarchy` dedup.
- [ ] **3b. Migrate the three plugins** off `app.*` imports — doc 02 §6 steps; acceptance: zero `app.*` imports under `plugins/` outside the SDK namespace.
- [ ] **3c. Plugin template** — doc 03 (`docs/specs/plugin_template/`), validated by `discover_plugins` + verification runner + the AST no-imports check.
- [ ] **Gate:** all engines render through the SDK; manifest/SDK/schema/envelope versions rejected when wrong (tests).

## Stage 4 — Voice metadata & standalone repos

- [ ] **4a. Voice attributes/taxonomy + tag UI + icon upload + casting card** — doc 04 (the open Phase 12 voice items). Owner resolves the flagged D7/D8 and class-filter decisions first.
- [ ] **4b. Standalone GitHub plugin repos** — doc 05 (depends on Stage 3): extract XTTS and Voxtral, install/update flow, `synthesis_mixed` registration fix.
- [ ] **Gate:** doc 05's end-to-end acceptance (fresh Studio + cloned plugin repo → discovered, verified, renders); a voice tagged via UI round-trips through an HF-shaped bundle export/import.

## Stage 5 — Frontend release polish

Can start in parallel with Stage 4 (different files); finish before Stage 6.

- [ ] **5a. Tokens + dark theme + theme switcher** — doc 07 §1–2.
- [ ] **5b. Responsive completion** (mobile nav, ChapterEditor collapse, small-screen passes) — doc 07 §3.
- [ ] **5c. UX improvements** — doc 10 (quick wins first, then U1–U14 as scoped).
- [ ] **5d. Accessibility + performance** — doc 11 (A-blockers are release gates; P1–P3 strongly recommended).
- [ ] **Gate:** doc 07 §4 viewport×theme snapshots + axe clean; doc 10/11 verification walkthroughs pass.

## Stage 6 — Tell the world (Phase 13)

- [ ] **6a. Wiki corrections + additions** — doc 13, then the Phase 13 docs audit (`plans/phases/phase_13_release_documentation_and_distribution.md`) including plugin-author docs seeded from doc 03's README.
- [ ] **6b. Live demo revamp** — doc 14 (interim step 9 webm clips may land any time after Stage 1).
- [ ] **6c. Pinokio distribution** — doc 16: blockers PK1–PK4 (pin Coqui fork, torch backend selection, public wrapper repo, no machine paths), demo.zip 2.0 refresh (PK7, depends on doc 04), first-run smoke test PK8 (XTTS default engine + Studio Voice default voice + demo restore).
- [ ] **6d. Canonical specs conformance** — doc 18 SP9: every spec written (per-stage schedule in doc 18) and cross-checked against shipped code; mismatches filed and fixed.
- [ ] **6e. Phase 13 deliverables** — release notes, install validation (macOS/Windows/Linux, Pinokio), promo assets, `build:demo` in the release checklist.
- [ ] **Gate:** Phase 13 plan checklist complete; doc 16 PK1–PK4 + PK8 green; doc 18 SP9 conformance pass clean; tag `v2.0.0`.

## Post-release backlog (explicitly NOT gating)

Doc 12 Part 2 ideas (ACX QA, audition panel, lexicon, …), doc 05's deferred rename (`plugins/` → `tts_engines/`; note `synthesis_mixed` → `tts_mixed` is now IN-scope pre-release per owner decision 2026-06-10, doc 05 §4.4), doc 11 P8–P9 leftovers, doc 12 S-hardening beyond blockers, plugin signing. After release, the versioned contracts from Stage 3 are the compatibility mechanism — legacy support obligations begin at v2.0.0, not before.
