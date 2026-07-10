# Roadmap

## Dependency graph

```
001 (mode-switcher shell: remove toggle, Cast + Follow Along modes)
        │
        ├──► 002 (remove duplicate rail, dock Annotations)
        │
        └──► 003 (Edit Text mode via ChapterTextPanel)
                        │
                        ▼
                004 (cleanup + full green gate)
```

002 and 003 both depend on 001's shell existing, but are independent of each other (002 touches `ReviewStage.tsx`/Annotations docking, 003 touches `StudioStage.tsx`'s new mode content) — safe to run in parallel once 001 lands. 004 depends on both.

## Tasks

- **001** — Replace the `Studio | Review` toggle in `BookLayout.tsx`'s `ChapterWorkspace` with a `Cast | Follow Along | Edit Text` mode switcher. Cast mode renders today's `StudioStage` content unchanged. Follow Along mode renders `ReviewStage`'s `review-text-view` + `FollowAlongPanel` toolbar (rail and Annotations left in place for now, removed in 002). Edit Text mode is a stub (built in 003).
- **002** — Remove `ReviewStage.tsx`'s `review-chapter-rail` (the duplicate chapter picker). Move `AnnotationsPanel` from a fixed side drawer into a `WorkspacePanel`-docked panel (matching the existing Lexicon pattern), toggle button placed in Follow Along mode's toolbar.
- **003** — Build the Edit Text mode: port `ContentsStage.tsx`'s `<ChapterTextPanel chapter={...} onSaved={...} />` usage into `StudioStage.tsx`'s new mode, wired to the active chapter already resolved there.
- **004** — Cleanup and verification: remove now-dead `.review-chapter-rail*` CSS, confirm Contents' own `ChapterTextPanel` usage is unaffected, full green gate (build, typecheck, lint, full frontend + backend test suites).

## Milestones

- **M1:** Mode switcher exists, Cast + Follow Along both reachable, no Studio/Review toggle language anywhere.
- **M2:** Single chapter switcher confirmed (rail gone), Annotations dockable.
- **M3:** Edit Text mode works identically to Contents' existing full-text-edit.
- **M4 (done):** Clean, green, verified live.
