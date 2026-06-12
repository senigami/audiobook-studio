# 10 — UX Improvements (Apple HIG Pass)

Findings from a 2026-06-10 HIG-style design audit of the frontend. Goal: Apple-level polish — clarity, deference, forgiveness (undo over confirm), progressive disclosure, consistent primitives. Execute Quick Wins first, then ranked improvements. Coordinate token work with [07_frontend_themes_and_responsive.md](07_frontend_themes_and_responsive.md) and component consolidation with [06_code_organization_cleanup.md](06_code_organization_cleanup.md).

## Quick wins (each under 1 hour)

- [x] **Q1.** Add missing `--accent-rgb: 43, 110, 255;` token to `frontend/src/theme/tokens.css`. Done 2026-06-11; `--accent-tint` was already present from the step-1 token audit.
- [x] **Q2.** `ConfirmModal.tsx` + `ResyncPreviewModal`: `role="dialog" aria-modal="true" aria-labelledby` added. Done 2026-06-11 together with A1.
- [x] **Q3.** Create-project modal wrapped in `<AnimatePresence>` with `exit` animation. Done 2026-06-11.
- [x] **Q4.** `ActionMenu.tsx` default trigger 32×32 → 44×44. Done 2026-06-11.
- [x] **Q5.** `.btn-home` `!important` removed; normal specificity. Done 2026-06-11.
- [x] **Q6.** Enter-submits on Title input — already worked (input is inside a `<form onSubmit=…>`). Verified 2026-06-11; no code change needed.
- [ ] **Q7.** Delete the dead `/queue` route (`App.tsx:260-278`) — skipped per instruction; handled by the approved Phase A plan.
- [x] **Q8.** `ConfirmModal.tsx` X button padding 4px → 10px with minWidth/minHeight 40px. Done 2026-06-11.
- [x] **Q9.** Toast container: always-mounted `aria-live="polite" aria-atomic="true"` region added to `App.tsx`. Done 2026-06-11.
- [x] **Q10.** `ActionMenu` flip-up logic restored: opens upward when insufficient viewport space below. Done 2026-06-11.
- [x] **Q11.** `ChapterScriptToolbar` "Unsaved" icon changed from `AlertTriangle` to `Pencil`. Done 2026-06-11.
- [x] **Q12.** `ProjectLibraryPage`: empty-state branch renders centered empty state + single "New Project" CTA; hero skipped when `projects.length === 0`. Done 2026-06-11.

## Ranked improvements

- [ ] **U1 (M). Undo toasts instead of confirm dialogs.** *(Design APPROVED by owner 2026-06-12 — implement as specced.)* `ConfirmModal` is invoked from ~14 sites and defaults `isDestructive=true`. Reclassify: chapter rename / sample delete / voice reset / chapter-audio reset → immediate action + 5s undo toast (extend the existing `showToast` action pattern in `App.tsx:121-126` into a `useUndoToast()` hook); keep a modal only for project delete and bulk audio reset. Remove the `requestConfirm` prop-drilling chain (VoicesPage → VoicesTabContent → NarratorCard → VariantEditor).
  *Accept:* deleting a chapter shows an undo toast and the action is recoverable within the window; only project delete still shows a modal.
- [ ] **U2 (M). Focus management everywhere.** One `useFocusTrap(ref, isOpen)` hook applied to `ConfirmModal`, create-project modal, `ResyncPreviewModal`, and the queue `Drawer` (`pages/Voices/components/VoiceUtils.tsx`); focus first element on open, restore trigger focus on close. *(Joint with doc 11 A1/A2.)*
- [ ] **U3 (M). Semantic type scale.** *(Design APPROVED by owner 2026-06-12 via styleguide typography section.)* `tokens.css` has zero type tokens; 11 ad-hoc font sizes exist (0.625rem–2.75rem). Add a 6-step `--type-*` scale (title 1.5rem/700, headline 1.125/600, body 0.9375/400, callout 0.875/400, caption 0.75/500, micro 0.6875/600), replace inline sizes in `ProjectLibraryPage`, `ChapterHeader`, `ScriptView`, `ConfirmModal`; delete anything below micro (the 0.65rem/0.625rem labels in `components.css:308` are unreadable).
  Also add `--space-*` and `--duration-*` tokens (spacing and motion durations are ad-hoc today).
