# Road to v2.0.0 — working release checklist

*Compiled 2026-06-11 from doc 08 (release sequence), all final_release docs, PR #124, and master_agnostic_tasks. This is the single working release list; per-stage detail stays in the source docs. If another plan conflicts with this file, reconcile that plan back to this file before executing. Update statuses here as items land.*

## Stage 1 — Stabilize ✅ (one gate item open)

All logic fixes, progress confidence model, security blockers, test-quality audit, and stabilized-area specs are done (2026-06-10/11).

- [ ] **GATE: manual render verification session** — multi-chapter mixed render: group counter 1/4→4/4 on both frame types, "Preparing engine…" with no countdown during model load, queue row queued→preparing→running→done, cancel/requeue/reconnect. (PR #124 Testing section.) **Owner-run.** (S)

## Stage 2 — Clean house (open, release-gating)

- [ ] Repo + dead-code cleanup per doc 06 — owner authorization is recorded; execute `OWNER_CONFIRMED` items one commit each with suite green per commit. (L)
- [ ] Phase 11 plan-file checkpoint + GitHub-doc supersede notes (doc 01). (S)

## Stage 3 — Plugin contract (open, release-gating, longest pole)

- [x] Manifest contract-version gate (2026-06-11); ENFORCED hard 2026-06-12 (S8).
- [x] check_output QA hook + sanitize categories/overrides (2026-06-11, plugin-contract.md 1.2.0).
- [x] `StudioPluginContext` SDK (S1, 2026-06-12: 13 service groups, 30+ methods, errors hierarchy).
- [x] Plugin migrations: tts_xtts (S4), tts_voxtral (S5), synthesis_mixed→tts_mixed rename + migration (S6) — module-level app imports ZERO, enforced at load (S8); function-body residue dissolves in S9 (in flight).
- [x] Plugin template + AST validation + CI manifest validator (S2/S8).
- [x] S9 dispatcher ctx injection + S10 closeout DONE 2026-06-12: signature audit enforced at load (caught MixedPlugin missing two required methods), plugin-contract.md 1.3.0. **STAGE 3 COMPLETE (S1–S10).**

## Stage 4 — Voice metadata & standalone repos (open, gated on Stage 3)

- [x] Voice taxonomy/attributes/tags/icon upload/casting card — Phases A–E DONE 2026-06-12 (taxonomy validation, idempotent v1-schema migration + D8 state split, metadata/search/cast/icon API, Voice Lab catalog UI with editor + facets, HF-aligned bundle export/import with README generation). Phase F docs DONE 2026-06-12 — doc 04 A–F executed.
- [ ] **Taxonomy v2 (doc 04 Phase G, RE-OPENED 2026-06-12 — owner's original ask, missed in v1.0):** language (multi) + accent (single) + style (multi) attributes; category-tinted pills + +N overflow UI (approved in styleguide U8); HF as-* tags. Additive schema bump. **Re-blocks PK7** until landed. (M)
- [ ] Standalone GitHub plugin repos: discovery infra, XTTS/Voxtral extraction, tts_mixed rename, e2e (doc 05, 18 items, all blocked on Stage 3). (L)

## Stage 5 — Frontend polish (in progress)

- [x] **SITE REDESIGN R1–R6 COMPLETE (2026-06-14)** — full north-star IA shipped on `studio2/phase-12.4-polish-and-cleanup` (PR #125): left rail + grouped nav, routed `/book/:id/...` pipeline, global single-owner player bar (ADR-0010), Activity page, Voice Lab page, Engines/Integrations as pages, thinned Settings + redirects, Casting pinned narrator, Studio book-view-primary + cast painting, Review follow-along + §N annotations. Capability inventory 120/120; full suite 1315 green; specs synced (site-shell 1.4.0, design-system.md, audio-player.md, ADR-0010/0011). Plan + per-phase reviews + owner-validation list: `plans/site_redesign_rollout/`. Deferred: R6-T10 dead-code retirement (supervised follow-up); wiki screenshot recapture.
- [x] Tokens + dark theme + theme switcher (doc 07 §0–2, 2026-06-11).
- [x] Responsive completion incl. mobile nav drawer (doc 07 §3, 2026-06-11; 390px ChapterEditor tablet-min documented).
- [x] Route code-splitting + vendor chunks (entry 876→346 kB, 2026-06-11; doc 11 P7).
- [x] Doc 10 quick wins Q1–Q12 (Q7 → Phase A) — DONE 2026-06-11.
- [x] **GATE: accessibility blockers A1–A3 + A9** — DONE 2026-06-11 (useFocusTrap, dialog semantics, :focus-visible ring).
- [ ] Doc 11 perf items P1–P6 (rAF-throttle LiveOutputTable, audit ring buffer, ScriptView memo, audio element reuse, visibility gating, interval dedup). (M)
- [x] Doc 10 U15/U16 (rail + pipeline + player bar) — DELIVERED via the R1–R6 redesign. Remaining doc 10 U1–U14 cosmetic items fold into the redesigned surfaces or R6 parity; re-triage any leftovers against the shipped UI.
- [ ] Needs owner elaboration: axe/visual baseline rollout. Current direction is axe now and visual
  snapshots later; decide whether axe becomes CI-gated immediately or remains a manual release check
  until the fixed Linux runner is ready. (S)

## Stage 6 — Tell the world

- [ ] Wiki corrections W5–W12, W20 + missing-coverage additions W14–W19 (doc 13; general accuracy pass done 2026-06-11, these are the itemized corrections). (S)
- [x] Live demo (doc 14 steps 1–7; four stages + styleguide).
- [ ] Demo/showcase release-checklist wiring: `sync:showcase-tokens` + `build:demo` at release (doc 14 step 8). (S)
- [ ] v1.html screenshot refresh to current 2.0 UI. (S)
- [ ] **GATE: Pinokio** — PK1 fork pinned + PK2 torch backend selection DONE 2026-06-12; PK4 audit clean (zero machine paths in wrapper). Remaining: PK3 publish wrapper repo (owner), PK7 demo bundle 2.0 refresh (**re-blocked 2026-06-12** on doc 04 Phase G taxonomy v2), PK8 first-run smoke. (S-M)
- [ ] **GATE: SP9 specs conformance pass** — every spec checklist vs shipped code before the tag (doc 18). SP2 depends on Stage 3, SP3 on Stage 4, SP7 on Pinokio. (M)
- [ ] Release notes + install validation matrix + promo assets (Phase 13). (L)

## Cross-cutting / in flight

- [x] Model warm-holding spike (doc 11 P10) — DONE 2026-06-11: persistent XTTS warm worker (keep_model_loaded, idle timeout, one-shot fallback).
- [x] Voxtral segment + bake rendering — DONE 2026-06-12 (owner: in scope); repair workflow engine-complete.
- [ ] Generic plugin setup loop in run.sh/run.ps1 (implement or defer with rationale). (S)
- [ ] Sub-sentence speaker assignment — design doc exists; v2.0 target per owner. (L)
- [ ] Observed-work queue items (master_agnostic_tasks §Observed Work Queue).

## Decisions — RESOLVED 2026-06-11 (owner)

1. **Stage 6 GATES the v2.0.0 tag** (Pinokio PK1-PK4, SP9 conformance, wiki corrections before tag; promo/release notes may trail by days).
2. **Signature audit gates release** (small item; wrong-signature plugins must fail at load).
3. **Voxtral segment/bake rendering: in scope for 2.0.**
4. Sub-sentence assignment: v2.0 target (decided earlier).
5. **Baselines: axe in CI now, visual snapshots later** (when CI has a fixed Linux runner).
6. **Doc 06 deletions: authorized in full** — execute all OWNER_CONFIRMED items, one commit each, suite green per commit.
7. **Stage 4a voice metadata: START NOW** (does not depend on Stage 3).
