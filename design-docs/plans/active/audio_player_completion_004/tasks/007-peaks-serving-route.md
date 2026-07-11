Status: complete — 2026-07-10

# 007 — Peaks serving route (compute-on-miss)

Workload: C · Risk: `quality-sensitive`, `multi-file` (touches a security-relevant contained-file-serving route) · Blocked-by: 006 · Blocks: 008

## Goal

Extend the existing contained chapter-asset route to serve peaks sidecars — computing them lazily on first request (or on staleness) using task 006's function, atomically writing them to disk, and serving from cache on subsequent requests. **This is the entire backend mechanism** — there is no separate producer-side hook (rejected, see task 006).

**This task replaces** `design-docs/plans/active/audio_player_waveform_scrubber/tasks/011-backend-peaks-sidecar-emission.md`'s route/manifest half.

## Why it matters

Compute-on-miss at the route is what covers every producer (all current WAV-writing code paths, the TTS-server subprocess, chapter-fanout, restitch, recovery, and the entire back-catalog of already-rendered chapters) by construction — verified during design that a producer-side hook would miss the app's default-engine render path entirely.

## Map links

See `../01-map.md` — Parts: `chapters_assets.py`. Invariants: contained file serving, versioned contracts, no import-time side effects (this runs inside a request handler — sanctioned).

## Files

### Edit

- `app/api/routers/chapters_assets.py` — extend `asset_type: Literal["audio", "text", "segment"]` to include `"peaks"` (line ~117), add a new branch in `api_get_chapter_asset` (~lines 113-152).

### Create

- `tests/api/test_peaks_asset_route.py`

### Read (do not edit — the pattern to imitate, and confirmed no changes are needed here)

- `app/storage/manager.py` — `resolve_chapter_asset_path`'s `"audio"` branch (~lines 118-125) resolves a WAV by `filename` via `_find_file` (enumerate-and-match, existing-file-only, already containment-safe). **Do not add a `"peaks"` branch here** — the corrected design derives the sidecar path as a deterministic sibling of the already-resolved, already-contained WAV path, entirely inside the route handler. This is simpler than the originally-considered approach and needs no `storage/manager.py` changes.

## Target shape / contract

### Route branch (in `api_get_chapter_asset`)

```python
@router.get("/projects/{project_id}/chapters/{chapter_id}/assets/{asset_type}")
def api_get_chapter_asset(
    project_id: str,
    chapter_id: str,
    asset_type: Literal["audio", "text", "segment", "peaks"],  # add "peaks"
    filename: Optional[str] = None,
):
    chapter_id = config.canonical_chapter_id(chapter_id)

    if asset_type == "peaks":
        # Resolve the WAV via the EXISTING "audio" resolution (already containment-safe) —
        # `filename` here is the WAV's filename, matching the "audio" branch's own contract.
        wav_resolved = config.resolve_chapter_asset_path(
            project_id, chapter_id, "audio", filename=filename
        )
        if not wav_resolved or not wav_resolved.exists():
            raise HTTPException(status_code=404, detail=f"Audio not found for chapter {chapter_id}")

        sidecar_path = wav_resolved.with_suffix(".peaks.json")  # deterministic sibling, same dir
        sidecar = _load_or_compute_peaks_sidecar(wav_resolved, sidecar_path)
        if sidecar is None:
            raise HTTPException(status_code=404, detail="Peaks unavailable")
        return JSONResponse(sidecar)

    resolved = config.resolve_chapter_asset_path(project_id, chapter_id, asset_type, filename=filename)
    # ... existing branch unchanged below this point ...
```

### `_load_or_compute_peaks_sidecar` helper (new, in `chapters_assets.py` or a small module it imports — implementer's call on placement, keep it near the route)

