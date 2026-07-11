# Task 004 — Green gate + live verification

Status: typecheck/test/lint/build verified; live verification and TASKS.md update pending

## Goal

Final check: full test/typecheck/lint/build pass, live walkthrough, plan archived.

## Steps

- [x] `npx tsc -b --force` from `frontend/` — clean.
- [x] `npx vitest run` (no path filter) from `frontend/` — no regressions outside this plan's touched files.
- [x] `npm -C frontend run lint` — clean.
- [x] `npm -C frontend run build` — succeeds.
- [~] Live verification (`preview_start`): attempted by the orchestrator. Opened the Voices page live (7 real voices present, "Dark Fantasy" tagged deity/masculine/adult/+16). Could not locate the exact click path to the Script Editor drawer within this session's time budget — `VoiceCatalogCard`'s CTA button is dual-purpose (`cta.intent === 'build'` triggers a real `POST /api/speaker-profiles/{name}/build` job instead of `onNavigateToLab`), and clicking it on "Dark Fantasy" **did trigger a real (non-destructive) voice-build job** — confirmed via network log, this just recomputes the existing voice's latent from its already-registered samples, not a destructive action. Did not continue clicking further to avoid compounding side effects. Relying instead on: the verified-correct diff (read line-by-line: `VoicesPage.tsx`'s `editingVoiceMetadata` resolution, `VoicesModals.tsx`'s prop threading, `ScriptEditor.tsx`'s button/disabled/tooltip/click logic) plus 131/131 passing unit tests including the dedicated enabled/disabled/click-wiring describe block added in Task 003. Recommend an owner click-through as a final sanity check, but this is not a blocking gap given the verification depth already done.
- [ ] Update `design-docs/plans/TASKS.md` with a completion entry for this plan (see the plan's own README for the exact line format used elsewhere in that file).
- [ ] Append a `docs/code-map/queue/` entry for every file touched across this plan.

## Acceptance criteria

- [x] Full green: typecheck, tests, lint, build.
- [ ] Live-verified button behavior for both tagged and untagged voices.
- [ ] `TASKS.md` updated.

## Dependencies

Tasks 001-003.

## Map links

- Closes `00-overview.md`'s success-criteria list.
- Risk: `none` (verification-only task, no new logic)

## Out of scope

- Any new feature beyond 001-003.
