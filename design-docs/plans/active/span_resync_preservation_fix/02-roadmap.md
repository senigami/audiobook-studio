# Roadmap

## Ordering rationale

Tests lead (R1/TDD, `design-docs/specs/testing-standards.md`). The independently-shippable
index-cascade fix (Task 0) lands first as its own small, low-risk PR — it needs no anchor logic,
de-risks the larger change, and delivers value even if the rest of the plan stalls (Petra's finding,
`RC-1-plan-comparison.md`). The shared-alignment extraction (Task 3) must exist before either
consumer (Tasks 4/5) can use it.

## Workloads

### Workload A — Index-cascade fix (independent, ship first)
- Task 0: fix whole-sentence positional misalignment after an earlier edit

### Workload B — Shared alignment + schema-free recognition
- Task 1: `align_segments` — schema-free fragment-run recognition (+ its test suite)
- Task 2: (conditional — only if Task 1's tests prove schema-free insufficient) additive columns
- Task 3: extract `align_segments` as the one shared function; wire nothing yet (pure function, unit-tested in isolation)

### Workload C — Wire the fix into both consumers
- Task 4: `sync_chapter_segments` uses `align_segments`, preserves in place
- Task 5: `get_resync_preview` uses `align_segments`, no more duplicated logic
- Task 6: surface `lost_assignments_count` on the save response (`update_chapter` / the API route)

### Workload D — Full regression coverage
- Task 7: end-to-end tests for the originally-reported bug + the duplicate/split intersection (R1)

## Dependency graph

```
Task 0 (independent) ──────────────────────────────────► can ship standalone

Task 1 (align_segments core + its own tests)
   │
   ▼
Task 2 (conditional fallback — only if Task 1's tests fail the schema-free approach)
   │
   ▼
Task 3 (finalize align_segments as the shared export)
   │
   ├──► Task 4 (sync_chapter_segments wiring)
   │        │
   │        ▼
   │     Task 6 (surface loss count — depends on Task 4's return shape)
   │
   └──► Task 5 (get_resync_preview wiring)

Task 4 + Task 5 done ──► Task 7 (full regression suite, incl. R1 revert-check)
```

## Milestones — status as of 2026-07-19

1. **M1 (Task 0, index-cascade):** SUPERSEDED, not built separately — Task 4's `align_segments`
   wiring subsumes it entirely (per the plan's own instruction that Task 4 supersedes Task 0's
   throwaway aligner). No standalone Task 0 code exists; not needed.
2. **M2 (Workload B) — DONE.** `align_segments` implemented (`app/db/segment_alignment.py`),
   unit-tested (9 tests), 3-way reviewed twice (round 1 found and fixed a real duplicate-content
   data-loss bug; round 2 confirmed correct). Schema-free (Task 2/stored-anchor fallback) was never
   needed — the schema-free design held under adversarial review.
3. **M3 (Workload C) — DONE.** `sync_chapter_segments` (Task 4) and `get_resync_preview` (Task 5)
   both wired to the shared `align_segments`; loss count surfaced on the save API response
   (Task 6, backend half — frontend UI deliberately deferred to design review). All 3-way reviewed;
   Task 4's review surfaced and fixed a real, adjacent bug (`is_destructive` false positive) and a
   genuine architectural finding (the chunk-group audio-invalidation interaction, recorded as
   Invariant I8).
4. **M4 (Workload D, full regression) — SUBSTANTIALLY COVERED, not a separate pass.** Regression
   coverage was built incrementally with each task rather than as one final Task 7 pass: the
   flagship distinct-character scenario, the duplicate/fragment intersection, the whitespace
   falsifier, the reordered-duplicates case, and the preview-parity cases are all covered by
   committed, revert-checked tests across Tasks 1/4/5/6 (1083 tests pass total, db/+domain/+api/).
   **Remaining gap, honestly flagged (not silently closed):** the self-committing explicit-resync
   transaction posture (Invariant I4's other half) has no committed test — both Fable's Task 4 and
   Task 5 reviews noted this. Low risk (that route isn't otherwise touched), but open.

## Session summary (2026-07-19 night session)

Implemented, 3-way-reviewed (Fable + Constance + Petra, code-review not just plan-review), and
merged: Task 1 (`align_segments` core — one real bug found and fixed), Task 4 (wired into sync — one
real bug found and fixed, one architectural finding recorded), Task 5 (wired into preview — closed a
live false-warning bug), Task 6 backend half (loss count surfaced on save; frontend UI deliberately
deferred to design review, not silently skipped). See `.agent/frontier-calibration/code-reviews/`
for the full review trail and the calibration program's running Fable-vs-twins comparison.

## Coverage table (findings this plan addresses)

| Finding | Source | Addressed by |
|---|---|---|
| Core RC-1 bug (whole-sentence equality can't preserve fragments) | RC-1 reference | Tasks 1, 3, 4 |
| Anchor model under-counts 3-way splits | Fable, Constance, Petra (all 3) | Task 1 (fragment-run, not single-offset) |
| Re-derive mechanism nulls audio + churns revision-id | Petra | Task 4 (preserve in place, not re-derive) |
| Conflicts with existing duplicate-sentence test | Constance | Invariant I2 + Task 1's test suite |
| 9-column silent data loss on rebuild | Constance | Task 4 (inline fix option) — **owner decision**, see 01-map.md Open Questions |
| `get_resync_preview` logic drift risk | RC-1 reference, plan draft | Tasks 3, 5 |
| Test sequencing violates R1 | Fable, Petra | This roadmap's ordering (tests lead each workload) |
| Whole-sentence index cascade | Petra | Task 0 |
| Schema-free viable but needs strip-normalization | Verification scout (2026-07-19) | Invariant I3, Task 1 |
| `compact_script_view` anchor staleness | Petra | Invariant I6 (moot if schema-free holds — Task 2 not needed) |

Not covered (explicitly out of scope, see `00-overview.md`): editor UI split-creation flow, audio
pipeline internals, broader segment-model redesign.