```python
_peaks_locks: dict[str, threading.Lock] = {}
_peaks_locks_guard = threading.Lock()

def _get_peaks_lock(key: str) -> threading.Lock:
    with _peaks_locks_guard:
        return _peaks_locks.setdefault(key, threading.Lock())

def _load_or_compute_peaks_sidecar(wav_path: Path, sidecar_path: Path) -> Optional[dict]:
    stat = wav_path.stat()
    if sidecar_path.exists():
        try:
            existing = json.loads(sidecar_path.read_text())
            src = existing.get("source", {})
            if (
                existing.get("version") == SIDECAR_VERSION
                and src.get("size_bytes") == stat.st_size
                and src.get("mtime_ns") == stat.st_mtime_ns
            ):
                return existing
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        # Present but stale/invalid/wrong-version — fall through to recompute.

    lock = _get_peaks_lock(str(wav_path))
    with lock:
        # Re-check under the lock — another request may have just computed it.
        if sidecar_path.exists():
            try:
                existing = json.loads(sidecar_path.read_text())
                stat_now = wav_path.stat()
                src = existing.get("source", {})
                if (
                    existing.get("version") == SIDECAR_VERSION
                    and src.get("size_bytes") == stat_now.st_size
                    and src.get("mtime_ns") == stat_now.st_mtime_ns
                ):
                    return existing
            except (OSError, ValueError, json.JSONDecodeError):
                pass

        sidecar = compute_peaks_sidecar(wav_path)
        if sidecar is None:
            return None

        tmp_path = sidecar_path.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(sidecar))
        os.replace(tmp_path, sidecar_path)  # atomic
        return sidecar
```

Import `compute_peaks_sidecar`, `SIDECAR_VERSION` from `app.engines.audio_ops` (task 006).

**Containment note:** `sidecar_path` is a deterministic sibling of `wav_resolved`, which is already containment-verified by the existing `"audio"` resolution path — no separate containment check is needed for the sidecar path itself, since it's derived (not request-supplied) and lives in the same already-verified directory. Do not accept a raw `filename` for the sidecar independently of the WAV resolution.

## Steps

- [x] Add `"peaks"` to the `asset_type` Literal.
- [x] Add the `_load_or_compute_peaks_sidecar` helper (with per-path locking) and the route branch.
- [x] Write `tests/api/test_peaks_asset_route.py`: valid+fresh sidecar → 200 with correct JSON; missing sidecar + valid WAV → 200 (computed on the fly, file now exists on disk); stale sidecar (stat mismatch) → recomputed, not served stale; `version` mismatch → recomputed; missing WAV → 404; traversal-attempt `filename` → existing containment behavior holds (4xx, no path in the response body); concurrent requests for the same WAV (simulate with two threads or by asserting the lock is acquired) don't double-compute (mock `compute_peaks_sidecar` and assert call count == 1).
- [x] R1 revert-check the bug-relevant assertions (stale-detection, concurrent-lock) against a version of the code without the guard.
- [x] `./venv/bin/python -m pytest tests/api/test_peaks_asset_route.py -q` green.
- [x] `ruff check app/api/routers/chapters_assets.py`.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] `GET /api/projects/{pid}/chapters/{cid}/assets/peaks?filename=<wav>` returns 200 with the sidecar JSON when the WAV exists (computing it on first request if no sidecar exists yet).
- [x] A subsequent request for the same unchanged WAV is served from the cached sidecar (verify via a spy/counter on `compute_peaks_sidecar`, not a stopwatch).
- [x] A WAV re-render (changed size/mtime) triggers recomputation, never serves a stale sidecar.
- [x] Missing WAV → 404. Any compute failure → 404 (never a 500).
- [x] Concurrent requests for the same WAV compute at most once (lock verified).
- [x] No path-traversal regression — the existing containment behavior on the WAV resolution is unchanged and still enforced.
- [x] `pytest`/`ruff` clean.

## Out of scope

- Frontend consumption of this route — task 008.
- Any manifest/DB field — deliberately rejected (see `../01-map.md`).
