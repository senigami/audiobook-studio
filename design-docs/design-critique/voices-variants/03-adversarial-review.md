# Adversarial Review — Two Independent Fable-Model Passes

Run before handing the improvement plan to `plan-architect`, per owner request ("a Fabled duo"). Two Fable-tier reviewers worked independently, blind to each other, against the plan docs (`00-summary.md`, `01-findings.md`, `02-improvement-plan.md`) and the real repo. Both verified every citation against live code rather than trusting the plan's own claims — itself a reaction to the `SearchableSelect` mis-citation caught in the prior session, which both reviewers were told to treat as a signal to re-check everything, not just the one correction.

**Result: the IA direction (master-detail split, `TagAutocompleteInput`) is approved by both reviewers as sound.** But both independently found the plan is not yet ready for `plan-architect` — it under-scopes the backend and misses a second UI consumer entirely. Convergent findings are the strongest signal here (same cross-lens-agreement logic as the original critique); each reviewer's unique catches matter too.

## Convergent findings (both reviewers, independently)

**AR-1 — `NarratorCard.tsx` — RESOLVED, not actually in scope.**
Both reviewers flagged `frontend/src/pages/Voices/components/NarratorCard.tsx:347` (which renders a `VariantEditor` behind its own variant switcher) as a second, unscoped production consumer. Follow-up investigation found both reviewers missed a comment sitting directly next to the file's own import: `VoicesTabContent.tsx:1-6` states plainly that "`NarratorCard.tsx` is kept on disk (retired in R6 after all capabilities are re-homed to Voice Lab)." Grepping actual usage confirms it: `NarratorCard` is imported by exactly one live call site, `frontend/src/demo/stages/voiceLabStage.tsx` — the marketing/site demo fixture stage, not the production app. **Owner decision: leave it as-is.** No unify-vs-diverge tradeoff exists here; this was a false positive from both adversarial reviewers (neither checked whether the "second consumer" was actually live), corrected before reaching `plan-architect`. Worth a note for `plan-architect`: if `VariantEditor`'s props/chrome change materially in Phase 2, a quick check that the demo stage still renders without crashing is cheap insurance, but no feature parity work is required.

**AR-2 — The backend "add a tone/pace field" step is far more than one line, and part of the write path is currently blocked outright.**
Both reviewers independently traced the real persistence path and found:
- `get_speaker_settings` (`app/db/speakers_settings.py:109`) only surfaces keys present in a hardcoded response dict — a new field is invisible until added there.
- `list_speaker_profiles` (`app/api/routers/voices_management.py:213`) builds the API-facing `SpeakerProfile` from an explicit field list that must also be extended.
- The generic variant-settings write endpoint (`app/api/routers/voices_actions.py:38-70`) **rejects any key outside an engine-derived allowlist** — writing `tone`/`pace` today would 400. A dedicated write path (mirroring the existing `/{name}/variant-name` endpoint) or an explicit allowlist extension is required, not optional.
- Reviewer 2 additionally traced the **spec obligation**: variant data lives in `profile.json`, which `design-docs/specs/voice-bundles.md` §4.2 documents as a binding field-list spec (MUST-level language) — per this repo's own binding-spec rule, adding fields here requires a `spec_version` bump + changelog row in the same change, not a follow-up.
- Reviewer 1 confirmed the good news: no data migration is needed (absent keys default cleanly), and `variant_versions.py`'s promote/snapshot logic only touches WAVs + `sample.mp3`, never `profile.json` — so version-history rollback cannot clobber tags.

**Fix:** Phase 1's first task must be "backend field + dedicated write endpoint + spec update + tests," not a one-line schema add.

## Reviewer 1's unique catches

**AR-3 — The correction only landed in one of three docs.** `02-improvement-plan.md` was corrected, but `00-summary.md` and `01-findings.md` (DC-002/DC-003 fix text) still point at `SearchableSelect`. Since the plan's own "suggested next steps" tell `plan-architect` to look particularly at DC-001/002/003, this stale text would have been read as authoritative. **Fixed below.**

**AR-4 — "Not separable in practice" is false; a safer sequence exists.** The backend field + `TagAutocompleteInput` + read-only tag chips can land on the *current* stacked layout first, independently verifiable, and deliver the user's actual ask (taggable, distinct variants) before any structural risk is taken on. Recommended order: (1) backend field/endpoint/tests, (2) `TagAutocompleteInput` + tag editing/display in the existing `VariantEditor` header, (3) the rail + selected-only detail pane (reusing NarratorCard's selection-state logic per AR-1), (4) the filter bar, (5) chrome demotion into `ActionMenu`. Only step 3 is structural; steps 1-2 ship green on their own.

**AR-5 — Rail rows need a status affordance for non-selected variants.** Today every stacked card shows its own rebuild-required banner and build/test progress. Once only the selected variant's editor renders, an in-progress rebuild on a non-selected variant becomes invisible unless the rail row carries its own status indicator (a small dot/badge). Related: rail "play" isn't pure playback — `VariantEditor`'s play button can trigger synthesis-if-missing under certain engine-readiness conditions; the plan should state whether rail play does the same or is playback-only.

