# Implementation Map

## Big picture

Three independent capabilities converge on one hero layout:

```
useBookData.ts (already fetches availableAudiobooks)
        │
        ├──► [NEW] "Continue Listening" card ──► playerBus.loadAndPlay({scope:'book', ...})
        │                                              │
        │                                        PlayerBar.tsx (existing, scope-agnostic — no change needed)
        │
        ├──► [NEW] project.description ──► InlineEdit(multiline) in BookStage.tsx "Description" card
        │           │
        │           ▼
        │    app/db/core.py (schema) → app/db/projects.py (already generic, no change)
        │           → app/api/routers/projects.py (new Form param)
        │           → frontend/src/api/index.ts (new field in fetch/update payloads)
        │           → frontend/src/types/index.ts (Project.description)
        │           → frontend/src/hooks/useProjectActions.ts (handleUpdateProject signature)
        │
        └──► BookInfoCard.tsx split:
                   ├─ full editable card → stays on Book tab only
                   └─ [NEW] BookIdentityStrip (read-only) → PublishStage.tsx sidebar

Final hero composition (BookStage.tsx + components.css):
  [cover | identity]  [description | Continue Listening CTA | demoted pills]
  — one region, not two stacked cards (kills DC-007's dead whitespace)
```

## The parts

| Part | Responsibility | File(s) |
|------|----------------|---------|
| **Player bus** | Global now-playing state; any caller pushes `{scope, title, audioUrl}` and the existing `PlayerBar` picks it up | `frontend/src/store/playerBus.ts`, `frontend/src/app/layout/PlayerBar.tsx` (read-only reference, no changes) |
| **Book data hook** | Fetches project, chapters, characters, **and `availableAudiobooks`** (already wired) | `frontend/src/pages/Book/useBookData.ts` |
| **Continue Listening card** *(new)* | Renders the latest `Audiobook` (title, duration, created-at, Play + Download) or an honest empty state | `frontend/src/pages/Book/components/ContinueListeningCard.tsx` *(new file)* |
| **Description field (backend)** | Additive `description TEXT` column on `projects` | `app/db/core.py` (`init_db`) |
| **Description field (API)** | Accept/return `description` on create/update/fetch | `app/api/routers/projects.py` |
| **Description field (frontend contract)** | Type, API client, hook signature | `frontend/src/types/index.ts`, `frontend/src/api/index.ts`, `frontend/src/hooks/useProjectActions.ts` |
| **Description card (UI)** | Real `InlineEdit multiline` bound to `project.description`, replacing today's static placeholder | `frontend/src/pages/Book/stages/BookStage.tsx` |
| **BookInfoCard** | Full editable hero — cover, title/author/series/series-position, metadata pills. **Stays exactly as-is on the Book tab.** | `frontend/src/pages/Book/components/BookInfoCard.tsx` |
| **BookIdentityStrip** *(new)* | Read-only cover thumbnail + title + author, extracted for Publish's sidebar | `frontend/src/pages/Book/components/BookIdentityStrip.tsx` *(new file)* |
| **Publish sidebar** | Swaps its full `<BookInfoCard>` render for `<BookIdentityStrip>` | `frontend/src/pages/Book/stages/PublishStage.tsx` |
| **Hero layout** | Final grid: cover+identity in one region, description+CTA+pills in the other | `frontend/src/theme/components.css` (`.book-info-card`, `.book-stage__*` rules), `frontend/src/pages/Book/stages/BookStage.tsx` |

## Connections & contracts (the part no single task sees alone)

