# 012 — Deferred work & open questions (W13)

**Goal:** hold the work that is explicitly post-v2.0 or not-yet-decided, so it isn't lost but doesn't
block the release.

## Deferred to post-v2.0

### Localization implementation
**Source:** [`phase_12_multilingual_interface_plan.md`](../../phases/phase_12_multilingual_interface_plan.md)
+ [`examples/`](../../phases/phase_12_multilingual_interface_examples/). **Spec is done**
(`docs/specs/interface-localization.md`); **implementation is not started** — no `frontend/src/i18n/`,
no i18n library, no committed source catalogs (the `examples/` locales are review-only, `completion=0`).
**Status:** deferred to Phase 13 / post-v2.0 per `phase_12_polish_and_cleanup.md`. ⚠️ OWNER FORK:
confirm in-v2.0 vs post-v2.0.

### Voice provider integrations (unconfirmed-shipped)
**Source:** `v2_huggingface_voice_interface.md`, `v2_voice_metadata_and_casting.md`. Direct HF
upload-via-token, in-app HF browse/search UI, and the AI "suggest voices for this character" casting
action are **not confirmed shipped**. Treat as post-v2 product backlog; verify-then-build if wanted.

## Open question (needs a design decision before it can be planned)

### Sub-sentence speaker assignment
**Source:** [`sub_sentence_speaker_assignment.md`](../../sub_sentence_speaker_assignment.md). All design
questions are **unresolved**: does the segments table become the span table? where does span-splitting
live (backend vs frontend)? how do per-sentence features map onto spans? what's the undo story?
**Action:** this needs an owner/design decision (a fusion-reasoning pass would fit) before it becomes
executable tasks. Not planned here beyond flagging it.

**Map links:** W13. Not gating v2.0.0. No INV impact until activated.
**Dependencies:** none (parked).
**Acceptance:** n/a (holding doc). When activated, each becomes its own task-plan-architect run.