- [ ] **U4 (S). Startup experience.** Replace the full-screen startup overlay (`App.tsx:308-355`, zIndex 2000) with skeleton library cards + a thin top progress bar; reserve the blocking overlay for server-not-ready only.
- [ ] **U5 (S). Queue drawer affordances.** Global shortcut (e.g. Cmd+Shift+Q); distinct active style for drawer-open vs route-active in `Layout.tsx:93-137`; badge → true pill (`border-radius: 999px`) with stable accent colors.
- [ ] **U6 (L). Guided failure recovery in Chapter Editor.** On `job.status === 'failed'`: dismissible banner in `ChapterHeader` ("3 segments failed — Retry failed / View errors"); `failedSpanIds` prop in `ScriptView` rendering a ⚠ badge per failed span; `onGenerateBatch` gains a retry-failed mode that re-queues only failed spans.
- [ ] **U7 (S). ActionMenu correctness.** Remove hardcoded `id="action-menu-portal"` (breaks click-outside with two menus) — use a ref; add a context enforcing single-open semantics. Replace the hand-rolled export dropdown in `ChapterHeader.tsx:353-380` with `ActionMenu`.
- [ ] **U8 (M). Voice card progressive disclosure.** Derive `voicePhase: empty | has-samples | built | tested` (extend `getStatusInfo()` in `NarratorCard.tsx:81`); show one phase-appropriate primary CTA (Add Samples → Build → Test) and demote the other ~7 peer actions to the overflow menu. Use `PredictiveProgressBar` for the build progress (currently just a "BUILDING..." badge). Clarify preview-from-samples vs render-from-built-voice in the Test labeling. Surface `RecordingGuide` contextually when the dropzone is empty.
- [ ] **U9 (M). One button/input system.** Kill `GhostButton`'s JS hover state (conflicts with `.btn-ghost:hover` CSS — different visuals per call site); consolidate the four input styles to one `.input` class (tracked in docs 06/09 R4); sweep raw `<input style={{…}}>` usages (e.g. create-project modal).
- [ ] **U10 (S). Z-index single source of truth.** `app/layout/layering.ts` exists but startup overlay and `ConfirmModal` hardcode 2000 (colliding), toast 9999, ActionMenu 99999. Enforce HEADER < DRAWER < MODAL < TOAST < MENU from layering constants.
- [ ] **U11 (M). Resync → queue flow.** After a successful `ResyncPreviewModal` commit the user must manually re-queue. Make the primary button "Commit and Queue", secondary "Commit only".
- [ ] **U12 (S). Queue item cancel.** Allow cancelling a single queued job from the queue drawer (today only "Stop All" in the editor).
- [ ] **U13 (M). First-run onboarding.** Empty-library state gains a 3-step checklist (Create project → Add voice → Import chapter & queue) instead of pushing users to the external wiki.
- [ ] **U14 (S). Route transition discipline.** `.animate-in` (utilities.css:63) fires on every page nav — replace with a single shared route transition; audit Framer Motion usage for purpose vs noise.
- [ ] **U15 (M). Layout & navigation design review — run FIRST in Stage 5.** (Owner request, 2026-06-11.) Map every navigation destination a user can reach (library page, project page, chapter page tabs — assemblies/backups/character definitions — and in-chapter selections), then redesign the information architecture for an Apple-style "don't make me think" experience: each screen has one obvious purpose, related actions are grouped, nothing competes for attention. Deliverable is a navigation map + proposed layout before any Stage 5 visual work, since its conclusions shape U1–U14 placement and U16.
  **Mockup viewable now at `/demo/#/styleguide` → Section 4 (Proposed Directions) → U15.**
- [ ] **U16 (M). Unified audio player surface (segment vs chapter).** (Owner request, 2026-06-11.) The VCR-style segment player at the bottom of the Chapter Editor should become more prominent, and must coexist with the full rendered-chapter player without the two competing for space or attention. Candidate design: one player surface with a scope toggle (segment ↔ chapter) that swaps the loaded audio; evaluate during U15. Depends on U15's layout conclusions.
  **Mockup viewable now at `/demo/#/styleguide` → Section 4 (Proposed Directions) → U16.**

## Verification

- [ ] Keyboard-only walkthrough: create project → import chapter → queue → monitor → export, no mouse.
- [ ] All modals/drawers pass focus-trap + Escape + restore checks.
- [ ] No font size below 0.6875rem; no hardcoded type sizes outside tokens.
- [ ] Confirm dialogs only on project delete + bulk destructive ops; everything else undoable.