**AR-6 — N=1 is the real-world norm, not N=2.** Demo fixtures show every seeded voice with exactly one variant. A rail + filter bar for one row is ceremony; recommend collapsing the rail entirely at N=1 (show the detail pane alone, à la today), consistent with the plan's own "hide filter bar below 3" mitigation.

**AR-7 — Minor citation error, direction still correct.** DC-004's before/after code snippet for the reduced-motion fix doesn't match the actual animation values (`VariantEditor.tsx:176-177` uses `scale:[1,1.2,1], opacity:[0.3,0,0.3]`, not the snippet's numbers) — cosmetic, the fix itself (add a `prefers-reduced-motion` guard) is still right. Also flags a related pre-existing nit: the pulse's hardcoded `layoutId="playing-pulse"` would collide if two rows ever pulse simultaneously under the new rail — worth a look when DC-004 is implemented.

**AR-8 — No empty-state spec for the new detail pane**, and existing tests (`VariantsSection.test.tsx`, `VariantEditor.test.tsx`) will need explicit rewrite-vs-preserve decisions, not silent breakage.

## Reviewer 2's unique catches

**AR-9 — Field-naming collision with the existing controlled taxonomy.** Character-level `attributes.tone` is a **strictly-validated, closed, 28-value enum** (`design-docs/specs/voice-taxonomy.json`, enforced server-side), and `pace` is a **single scalar**, not an array. The plan's proposed per-variant fields — free-text, user-extensible, array-valued — share names with a field that has the opposite validation regime. Two things called "tone" with contradictory rules is a real confusion risk for users ("this character is generally somber" vs. "this specific take is angry") and for future engineers. **Decision needed:** a distinct field name/label (e.g. `performance_tags` or a `delivery: {tone, pace}` sub-object on the variant, UI-labeled "Performance," never bare "Tone"/"Pace" that echoes the character-level field).

**AR-10 — Filter semantics are unspecified.** The plan never states whether multi-tag filtering is AND or OR, what happens to variants with zero tags under an active filter, or what happens when the currently-selected variant gets filtered out of the rail (does the detail pane empty, hold, or auto-select the first match?). Reviewer 2 notes the repo already has a convention to adopt by name: character-level filtering is OR-within-a-facet, AND-across-facets (`app/domain/voices/metadata.py:198-238`). Also: tag-value normalization (the plan itself flags "sad" vs. "Sad" as a live risk) needs a stated server-side rule — store lowercase, matching the existing taxonomy's own convention — or filtering will silently miss matches.

**AR-11 — Bundle export creates a double-source-of-truth risk.** `export_voice_bundle` writes each variant's `profile.json` verbatim into the exported zip, while the HF README/tags are generated from *character-level* tone/pace only (`app/domain/voices/bundles.py:123-124, 196-201`). Per-variant tags would ship inside the bundle silently while the README says something unrelated. **Decision needed:** exclude variant tags from the HF tag namespace, namespace them separately (e.g. `perf-*`), or roll them up — pick one explicitly rather than let it fall out by accident. The import round-trip (do extra `profile.json` keys survive re-import?) needs a test either way, since no strict variant-manifest schema currently rejects them.

**AR-12 — The known name-resolution write hazard directly threatens this feature.** `app/db/speakers_settings.py:174`'s own code comment documents a case where a variant name like "Dracula - Angry" can over-resolve to the base voice "Dracula." Per-variant tag writes are exactly the kind of operation this hazard would silently corrupt (tags meant for one variant landing on the parent/default variant instead). This must be a named acceptance test, not discovered in production.

## Consolidated must-fix list before `plan-architect` runs

1. Propagate the `SearchableSelect` correction into `00-summary.md` and `01-findings.md` (AR-3) — mechanical, done below.
2. ~~Scope `NarratorCard.tsx`~~ — **resolved, not in scope** (AR-1): it's retired demo-only code, not a live production consumer. Its selection-state logic (auto-select newly added variant, fallback on delete) remains a useful reference implementation to borrow from when building the new rail's selection state, even though the component itself needs no changes.
3. Expand the backend task to cover the write-endpoint allowlist block, the two read-path surfacing points, and the `voice-bundles.md` spec bump (AR-2).
4. Resolve the field-naming collision — do not reuse bare `tone`/`pace` (AR-9).
5. Specify filter semantics: AND/OR, zero-tag handling, filter-hides-selection behavior, and normalization rule (AR-10).
6. Decide the bundle-export namespace question (AR-11).
7. Adopt the safer phased sequence — tags-on-current-layout first, structural rail second (AR-4).
8. Name the acceptance test for the per-variant write-isolation hazard (AR-12) and the rail's non-selected-variant status affordance (AR-5).

Items AR-6, AR-7, AR-8 are real but lower-stakes — worth folding into the eventual `plan-architect` task list, not blocking a decision from the owner first.
