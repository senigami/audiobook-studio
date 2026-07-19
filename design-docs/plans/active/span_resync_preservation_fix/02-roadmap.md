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

## Milestones

1. **M1 (Workload A done):** index-cascade bug fixed and shipped independently — de-risks the rest.
2. **M2 (Workload B done):** `align_segments` exists, is unit-tested against I2 (duplicates) and I3
   (the whitespace falsifier) in isolation, with no production code depending on it yet.
3. **M3 (Workload C done):** both consumers wired; the original RC-1 bug is fixed in the running app.
4. **M4 (Workload D done):** full regression suite green, including a revert-checked test that fails
   on pre-Workload-C code and passes after.

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
