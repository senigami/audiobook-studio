# Roadmap

## DC-003 recommendation (decided here, per the owner's request)

**Recommendation: full "Continue Listening" card on the Book tab, wired into the existing global player bus — not a link out to Publish, and not a new player.**

Grounding: `useBookData.ts` already fetches `availableAudiobooks` (cover, duration, size, created-at, download URL, per-file description — `frontend/src/types/index.ts:445-455`) for every book; this data is sitting unused by `BookStage.tsx` today. Separately, this app already has a global, scope-agnostic player (`frontend/src/store/playerBus.ts` + `frontend/src/app/layout/PlayerBar.tsx`) driving a persistent player bar — `loadAndPlay({scope, title, subtitle, audioUrl, ...})` is generic enough that an assembled audiobook file is just another caller, no different in shape from how a chapter or segment loads today. `PlayerBar.tsx`/`playerRepresentation.ts` contain zero branches on scope value, confirmed by direct grep — so adding a `'book'` scope is safe by construction, not a special case bolted onto shared UI.

This means the "build a listen affordance" work is almost entirely **composition, not new audio infrastructure**: a card component that reads `availableAudiobooks[0]` (most recent) and a `Play` button that calls `loadAndPlay({scope: 'book', ...})`. It also means this plan does **not** compete with or duplicate `design-docs/plans/active/audio_player_waveform_scrubber/` (a separate, larger, already-active initiative building scrubbing UI for the player bar itself) — this plan is simply one more caller of the bus that scrubber work already targets.

A "link out to Publish" was considered and rejected: it would leave the Book tab's stated #1 requirement unmet (the owner explicitly wants to listen *from* the front door, not be redirected away from it), and Publish's assembly table is oriented around managing multiple past assemblies (a producer's view), not a single "here's the book" landing action (a reader's view) — the two surfaces serve different audiences and both should exist.

## Dependency graph

```
001 (playerBus 'book' scope)         002 (schema: description column)      005 (BookIdentityStrip + Publish swap)
        │                                     │                                        │
        │                                     ▼                                        │  (no dependents — can land
        │                             003 (API: description param)                     │   independently, any time)
        │                                     │                                        │
        │                                     ▼                                        │
        │                             004 (frontend contract: type/api/hook)            │
        ▼                                     │                                        │
006 (Continue Listening card)                 ▼                                        │
        │                             007 (Description card real wiring)               │
        │                                     │                                        │
        └─────────────────┬───────────────────┘                                        │
                           ▼                                                            │
                  008 (North Star hero layout — depends on 006 + 007)                   │
                           │                                                            │
                           └── independent of 005; both can be considered done separately
```

**Parallel-safe now:** 001, 002, 005 (no shared files, no dependency on each other).
**Serial within Workload B:** 002 → 003 → 004 → 007 (each step needs the prior layer's contract).
**Serial within Workload A:** 001 → 006.
**Convergence:** 008 needs both 006 (the CTA exists) and 007 (the description exists) before the final layout has real content to arrange — do not attempt 008 early with placeholder content, it will need redoing.

## Workloads

### Workload A — Listen/Resume affordance (DC-003)
- Task 001 — Add `'book'` to `PlayerScope`
- Task 006 — Build the Continue Listening card, wire to `loadAndPlay`

### Workload B — Description field (DC-005)
- Task 002 — Additive `description` column + migration + spec update
- Task 003 — API param on create/update/fetch
- Task 004 — Frontend contract: `Project.description`, `api.updateProject`, `handleUpdateProject`
- Task 007 — Real `InlineEdit multiline` wiring in `BookStage.tsx`, replacing the static placeholder

### Workload C — Slim identity strip (DC-006)
- Task 005 — Extract `BookIdentityStrip`, swap into `PublishStage.tsx`

### Workload D — North Star hero layout
- Task 008 — Final grid restructuring: cover+identity | description+CTA+demoted pills

## Milestones

- **M1 (parallel-safe foundation):** 001, 002, 005 done.
- **M2 (contracts complete):** 003, 004 done — description field fully round-trips through the API, no UI yet.
- **M3 (both features functional, layout still old):** 006, 007 done — Continue Listening card and real description both work, but the hero still stacks them as separate cards below `BookInfoCard`.
- **M4 (done):** 008 done — final North Star layout live. Re-run `/design-critique` on this scope to confirm the P1/P2/P3 items it targets are resolved.
