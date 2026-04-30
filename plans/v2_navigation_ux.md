# Studio 2.0 Navigation UX

This document defines the navigation model for Studio 2.0 so the interface can
be built around user goals instead of drifting into screen-by-screen growth.

## 1. Navigation Principles

- Navigation should reflect user goals: find work, resume work, fix work, finish work.
- Queue is an observability surface, not the center of the product.
- Project context should remain visible while moving between project-level and chapter-level work.
- Recovery actions should appear near the affected work instead of forcing users to detour through unrelated screens.
- Navigation should support both focused editing and fast resumption after interruption.

## 2. Primary Navigation Model

### Global Level

- `Library`
- `Project`
- `Queue`
- `Voices`
- `Settings`

### Project Level

Inside a project, the user should navigate with a stable project-local subnav:

- `Overview`
- `Chapters`
- `Queue`
- `Export`
- `Settings`

### Chapter Level

Inside the editor, the user should retain:

- clear breadcrumb context back to the project
- next/previous chapter movement
- direct links to stale, failed, queued, and rendered block states
- a fast return path to the project overview

## 3. Recommended Route Hierarchy

```text
Library
└── Project Overview
    ├── Chapters
    │   └── Chapter Editor
    ├── Queue
    ├── Export
    └── Settings

Global Queue
Voices
Settings
```

## 4. Core User Flows

### Resume Work

1. User opens `Library`
2. Sees recent projects and unfinished work
3. Opens a project overview or resumes directly into the last active chapter

### Fix Failed Or Stale Work

1. User opens `Project Overview` or `Queue`
2. Sees explicit stale/failed states with reasons
3. Jumps directly into the affected chapter or retry action

### Finish A Project

1. User opens `Project Overview`
2. Reviews chapter readiness and assembly/export state
3. Proceeds into `Export`

### Test Voice Behavior

1. User opens `Voices` or a project/chapter assignment surface
2. Runs preview/test flow
3. Returns to project or editor context without losing place

## 5. Shell Expectations

- Persistent global shell with primary nav
- Visible breadcrumbs when in project or chapter context
- Project-local subnav when inside a project
- Queue and notifications available as companion surfaces, not only full-page destinations
- Space for reconnect, recovery, and warning banners in the shell

## 6. Queue UX Positioning

- Global queue should remain available from anywhere
- Project queue should be visible inside project context
- Minor queue inspection should be possible without a full context switch
- Waiting reasons should be explicit and readable

## 7. Editor Navigation Expectations

- Show breadcrumb: `Library / Project / Chapter`
- Show return path to project overview
- Support chapter-to-chapter movement
- Surface recovery actions inline
- Preserve local draft/session state during intra-project navigation

## 8. Voice Navigation Expectations

- Distinguish library-level voice management from project/chapter assignment
- Preview/test should feel lightweight and reversible
- Voice-module settings should live under settings and not overload project navigation

## 9. Phase Alignment

### Phase 1

- scaffold shell, navigation model, breadcrumbs, and project subnav boundaries
- document intended route hierarchy and companion surfaces

### Phase 6

- implement shell hydration, reconnect presentation, and global queue/header behavior

### Phase 7

- implement project-local navigation, chapter-to-chapter movement, and inline recovery UX

## 10. Risks To Avoid

- letting queue become the main navigation model
- forcing users to leave project context for common recovery tasks
- mixing library-level voice management with chapter assignment in one overloaded screen
- hiding location/context in deep editor flows
- making users navigate by implementation boundaries instead of user goals
