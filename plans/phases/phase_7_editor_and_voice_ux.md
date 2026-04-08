# Phase 7: Editor And Voice UX

## Objective

Move the main user workflows onto the 2.0 foundations once the lower-risk layers are proven.

## Deliverables

- block-aware editor behavior
- render-batch-aware generation actions
- inline failure recovery
- voice module management UI
- preview/test UI aligned to the new voice model
- project-local navigation and chapter-to-chapter movement

## Deliverables Checklist

- [ ] Block-aware editor behavior implemented
- [ ] Render-batch-aware generation actions implemented
- [ ] Inline failure recovery implemented
- [ ] Voice module management UI implemented
- [ ] Preview/test UI aligned to the new voice model
- [ ] Project-local navigation and chapter-to-chapter movement implemented

## Scope

- preserve current product purpose
- improve trust and clarity
- avoid collapsing back into queue-driven UI design
- editor and voice UX must keep recovery, stale-state, and progress messaging understandable even while some backend flows are still legacy-backed
- project and chapter navigation should surface startup-recovered, paused, failed, and stale states clearly instead of assuming a clean active-session-only model

## Tests

- targeted rerender tests
- stale-state tests
- autosave and local-draft merge tests
- manual UX verification
- recovery-state navigation and messaging verification

## Verification Checklist

- [ ] Targeted rerender tests pass
- [ ] Stale-state tests pass
- [ ] Autosave and local-draft merge tests pass
- [ ] Manual UX verification completed
- [ ] Recovery-state navigation and messaging verification completed

## Exit Gate

- the main user workflow runs on the 2.0 architecture
