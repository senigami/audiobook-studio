# 41 · "Harriet Brooks" — Large Catalog Curator  ☆ INFERRED

**Identity:** "A library operations manager who needs the project list to behave like operational software — filterable, sortable, bulk-actionable, and honest about scope before she commits to anything destructive."

## Goals
- Find projects by completion status, last activity, or failure state without knowing the project name
- Apply a voice or setting change to a category of projects without opening each one individually
- Identify stale or broken work fast — projects that started but never finished, renders that failed silently weeks ago
- Confirm the exact scope of any bulk action before it executes, and undo it if the scope was wrong
- Trust that the list reflects actual on-disk state, not cached metadata that drifted out of sync

## Context & environment *(INFERRED)*
- Manages a back-catalog re-narration project for a large publisher: 2,000 titles being converted over 18 months
- Uses Audiobook Studio's project list as her daily operational dashboard, not as a creative workspace
- Works from a desktop workstation; doesn't interact with individual chapters unless a project is flagged for review
- Delegates rendering and editing to a small team; her job is to track completion, catch failures, and make catalog-wide decisions
- Has encountered list performance degradation as project count grows; slow loads break her daily triage rhythm

## Key workflow moments
- **Morning triage:** Opens the project list filtered to "failed" or "stalled" status from the previous day; expects filter to execute in under two seconds even at 1,000+ projects
- **Bulk voice assignment:** Selects 40 projects in a genre category and assigns a shared narrator voice; expects a confirmation dialog showing project count and the voice being assigned before committing
- **Stale work audit:** Sorts by "last render activity" ascending to surface projects that haven't progressed in two or more weeks; opens the oldest ones to decide whether to restart or archive
- **Completion sweep:** Filters to projects with partial render completion (some chapters done, some not) to identify titles that need a final push before a delivery deadline
- **Failure pattern check:** Looks for multiple projects failing on the same date range, which often signals a plugin regression or a shared asset problem rather than individual project errors

## Top friction points *(INFERRED)*
- **F1 — No cross-project failure filter:** The project list has no filter for "contains failed renders"; Harriet must open each project to check render status, making failure triage at scale impossible
- **F2 — Bulk actions without scope preview:** Selecting projects and applying a voice change executes without showing how many projects are affected or what the current voice assignment is — she has caused wrong-voice assignments to large batches
- **F3 — List performance degrades past ~200 projects:** Scrolling and filtering slow down noticeably; at 500+ projects the list becomes unreliable for daily use
- **F4 — No "last activity" sort:** Projects sort by creation date or alphabetically; there is no sort by last render job, last edit, or last status change — stale work is invisible without manual auditing
- **F5 — Stale metadata drift:** Project completion percentages shown in the list sometimes lag actual render state; Harriet has shipped a "complete" title only to find chapters were still queued

## What they need from the studio
- Project list filters for: completion status, last render date (range), presence of failed jobs, assigned voice, and genre tag
- A sort option for "last render activity" and "last modified" that reflects actual job history, not just file timestamps
- Bulk action confirmation dialogs that show the selected project count, the current value, and the new value before committing
- List virtualization or pagination that keeps scroll performance consistent past 1,000 projects
- A completion status indicator that is computed from actual render artifact presence, not cached metadata

## Review lens — questions they ask of any screen
- "Can I find every project with a failed render in the last 30 days without opening a single project detail view?"
- "If I select 200 projects and change the narrator voice, does the app show me exactly what it's about to change before I confirm?"
- "Does the completion percentage here reflect what's actually on disk, or is it a cached value that might be stale?"
- "Can I sort this list by when work last happened on each project — not when it was created?"
- "If I filter by 'stalled,' what exactly qualifies as stalled — and can I adjust that threshold?"
- "How long does it take to load and filter this list at 1,000 projects? At 2,000?"
- "If I accidentally bulk-assign the wrong voice to 50 projects, is there an undo path, or is that permanent?"

## Red flags that make them quit or distrust the app
- The project list has no status filter; finding broken work requires opening projects one by one
- A bulk voice assignment executes with no preview of scope — no count, no before/after
- List performance collapses past a few hundred projects; triage becomes too slow to be daily habit
- Completion percentages are stale and don't match what actually rendered to disk
- There is no sort or filter by recent activity; she cannot find dormant projects without manual review

**Evidence basis:** INFERRED. Interview operations staff managing large-scale catalog conversion projects to validate which filter and sort dimensions matter most, and whether bulk action scope preview is the primary safety need or whether undo is equally expected.
