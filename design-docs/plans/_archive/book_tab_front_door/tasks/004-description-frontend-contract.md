# Task 004 — Frontend contract for `description`

Status: complete — 2026-07-09

## Goal

Add `description` to the `Project` type, the `updateProject` API client call, and `handleUpdateProject`'s parameter/forwarding — the three places that must all agree, in the same task, or they'll silently drift.

## Why it matters

The map calls this out explicitly: TypeScript will catch a field entirely missing from a type, but it will **not** catch a field accepted into `handleUpdateProject`'s parameter type and then dropped before the forwarding call to `api.updateProject`. All three edits must land together.

## Exact files

- `frontend/src/types/index.ts` — `Project` interface (lines 65-76).
- `frontend/src/api/index.ts` — `updateProject` (lines 47-59).
- `frontend/src/hooks/useProjectActions.ts` — `handleUpdateProject` (lines 33-51).

## Target contract

**1. `frontend/src/types/index.ts:65-76`** — add `description`:
```ts
export interface Project {
  id: string;
  name: string;
  series: string | null;
  series_position: number | null;
  author: string | null;
  speaker_profile_name: string | null;
  cover_image_path: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
  chapter_map?: Record<string, any>;
}
```

**2. `frontend/src/api/index.ts:47-59`** — add `description` to `updateProject`'s data param, appended with an **explicit `!== undefined` check** (matching `series_position`'s pattern, NOT the truthy-only pattern `name`/`series`/`author` use — a user must be able to clear a description to empty string, and `if (data.description)` would silently swallow that):
```ts
updateProject: async (id: string, data: { name?: string; series?: string; series_position?: number | null; author?: string; speaker_profile_name?: string | null; description?: string; cover?: File }): Promise<any> => {
  const formData = new FormData();
  if (data.name) formData.append('name', data.name);
  if (data.series) formData.append('series', data.series);
  if (data.series_position !== undefined) {
    formData.append('series_position', data.series_position === null ? '' : String(data.series_position));
  }
  if (data.author) formData.append('author', data.author);
  if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || DEFAULT_VOICE_SENTINEL);
  if (data.description !== undefined) formData.append('description', data.description);
  if (data.cover) formData.append('cover', data.cover);
  const res = await fetch(`/api/projects/${id}`, { method: 'PUT', body: formData });
  return parseApiResponse(res);
},
```

**3. `frontend/src/hooks/useProjectActions.ts:33-51`** — add `description` to `handleUpdateProject`'s parameter type AND forward it in the `api.updateProject` call (both halves, in the same edit):
```ts
const handleUpdateProject = async (data: { name: string; series: string; series_position?: number | null; author: string; description?: string; cover?: File | null }) => {
  setSubmitting(true);
  try {
    await api.updateProject(projectId, {
      name: data.name,
      series: data.series,
      series_position: data.series_position ?? null,
      author: data.author,
      description: data.description,
      cover: data.cover || undefined
    });
    await onDataRefresh();
    return true;
  } catch (e) {
    console.error("Failed to update project", e);
    return false;
  } finally {
    setSubmitting(false);
  }
};
```

## Pattern to imitate

`series_position`'s handling in all three files — it's the most recent precedent for adding an optional field to this exact chain, and it already establishes the "explicit `!== undefined` check, not truthy-only" convention this task must follow for the same reason (nullable/clearable value).

## Steps

- [x] Edit `frontend/src/types/index.ts` — add `description: string | null;` to `Project`.
- [x] Edit `frontend/src/api/index.ts` — add `description?: string` to `updateProject`'s data param type and the `!== undefined` append line.
- [x] Edit `frontend/src/hooks/useProjectActions.ts` — add `description?: string` to `handleUpdateProject`'s param type AND thread it into the `api.updateProject(...)` call object. Do not add it to only one half.
- [x] `BookInfoCard.tsx`'s `onUpdateProject` prop type (line 15) is a *different, narrower* shape (`{ name, series, series_position?, author, cover? }`) used only by the identity-field editors — it does **not** need `description` added, since Task 007 wires the description card directly to `actions.handleUpdateProject`, not through `BookInfoCard`. Confirm this assumption holds when Task 007 is implemented; if it turns out the description save routes through `BookInfoCard`'s prop instead, add `description` there too at that time (not in this task — don't touch a component this task doesn't need to for a UI binding a later task owns).
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] `npx tsc -p tsconfig.json --noEmit` (from `frontend/`) is clean — this is the primary check for this task, since it's pure type/contract wiring with no new runtime behavior to unit-test yet (Task 007 exercises it end-to-end).
- [x] `npm -C frontend run test -- --run` — no regressions (one pre-existing, unrelated failure in `tests/unit/demo/demoApp.test.tsx` confirmed present with and without this task's changes stashed).
- [x] Grep confirms all three files were touched: `git diff --stat frontend/src/types/index.ts frontend/src/api/index.ts frontend/src/hooks/useProjectActions.ts` shows changes in all three.

## Dependencies

Task 003 (the API must accept `description` before the frontend client is updated to send it — though in practice this task could be written first; keep the stated order to avoid a frontend that calls an API param the backend doesn't yet accept).

## Map links

- Part: **Description field (frontend contract)** (`01-map.md` — The parts)
- Contract: **The frontend update-call pattern to copy**, **`handleUpdateProject` takes a fixed-shape object...** (`01-map.md` — Connections & contracts)
- Risk: `multi-file` (three files must agree on the same field in the same task)

## Out of scope

- The actual UI binding in `BookStage.tsx` (Task 007).
- `BookInfoCard.tsx`'s prop type — narrower scope, not touched here (see steps above).
