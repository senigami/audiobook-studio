Status: complete — 2026-07-10

# 007 — Peaks serving route (compute-on-miss)

Workload: C · DONE.

Extended `app/api/routers/chapters_assets.py`'s chapter-asset route with a `"peaks"` `asset_type`: resolves the WAV via the existing containment-safe `"audio"` resolution, derives the sidecar path as a deterministic sibling (`<wav>.peaks.json`, no new containment check needed — it's derived, not request-supplied), and serves it via `_load_or_compute_peaks_sidecar` — cache-hit fast path (version + size/mtime match), per-WAV-path lock to prevent duplicate concurrent computation, atomic write (`os.replace` after a temp-file write) on miss/stale/version-mismatch. Missing WAV or any compute failure → 404, never 500. `tests/api/test_peaks_asset_route.py` covers fresh/missing/stale/version-mismatch/missing-WAV/traversal/concurrent-single-compute; stale-detection and concurrent-lock assertions were R1 revert-checked.

See `status.json` for commits `bd3e20cf`, `4bcb74c5`.
