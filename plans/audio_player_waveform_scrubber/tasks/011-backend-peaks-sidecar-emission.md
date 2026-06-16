# 011 — Backend peaks sidecar emission

status: todo
workload: W3 — Peaks sidecar (backend) — later
blocked-by: 010
blocks: 012

## Goal

At **production time**, emit a downsampled peaks sidecar for any audio artifact whose duration exceeds a configurable threshold. The producing task writes the sidecar alongside the WAV; the artifact manifest records a reference to it; a contained HTTP route serves it to the frontend. This is a **data-model change** — `ArtifactOutputModel` gains a `peaks_path` field — and `docs/specs/data-model.md` must be updated in the same commit.

## Why it matters

The browser-first phase (W2) caps the tape at ~10–15 min because browser decode of a long WAV is a memory bomb (~600 MB float32 for an hour). The sidecar lifts that cap: when a peaks JSON file exists for the loaded audio URL, the frontend never downloads or decodes the WAV — it renders directly from the peaks array. The sidecar is tiny (a few MB for an hour vs. 150–300 MB WAV) and is computed once at production time, never lazily.

This task is the heavy one in W3. Everything else in the workload is thin because the investment here is front-loaded.

## Files

### Data model
- `app/domain/artifacts/models.py` — add `peaks_path: str | None` to `ArtifactOutputModel`; update `to_dict()` / `ArtifactManifestModel.to_dict()` / `_coerce_artifact_output` in reconciliation
- `app/orchestration/progress/reconciliation.py` (`:390–410`) — update `_coerce_artifact_output` to read `peaks_path` from the candidate dict and pass it through
- `docs/specs/data-model.md` — add `peaks_path` to the artifact output model section; bump `spec_version`; add changelog row

### Peaks computation
- `app/engines/audio_ops.py` — add `compute_peaks_sidecar(wav_path, sidecar_path, *, num_peaks=1000)` using ffmpeg + numpy/struct; or ffprobe for samples if preferred
- `app/utils/subprocess_utils.py` — already has `probe_audio_duration` / `FFPROBE_DURATION_CMD`; add `probe_audio_sample_rate_channels` if not present (needed to record `sample_rate`/`channels` for the first time — they are currently hardcoded convention)

### Synthesis hook
- `app/orchestration/tasks/synthesis.py` (`:202–249`, result path) — after a segment WAV is finalized, probe its duration; if `duration_sec > PEAKS_SIDECAR_THRESHOLD_SEC`, call `compute_peaks_sidecar` and record `peaks_path` in the artifact output

### Assembly hook
- `app/orchestration/tasks/assembly.py` (`:164–173`, post-stitch) — after `stitch_segments` returns rc=0 and `output_path.exists()`, probe chapter duration; if over threshold, call `compute_peaks_sidecar` and record `peaks_path` in the returned `TaskResult` or artifact metadata

### HTTP route
- `app/api/routers/` (add to an appropriate domain router, e.g. `projects.py` or a new `artifacts.py`) — a contained GET route that resolves the sidecar path using `safe_join`/`secure_join_flat`, verifies containment under the projects root, and streams the JSON. Must reject path traversal; must never echo raw paths in error responses.

### Tests
- `tests/engines/test_audio_ops.py` (new or extend) — `compute_peaks_sidecar` emits a valid JSON file with the expected structure; revert-check per R1
- `tests/orchestration/tasks/test_synthesis_peaks.py` (new) — over-threshold segment → sidecar emitted alongside WAV; under-threshold → no sidecar; revert-check per R1
- `tests/orchestration/tasks/test_assembly_peaks.py` (new) — over-threshold chapter → sidecar emitted; revert-check per R1
- `tests/api/test_peaks_route.py` (new) — valid request returns sidecar JSON; path traversal rejected; missing sidecar returns 404

## Target shape / contract

### `ArtifactOutputModel` (after change)

```python
@dataclass
class ArtifactOutputModel:
    duration_ms: int
    sample_rate: int
    channels: int
    peaks_path: str | None = None   # NEW — relative path from projects root, or None
```

`peaks_path` is `None` for artifacts under the duration threshold or where sidecar emission failed (non-fatal). It is a path relative to the projects storage root, not an absolute filesystem path, and it is never echoed in error responses.

### Manifest serialisation (`to_dict`)

