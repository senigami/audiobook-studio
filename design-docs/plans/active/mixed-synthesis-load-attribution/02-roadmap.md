# 02 — Roadmap

Ordered tasks, the dependency graph, and milestones. Each task in `tasks/` is self-contained; this is the execution order and what gates what.

## Workloads

| Task | Title | Part(s) | Depends on | Gist |
|---|---|---|---|---|
| [001](tasks/001-diagnostic-trace.md) | Diagnostic: pin the exact marker ordering | P-A,P-B,P-C | — | Capture a live Voxtral→XTTS render's TTS log + event stream; confirm the exact emit order and where identity is lost. De-risks 002/003. Produces a findings note; **no code change** beyond temporary instrumentation. |
| [002](tasks/002-segment-tagged-load-marker.md) | Segment-tagged, real-load marker (log contract) | P-A,P-B,P-D | 001 | XTTS emits a **real-load** marker carrying `{segment_id} {task_id}`; watchdog extracts `segment_id`; grammar chosen + documented. Manifest-driven (INV-3). Unblocks W-PAR 006. |
| [003](tasks/003-orchestrator-identity-attribution.md) | Orchestrator identity-based attribution (keystone) | P-C | 002 | Attribute the load window to the marker-borne segment id; fire the `LOADING_MODEL`/indeterminate frame for **mid-chapter** loads; keep warm/cloud silent (INV-2). Replace/retire the ambient `_active_engine_has_specific_activity_marker` guess. |
| [004](tasks/004-frontend-mid-chapter-preparing.md) | Frontend mid-chapter preparing render | P-E,P-F | 003 (emits the frame) | Relax the scope-gate (`live-jobs.ts:262`) with precise semantics; ensure the correct segment span shows the preparing pulse (not frozen-first-letter). |
| [005](tasks/005-chapter-level-preparing.md) | *(SUPERSEDED — owner: no pausing)* Chapter/queue-level preparing | P-C,P-F | 003 | Surface the load window at the chapter/queue level (indeterminate styling / reserved time). Owner 👁 decision on semantics (R-E). |
| [006](tasks/006-load-aware-eta.md) | *(CHOSEN + DONE 2026-07-01)* Load-aware ETA from history | P-G,P-H | 003 | Fold recorded `model_load_seconds` into the forward ETA (cold-vs-warm aware). |
| [007](tasks/007-spec-reconciliation-and-g0.md) | Spec reconciliation + G0 re-check | all | 004 (+005/006 if done) | Bump the matching specs with changelog rows; run the full suite; re-run the 👁 G0 visual check. |

## Dependency graph

```
001 (diagnostic)
 └─► 002 (log contract) ─► 003 (orchestrator attribution, keystone) ─┬─► 004 (frontend) ─► 007 (specs + G0)
                                                                      ├─► 005 (chapter-level)   ┘ (optional)
                                                                      └─► 006 (load-aware ETA)  ┘ (optional)
```

- **001** is cheap and de-risks everything — do it first; its findings may adjust 002/003 specifics (grammar, emit site).
- **002→003→004** is the core fix (the C1 pipeline). This is the minimum to make G0 pass.
- **005 / 006 "optional… gated by owner appetite" framing is superseded (2026-07-01):** **005 SUPERSEDED** — owner ruled out pausing ("pausing doesn't make sense"). **006 CHOSEN + DONE 2026-07-01** — owner picked the ETA-add approach on 2026-06-26 and it landed 2026-07-01. **007 remains and gates W-PAR resume.**
- **007** lands specs + the G0 re-check; runs after 004 (+006, now done).

## Milestones

- **ML-1 — Diagnosis confirmed:** 001 done; exact failing ordering pinned; grammar decision made.
- **ML-2 — Mid-chapter preparing fixed (the G0 fix):** 002 + 003 + 004. The XTTS-second case shows preparing correctly; warm/cloud stay silent; XTTS-first + Voxtral-only unregressed. **👁 Re-run G0 here** — this is the gate that lets W-PAR resume.
- **ML-3 — Polish *(optional)*:** 005 (chapter-level) and/or 006 (load-aware ETA).
- **ML-4 — Specs + sign-off:** 007. Specs reconciled, suite green, G0 confirmed.

## Cross-references

- Map + invariants/risks: [01-map.md](01-map.md).
- Parent workstream: [../mixed-synthesis-fused-proposal/](../mixed-synthesis-fused-proposal/).
- Master checklist: [../../TASKS.md](../../TASKS.md).
- Gates: **W-PAR** ([../parallel-segment-rendering/](../parallel-segment-rendering/)) resumes after ML-2; W-PAR 006 consumes the 002 log contract.
