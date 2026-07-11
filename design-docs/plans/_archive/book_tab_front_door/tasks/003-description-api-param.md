# Task 003 — Accept/return `description` on the projects API

Status: complete — 2026-07-09

## Goal

Thread the new `description` column (Task 002) through `api_update_project` so the frontend can save it. `api_get_project`/`api_list_projects` need no changes — they already return `dict(row)` from `get_project()`/`list_projects()`, which will automatically include `description` once the column exists.

## Why it matters

This is the thinnest possible API change: one new `Form` parameter and a two-line conditional, following the exact shape every other plain-string field (`series`, `author`) already uses in this same endpoint.

## Exact files

- `app/api/routers/projects.py` — `api_update_project` (lines 100-140).

## Target contract

Current (`app/api/routers/projects.py:100-140`):
```python
@router.put("/{project_id}")
async def api_update_project(
    project_id: str,
    request: Request,
    name: Optional[str] = Form(None),
    series: Optional[str] = Form(None),
    series_position: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    updates = {}
    if name is not None: updates["name"] = name
    if series is not None: updates["series"] = series
    form_data = await request.form()
    if "series_position" in form_data:
        ...
    if author is not None: updates["author"] = author
    ...
```

Target — add `description` as a new `Form` parameter, and one line in the `updates` dict following the exact pattern `name`/`series`/`author` already use (a plain `is not None` check — **not** the `series_position` null-vs-empty-string special case, which exists only because `series_position` is numeric and "clear it" vs. "leave unchanged" needs disambiguating; a string field doesn't have that ambiguity, an empty string IS "clear it"):
```python
async def api_update_project(
    project_id: str,
    request: Request,
    name: Optional[str] = Form(None),
    series: Optional[str] = Form(None),
    series_position: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    ...
    if author is not None: updates["author"] = author
    if description is not None: updates["description"] = description
    ...
```

## Pattern to imitate

The `author` line immediately above the insertion point — same shape, same file, three lines away.

## Steps

- [x] Add `description: Optional[str] = Form(None)` to `api_update_project`'s signature.
- [x] Add `if description is not None: updates["description"] = description` in the `updates` dict construction, next to the `author` line. **Deviation (flagged):** the plain `is not None` check alone cannot observe a clear-to-empty-string request — FastAPI's `Form(None)` parsing coerces an empty form value to `None`, indistinguishable from "field omitted" (verified empirically; this is also true, pre-existing, for `author`/`series`/`name` today). Added an `elif "description" in form_data: updates["description"] = form_data.get("description") or ""` fallback (same raw-form-data idiom already used for `series_position` a few lines above) so the empty-string-clears behavior the acceptance criteria requires actually works.
- [x] No change needed to `api_get_project` (`app/api/routers/projects.py:66-80`) — verified: it calls `get_project()` and returns `JSONResponse(p)` directly with no field allowlisting, so `description` flows through automatically once Task 002's column exists.
- [x] Append a `docs/code-map/queue/` entry per the README's same-change rule.

## Acceptance criteria

- [x] `PUT /api/projects/{id}` with `description` in the form body persists it (verify via `get_project`).
- [x] `GET /api/projects/{id}` returns the `description` field.
- [x] Add a test to `tests/api/test_api_projects.py` (the existing `series_position` round-trip tests at lines 30-60 are the pattern — mirror that shape for `description`: create → update with a description → fetch → assert it round-trips; also assert an empty-string update clears it).
- [x] `./venv/bin/python -m pytest tests/api/test_api_projects.py -q` passes.

## Dependencies

Task 002 (the `description` column must exist).

## Map links

- Part: **Description field (API)** (`01-map.md` — The parts)
- Contract: **The update-endpoint pattern to copy** (`01-map.md` — Connections & contracts)
- Risk: `none` (thin, precedented change)

## Out of scope

- The frontend contract (Task 004) — this task is backend-only.
- `api_create_project` — a book is created without a description by design (see Task 002).