- **`Audiobook` type is already fully shaped for this** (`frontend/src/types/index.ts:445-455`): `filename, title, download_filename?, cover_url, url?, created_at?, size_bytes?, duration_seconds?, description?`. The Continue Listening card task consumes this verbatim — no type changes needed here. Note: `Audiobook.description` is a **different field** from the new `Project.description` (per-assembly-file notes vs. book-level synopsis) — do not conflate them or reuse one for the other.
- **`playerBus.PlayerScope`** (`frontend/src/store/playerBus.ts:7`) is `'segment' | 'chapter' | 'preview'` today. Adding `'book'` is additive and must not change existing scope behavior — `PlayerBar.tsx` and `playerRepresentation.ts` contain **no branching on scope value** (verified: `grep -n "scope ===" PlayerBar.tsx playerRepresentation.ts` returns nothing), so this is safe by construction, not by luck — but re-verify that grep still returns nothing before wiring, in case it's changed since.
- **`update_project(project_id, **updates)`** (`app/db/projects.py:76`) is already fully generic — it builds `UPDATE projects SET {field}=? ...` from whatever kwargs it receives. **No change needed in `projects.py` for the description field** — only the schema (`core.py`) and the API layer (`routers/projects.py`) need to know about it.
- **The migration pattern to copy exactly** (`app/db/core.py:157-173`, the `series_position` precedent): `CREATE TABLE IF NOT EXISTS` declares the column for fresh DBs, then a guarded `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN` backfills it for existing DBs. This is idempotent and runs on every `init_db()` call — the description column task must follow this exact shape, not invent a new migration mechanism.
- **The update-endpoint pattern to copy** (`app/api/routers/projects.py:100-140`): each optional field is `Optional[str] = Form(None)` plus an `if x is not None: updates["x"] = x` line. `description` should follow the **plain-string pattern** (like `series`/`author`), not the `series_position` null-vs-empty-string special case — a description has no meaningful "null vs empty" distinction the way a numeric series position does.
- **The frontend update-call pattern to copy** (`frontend/src/api/index.ts:47-59`): `updateProject`'s `data` param gets a new optional `description?: string` field, appended to `FormData` with an explicit `!== undefined` check (like `series_position`, not the truthy-only check `name`/`series` use) — a user must be able to clear a description to empty string, which a truthy check would silently drop.
- **`handleUpdateProject`** (`frontend/src/hooks/useProjectActions.ts:33`) takes a fixed-shape object and forwards it to `api.updateProject` — its parameter type and the forwarded call both need the new field added in the same task, or the two will silently drift (TypeScript will catch a fully-missing field, but not a field accepted in the type and dropped before the forwarding call — that's exactly the kind of gap a task file must call out explicitly).
- **`BookInfoCard`'s `onUpdateProject` prop shape** (`BookInfoCard.tsx:15`) will need `description` added if the Book tab's description editing calls the same `handleUpdateProject` action — confirm which component actually owns the save call before wiring (likely `BookStage.tsx` itself, calling `actions.handleUpdateProject` directly with `{ ...existing fields, description: value }`, not routed through `BookInfoCard`).
- **`BookIdentityStrip` must not duplicate edit affordances.** It is read-only by construction — no `InlineEdit`, no cover-change button, no series stepper. If Publish needs an edit entry point at all, that's a "link to Book tab" affordance, not a second copy of the editable fields (this is the whole point of DC-006).

## Invariants to hold across every task

- **[INV-1] No engine/scope branching in shared components.** Adding `'book'` to `PlayerScope` must not introduce `if (scope === 'book')` branches in `PlayerBar.tsx` — the bus is intentionally scope-agnostic (mirrors this repo's broader "don't branch on engine ID in core code" rule from `.agent/rules/modular_architecture.md`).
- **[INV-2] No fabricated progress/state.** The Continue Listening card must never imply a finished file exists when it doesn't — empty state is empty state, not a disabled-looking fake card (this repo's no-fabrication principle, applied here to "is there something to listen to").
- **[INV-3] Versioned, additive schema changes only.** Per `CLAUDE.md`'s binding contract-versioning rule, the `description` column addition follows the existing additive-migration idiom (never a destructive `ALTER`/column rename) and any spec doc that describes the `Project`/`projects` table shape gets updated in the same commit as the schema change, per `CLAUDE.md`'s "behavior changes MUST update the matching spec" rule — check `design-docs/specs/` for a project-schema spec before this task is called done.
- **[INV-4] Contrast/token discipline from the just-shipped Phase 1 fixes stays intact.** Any new text in the Continue Listening card or the description empty-state must not reintroduce `--text-subtle` for body text (the DC-002 fix this plan builds on top of) — use `--text-muted`/`--text-secondary` per `design-docs/specs/design-system.md` §2.4.
- **[INV-5] Same-change code-map queue rule.** Every task touching `app/` or `frontend/src/` appends a `docs/code-map/queue/` entry before being marked complete (see README.md).

## Risks & open questions

- **Resolved by research — no manifest sync needed:** `app/domain/projects/manifest.py`'s `save_project_manifest()` (the on-disk `project.json` used for portable export) is only written once, at `create_project()` time (`app/db/projects.py:34-42`), with a hand-built dict of `name/series/series_position/author/created_at`. `update_project()` (used for every post-creation edit, including today's series/author/series-position edits from `BookInfoCard`) **only writes the SQLite row — it never re-saves the manifest.** This is pre-existing, consistent behavior, not a gap this plan introduces: `description` should follow the exact same pattern (DB-only via `update_project`, no manifest touch) rather than inventing new manifest-sync behavior that author/series edits don't have either. `app/db/migration.py:47`'s legacy v1→v2 `INSERT INTO projects` column list also doesn't need `description` — there is no legacy source data for a field that didn't exist in v1.
- **Risk:** `PlayerBar.tsx`'s prev/next queue semantics (`hasPrev`/`hasNext`) are presumably chapter/segment-list-shaped. A single "Continue Listening" load is a one-off (no prev/next) — confirm `loadAndPlay` behaves correctly with `hasPrev`/`hasNext` both omitted/false before wiring (Task 006 must check, not assume).
- **Open question, not blocking:** should `Project.description` support Markdown/rich text, or plain text only? `InlineEdit`'s `multiline` mode is plain-text-only today. Recommendation embedded in Task 007: **plain text for v1** — matches every other editable field in this component tree, and rich text is a larger, separable feature if ever wanted.