```python
"output": {
    "duration_ms": self.output.duration_ms,
    "sample_rate": self.output.sample_rate,
    "channels": self.output.channels,
    "peaks_path": self.output.peaks_path,   # NEW — may be None
},
```

`_coerce_artifact_output` in `reconciliation.py:390–410` reads `peaks_path` from the dict and passes it through; old manifests without the key deserialize to `peaks_path=None` (backward-compatible).

### Sidecar file format

Path convention:
- Segment: `segments/<segment_id>.peaks.json` (alongside `<segment_id>.wav`)
- Chapter: `chapters/<chapter_id>/chapter.peaks.json` (alongside `chapter.wav`)

File contents (JSON, no schema version in V1 — keep it minimal):

```json
{
  "peaks": [0.12, -0.34, 0.05, ...],   // float32, range [-1, 1], length = num_peaks
  "duration": 3723.4,                   // seconds (float)
  "sample_rate": 24000,
  "channels": 1,
  "num_peaks": 1000
}
```

`num_peaks` defaults to 1000 for a 60-min clip (~1 peak per 3.6 s); tunable via a module-level constant `PEAKS_SIDECAR_NUM_PEAKS = 1000`. The resolution sets the zoom-in cap on the frontend (proposal §3).

### Duration threshold

Module-level constant in `audio_ops.py`:

```python
PEAKS_SIDECAR_THRESHOLD_SEC: float = 600.0   # 10 minutes; tunable
```

Artifacts with `duration_sec <= PEAKS_SIDECAR_THRESHOLD_SEC` get no sidecar (browser decodes). The same constant governs both synthesis and assembly hooks.

### Duration / sample_rate / channels probing

`probe_audio_duration` already exists at `audio_ops.py:52–57` → `subprocess_utils.py:36–52` (ffprobe, returns float seconds). For `sample_rate` and `channels`, add `probe_audio_sample_rate_channels(wav_path) -> tuple[int, int]` to `subprocess_utils.py` using ffprobe's `stream=audio` JSON output. Both values are stored in `ArtifactOutputModel` at artifact creation time (currently hardcoded 24 kHz mono convention).

### Peaks computation

`compute_peaks_sidecar(wav_path: Path, sidecar_path: Path, *, num_peaks: int = PEAKS_SIDECAR_NUM_PEAKS) -> None`

Implementation options (in order of preference):
1. FFmpeg pipe + struct unpack: `ffmpeg -i wav_path -f f32le -ac 1 pipe:1` → read raw float32 frames in chunks → downsample to `num_peaks` values by taking the max-absolute per bucket.
2. If scipy/numpy is available in the venv at call time, use `scipy.io.wavfile.read` → downsample.

Prefer option 1 (FFmpeg is always present; avoids a scipy dependency). Write to `sidecar_path.with_suffix('.tmp')`, then rename to `sidecar_path` atomically.

On any exception, log a warning and return without raising — a missing sidecar is non-fatal (frontend browser-decodes as fallback).

### Immutable cache entries

Shared artifact cache entries are immutable (modular_architecture rule). The sidecar is a **new file** written alongside the WAV — it does not mutate the WAV or the existing manifest. If a sidecar already exists at the target path, skip re-computation (idempotent production behavior).

If the manifest is already sealed (cache hit / reuse path), do NOT write a new sidecar — the artifact is already complete. Sidecar emission happens only at the tail of the first successful production of that artifact.

### Contained HTTP route

```
GET /api/artifacts/peaks?project_id=<id>&chapter_id=<id>&artifact=chapter
GET /api/artifacts/peaks?project_id=<id>&chapter_id=<id>&segment_id=<id>&artifact=segment
```

The route handler:
1. Resolves the expected sidecar path using `secure_join_flat` / `safe_join` from the projects root.
2. Asserts the resolved path is under `PROJECTS_ROOT` (containment check).
3. Returns the JSON file contents with `Content-Type: application/json`.
4. Returns 404 if the sidecar does not exist (frontend falls back to browser decode).
5. Returns 400 for invalid/missing parameters. Never echoes raw paths in any error body.

### `data-model.md` update

Bump `spec_version` to 1.2.0. Add changelog row. Add a subsection under the artifact model section documenting `peaks_path` semantics: relative path from projects root, `None` for sub-threshold artifacts, written at production time, served via the contained peaks route.

## Steps

