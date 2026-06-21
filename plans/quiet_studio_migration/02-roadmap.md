# Roadmap — Quiet Studio Migration

Ordered, rollback-friendly phases. **Each phase is independently shippable, ends green on all five verification commands (INV-1), and updates `design-system.md` in lockstep (INV-3).** Each maps to one task file in `tasks/`.

## Dependency graph

```
P0 fonts ─┐
          ├─► P1 token re-skin + flat buttons + a11y ─┬─► P3 status/progress (needs P1 tokens)
          │   (the visual payoff; re-skins app+demo)  ├─► P4 glass audit
          │                                           └─► P2 forms / Switch (independent of P3/P4)
P1 ───────────────────────────────────────────────────► P5 cleanup (+ optional full rename)
P1,P2,P3,P4,P5 ──────────────────────────────────────► P6 demo polish + regenerate baseline
```

P0 and P1 are the spine. P2/P3/P4 can run in any order after P1 (parallelizable). P5 is cleanup. P6 is last (it depends on the visible system being final).

## Phases

| # | Task file | Workload | Risk | Why here |
|---|-----------|----------|------|----------|
| ~~**P0**~~ ✅ | `tasks/000-fonts.md` | Self-host Geist + Space Grotesk + Source Serif 4 + Geist Mono; add `--font-*` tokens; repoint stacks (Inter stays as fallback until Geist resolves). Resolve **R1**. | Low (additive) | **DONE** — commit `3e3067ed`; spec → 1.5.0 |
| ~~**P1**~~ ✅ | `tasks/001-token-reskin.md` | The core re-skin — `tokens.css` values (alias `--accent`→`#1e4fd8` + role-named tokens, studio-dark, 3-stop dark text, `--surface-reading`, `--status-cached-*`, tightened radii, double-ring `--focus-ring`, solid preparing fill), flat `.btn-primary`, `~3%` banners, `base.css` reduced-motion-first + focus + explicit transitions. Recompute §2.4 contrast (**R2**). | Med (central, but alias-first + class-driven buttons = no consumer ripple) | **DONE** — commits `c6b974cd`→`9bdcc17f`; spec → 1.6.3; 3 review rounds |
| **P2** | `tasks/002-forms-switch.md` | New `Switch` primitive (TDD); confirm/size accent-color checkboxes (18px, 44px region); drop pill radii (GlassInput 100px / VoiceDropzone 99px → `--radius-button`; audit progress badge 999px); extract `GlassInput` inline styles → token class. | Med (new component + TDD) | Independent of P3/P4; needs P1 token values. |
| **P3** | `tasks/003-status-progress.md` | `StatusOrb` + `PredictiveProgressBar` icon-insets (Clock/Loader2/Check/Archive/AlertTriangle/X), calm-pulse on running (shared keyframe), bar terminus icon, consume new fills. TDD; keep the progress contract verbatim (**R5**). | Med (load-bearing, tested) | The "hero" surface; needs P1 fills + `INV-4`/`INV-5`. |
| **P4** | `tasks/004-glass-audit.md` | "Pinned = solid + hairline, floating = glass"; ~10 files; tighten `--blur-glass-strong` 40→28px. | Low | Small, clear; needs P1 surface tokens. |
| **P5** | `tasks/005-cleanup.md` | Extract remaining inline-styled primitives (SearchableSelect/ColorSwatchPicker/VoiceDropzone/ConfirmModal) to token classes (overlaps `plans/simplification/`); tokenize ~15 legacy hardcoded colors (grandfather ColorSwatchPicker palette). **Optional:** the full `--accent`→`--action-primary` rename (94 files) — only if owner wants the alias retired (**R3**). | Med (cleanup; rename is high-ripple) | Stabilization after the visible system is final. |
| **P6** | `tasks/006-demo-baseline.md` | Demo-specific polish (hardcoded demo tints, glass/blur in `siteMockup`); regenerate `docs/style-guide/current.html` as the new baseline; update `docs/style-guide/README.md`; final full verification. | Low | Last — needs the system final (**INV-7**). |

## Milestones

- **M1 — Type identity live** (after P0): the app renders in Geist + Space Grotesk (or documented fallback if R1 forces vendoring).
- **M2 — New look shipped** (after P1): both app and demo render in Quiet Studio color/material/buttons/a11y, AA-verified, spec updated. *This is the headline deliverable; P2–P6 are refinement.*
- **M3 — Components complete** (after P2+P3+P4): real Switch, status icon-insets, glass discipline.
- **M4 — Done** (after P6): cleanup landed, baseline regenerated, all green.

## Per-phase exit checklist (every phase)

1. Code change complete + matches the map's invariants.
2. `design-system.md` updated (spec_version + changelog row); `voice-tone.md` iff copy changed.
3. TDD followed for new/changed components (failing test first, confirmed red, then green).
4. All five verification commands green: `./venv/bin/python -m pytest -q` · `ruff check .` · `npm -C frontend run lint` · `npm -C frontend run test -- --run` (targeted + `--maxWorkers=1` for memory safety) · `npm -C frontend run build`.
5. AA re-verified for any new/changed color pairing (INV-2).
6. Committed in isolation (INV-8), scoped message, no unrelated files.
7. App builds & renders (INV-1) — do not advance on a red phase.
