# 012 — Deferred work & open questions (W13)

**Status: HOLDING** — post-v2.0 / pending owner design decisions. No action needed before release.

**Goal:** hold the work that is explicitly post-v2.0 or not-yet-decided, so it isn't lost but doesn't
block the release.

## Deferred to post-v2.0

### Localization implementation
**Source:** [`phase_12_multilingual_interface_plan.md`](../../proposals/localization_interface_plan.md)
+ [`examples/`](../../proposals/localization_interface_examples/). **Spec is done**
(`design-docs/specs/interface-localization.md`); **implementation is not started** — no `frontend/src/i18n/`,
no i18n library, no committed source catalogs (the `examples/` locales are review-only, `completion=0`).
**Status:** **RESOLVED 2026-06-20 — post-v2.0** (owner). Spec stays; implementation is not part of the
v2.0 release.

### Voice provider integrations
**Source:** `v2_huggingface_voice_interface.md`, `v2_voice_metadata_and_casting.md`. Direct HF
upload-via-token and in-app HF browse/search UI are **DONE** — see
[TASKS.md:620-627](../../TASKS.md) (shipped 2026-07-03, gaps closed 2026-07-12). This note was stale
(labeled "not confirmed shipped" after the feature had already landed). The AI "suggest voices for
this character" casting action was **not** part of that work and remains real post-v2 backlog;
verify-then-build if wanted.

## Resolved (was mislabeled as an open owner decision)

### Sub-sentence speaker assignment — RESOLVED, mostly shipped
**Source:** [`sub_sentence_speaker_assignment.md`](../../proposals/sub_sentence_speaker_assignment.md). This
line was stale — the doc itself was corrected 2026-07-04 after direct code inspection: `chapter_segments`
already **is** the span table (no new table, a "span" is just a segment row — confirmed 2026-07-12 fusion-
reasoning check against the owner's "just segment splitting" framing), span-splitting already lives in the
backend (`_apply_range_assignment()`), and render-group packing already works generically on segment rows.
This was never a real owner/design decision — it just needed someone to check whether the proposal had
already been implemented, which it had.

**Two real, narrow gaps remain** (neither is a design question — both are scoped implementation work):
1. Sub-sentence spans do not survive a source-text resync (`sync_chapter_segments` rebuilds sentence-
   granular, discarding split spans) — not tracked by any existing plan; needs a task.
2. Undo for an accidental span assignment — this is generic undo-toast work (U1 in
   [008-ux-a11y-perf-backlog.md](008-ux-a11y-perf-backlog.md)), not span-specific; no separate decision needed.

**Map links:** W13. Not gating v2.0.0. No INV impact until activated.
**Dependencies:** none (parked).
**Acceptance:** n/a (holding doc). When activated, each becomes its own task-plan-architect run.
