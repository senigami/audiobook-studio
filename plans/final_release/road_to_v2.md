# Road to v2.0.0 — working release checklist

*Compiled 2026-06-11 from doc 08 (release sequence), all final_release docs, PR #124, and master_agnostic_tasks. This is the single working list; per-stage detail stays in the source docs. Update statuses here as items land.*

## Stage 1 — Stabilize ✅ (one gate item open)

All logic fixes, progress confidence model, security blockers, test-quality audit, and stabilized-area specs are done (2026-06-10/11).

- [ ] **GATE: manual render verification session** — multi-chapter mixed render: group counter 1/4→4/4 on both frame types, "Preparing engine…" with no countdown during model load, queue row queued→preparing→running→done, cancel/requeue/reconnect. (PR #124 Testing section.) **Owner-run.** (S)

## Stage 2 — Clean house (open, release-gating)

- [ ] Repo + dead-code cleanup per doc 06 — `OWNER_CONFIRMED` deletion flags need owner sign-off before executing. (L)
- [ ] Phase 11 plan-file checkpoint + GitLab-doc supersede notes (doc 01). (S)

## Stage 3 — Plugin contract (open, release-gating, longest pole)

- [x] Manifest contract-version gate (2026-06-11).
- [x] check_output QA hook + sanitize categories/overrides (2026-06-11, plugin-contract.md 1.2.0).
- [ ] `StudioPluginContext` studio-side SDK finalized (doc 02 §3/4/6). (M)
- [ ] Migrate all three plugins to zero `app.*` imports outside the SDK namespace (doc 02 §6 acceptance). (M)
- [ ] Plugin template + AST no-app-imports validation (doc 03). (M)
- [ ] Callable-signature compatibility audit vs the five-method contract. (S) *Clarify: release-gating or post-2.0 hardening?*

## Stage 4 — Voice metadata & standalone repos (open, gated on Stage 3)

- [ ] Voice taxonomy/attributes/tags/icon upload/casting card, steps A1–F3 (doc 04; D7/D8 decisions recorded 2026-06-10 — implementation not started). (L)
- [ ] Standalone GitHub plugin repos: discovery infra, XTTS/Voxtral extraction, tts_mixed rename, e2e (doc 05, 18 items, all blocked on Stage 3). (L)

## Stage 5 — Frontend polish (in progress)

- [x] Tokens + dark theme + theme switcher (doc 07 §0–2, 2026-06-11).
- [x] Responsive completion incl. mobile nav drawer (doc 07 §3, 2026-06-11; 390px ChapterEditor tablet-min documented).
- [x] Route code-splitting + vendor chunks (entry 876→346 kB, 2026-06-11; doc 11 P7).
- [ ] Doc 10 quick wins Q1–Q12 (Q7 dead-route handled by Phase A plan). (M) — *in flight 2026-06-11*
- [ ] **GATE: accessibility blockers A1–A3 + A9** (dialog semantics/focus traps, drawer, nav names, :focus-visible) — WCAG AA (doc 11). (M)
- [ ] Doc 11 perf items P1–P6 (rAF-throttle LiveOutputTable, audit ring buffer, ScriptView memo, audio element reuse, visibility gating, interval dedup). (M)
- [ ] Doc 10 ranked U1–U14 — *decide per item: 2.0 vs Phase B/C of the north star.* U15/U16 are answered by the north star decisions (rail + pipeline + player bar), executing as Phase A/B PRs post-#124.
- [ ] Playwright/axe baseline strategy decision (CI-generated on Linux recommended), then doc 07 step 4. (S)

## Stage 6 — Tell the world

- [ ] Wiki corrections W5–W12, W20 + missing-coverage additions W14–W19 (doc 13; general accuracy pass done 2026-06-11, these are the itemized corrections). (S)
- [x] Live demo (doc 14 steps 1–7; four stages + styleguide).
- [ ] Demo/showcase release-checklist wiring: `sync:showcase-tokens` + `build:demo` at release (doc 14 step 8). (S)
- [ ] v1.html screenshot refresh to current 2.0 UI. (S)
- [ ] **GATE: Pinokio PK1–PK4** (pin Coqui fork, torch backend selection, public wrapper repo, no absolute paths) + PK7 demo bundle 2.0 refresh (depends on Stage 4 voice schema) + PK8 first-run smoke. (M)
- [ ] **GATE: SP9 specs conformance pass** — every spec checklist vs shipped code before the tag (doc 18). SP2 depends on Stage 3, SP3 on Stage 4, SP7 on Pinokio. (M)
- [ ] Release notes + install validation matrix + promo assets (Phase 13). (L)

## Cross-cutting / in flight

- [x] Model warm-holding spike (doc 11 P10) — *in flight 2026-06-11: persistent XTTS inference worker.*
- [ ] Voxtral segment + bake rendering (PR #124). (M) *Scope decision: 2.0 or post?*
- [ ] Generic plugin setup loop in run.sh/run.ps1 (implement or defer with rationale). (S)
- [ ] Sub-sentence speaker assignment — design doc exists; v2.0 target per owner. (L)
- [ ] Observed-work queue items (master_agnostic_tasks §Observed Work Queue).

## Contradictions to resolve (found in the 2026-06-11 audit)

1. **Stage 6 timing**: doc 08 calls Stage 6 "Phase 13" (reads post-tag) but doc 18 says SP9 gates the v2.0.0 tag. Decide which.
2. **Stage 3 exit bar**: manifest version gate alone vs full signature validation.
3. **Stage 4 start condition**: D7/D8 approvals recorded — confirm implementation can start once Stage 3 exits, no further sign-off.

## Owner decisions queue

1. Stage 6 timing (above). 2. Signature-audit gating. 3. Voxtral segment/bake scope. 4. Sub-sentence assignment scope for 2.0. 5. Playwright baseline strategy. 6. Doc 06 `OWNER_CONFIRMED` deletions sign-off.