1. Add `peaks_path: str | None = None` to `ArtifactOutputModel`; update `to_dict()` to include it; update `_coerce_artifact_output` in `reconciliation.py:390–410` to read `peaks_path` from the candidate dict (default `None`). Run pytest — must be green.
2. Add `probe_audio_sample_rate_channels` to `app/utils/subprocess_utils.py` (ffprobe JSON stream probe).
3. Add `compute_peaks_sidecar` to `app/engines/audio_ops.py` (FFmpeg pipe → float32 downsample → atomic JSON write).
4. Add `PEAKS_SIDECAR_THRESHOLD_SEC` constant to `audio_ops.py`.
5. Hook synthesis task (`tasks/synthesis.py`): after segment WAV is finalized and duration is known, if `duration_sec > PEAKS_SIDECAR_THRESHOLD_SEC` call `compute_peaks_sidecar`; store relative `peaks_path` in the artifact output. Errors in sidecar emission must not fail the synthesis task.
6. Hook assembly task (`tasks/assembly.py`): after `stitch_segments` rc=0, probe chapter duration, conditionally emit sidecar. Errors must not fail the assembly task.
7. Add the contained HTTP route for serving sidecar JSON.
8. Update `docs/specs/data-model.md`: add `peaks_path` docs, bump `spec_version` to 1.2.0, add changelog row.
9. Write tests (see Files section). Each bug-fix test must fail on pre-fix code (R1). Tests may mock only what is outside the unit under test: filesystem writes, ffprobe/ffmpeg subprocess calls — not the audio_ops module itself.
10. Run `./venv/bin/python -m pytest -q` — green. Run `ruff check .` — clean.

## Acceptance criteria

- `ArtifactOutputModel` has a `peaks_path: str | None = None` field; `to_dict()` emits it; `_coerce_artifact_output` round-trips it; old manifests without the key deserialize cleanly to `None`.
- `docs/specs/data-model.md` updated: `spec_version` bumped to 1.2.0, changelog row added, `peaks_path` semantics documented.
- Over-threshold artifact (synthesis): sidecar JSON written at `segments/<id>.peaks.json` alongside the WAV; manifest `peaks_path` is set.
- Over-threshold artifact (assembly): sidecar JSON written at `chapters/<id>/chapter.peaks.json` alongside `chapter.wav`; manifest `peaks_path` is set.
- Under-threshold artifact: no sidecar written; `peaks_path` is `None`.
- Sidecar emission failure (e.g. ffmpeg not found in test environment): synthesis/assembly task still completes successfully; `peaks_path` remains `None`.
- Existing sidecar at target path: skipped (idempotent), immutable manifest not mutated.
- HTTP route: returns sidecar JSON for a valid request; 404 for missing sidecar; rejects path traversal (returns 4xx, never echoes raw path).
- `sample_rate` and `channels` are probed from the audio file and stored in `ArtifactOutputModel` (no longer hardcoded convention).
- pytest green. ruff clean.

## Out of scope

- Frontend sidecar fetch or URL resolution — that is 012.
- The duration cap lift — that is 012.
- Virtualized rendering — that is 012.
- Annotation / edit-marking.
- Sidecar for voice sample previews — samples are short MP3s, always under threshold.

## References

- Roadmap: `plans/audio_player_waveform_scrubber/01-roadmap.md` (W3, task 011)
- Audit Finding F2 (backend scope): `00-audit-report.md §E`
- Audit §C (backend current state — assembly no duration, hardcoded sr/channels)
- Proposal §7 (sidecar strategy and threshold rationale)
- `app/domain/artifacts/models.py:14–21, 35–75` — current `ArtifactOutputModel` / `ArtifactManifestModel`
- `app/orchestration/progress/reconciliation.py:390–410` — `_coerce_artifact_output`
- `app/engines/audio_ops.py:52–57` — `get_audio_duration`
- `app/utils/subprocess_utils.py:36–52` — `probe_audio_duration`
- `app/orchestration/tasks/synthesis.py:202–249` — synthesis result path
- `app/orchestration/tasks/assembly.py:130–173` — assembly run / stitch call
- `app/storage/project.py:20–38` — `ProjectContext` paths
- `docs/specs/data-model.md` — current spec (1.1.0)
- `.agent/rules/backend-paths.md` — path-containment helpers (`safe_join`, `secure_join_flat`)
- `.agent/rules/modular_architecture.md` — immutable shared-artifact cache entries
- `docs/specs/testing-standards.md` — R1 revert-check, R2 mock boundaries
