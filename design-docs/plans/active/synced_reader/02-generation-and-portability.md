# 02 — Generation hook, serving route, and portability

> **Provisional pending Task 1.** Exact finalization call site(s) confirmed by
> Task 1's findings.

## Generation: hook into chapter-WAV finalization

- The measurement is independent of *which* finalization path ran: walk the
  authoritative ordered group/WAV-path list (§01) and read each WAV's duration.
  The generator is a single function:
  `build_chapter_timing(project_id, chapter_id, chapter_wav_path, group_paths) -> ChapterGroupTiming`.
- **Fable correction (was wrong in the original draft):** the non-audiobook
  `AssemblyTask` / `stitch_segments` call in `app/orchestration/tasks/assembly.py`
  has **no chapter-stitch caller** — `projects_assembly.py:254` only submits it
  with `is_audiobook=True` (M4B book assembly, a different artifact). The real
  chapter-WAV finalization paths are: sequential rendering via
  `handle_mixed_job` → `_persist_mixed_chapter_output`
  (`tts_engines/tts_mixed/handler.py:~457-590`), the parallel-render `stitch_fn`
  (`app/api/routers/generation_shared.py:288-306`), and crash-recovery
  `_stitch_recovered_chapter` (`app/orchestration/scheduler/orchestrator.py:574-612`).
  All three funnel through `audio_ops.stitch_segments` for the actual
  concatenation **and** through `_persist_mixed_chapter_output` for
  finalization — Task 1 confirms this is a genuine single funnel (not three
  separate call sites to hook independently) and pins the exact function/line
  to call `build_chapter_timing` from.
- **Plugin-boundary note (Fable M3):** `_persist_mixed_chapter_output` lives in
  `tts_engines/tts_mixed/handler.py` (a plugin), not core. Calling core sidecar
  generation from plugin code would deepen an existing boundary crossing.
  Prefer hoisting a "chapter WAV finalized" helper into `app/` (e.g.
  `app/domain/chapters/`) that the plugin already delegates into, and call
  `build_chapter_timing` from that shared helper — not from plugin code
  directly. Task 1 confirms whether such a shared helper already exists or
  needs to be introduced.
- **Ordering-agreement invariant:** the generator MUST use the same ordered
  group/WAV-path list the stitcher actually concatenated — not a fresh DB
  query — so timing and audio can never disagree by construction.
- Failure isolation: a timing-generation exception must **not** fail the
  render — log it and skip the sidecar (reader shows "unavailable").

## Serving: per-chapter timing API route

- Add a route mirroring the existing `.peaks.json` route in
  `app/api/routers/chapters_assets.py`:
  `GET /projects/{project_id}/chapters/{chapter_id}/timing` → the sidecar JSON.
- Reuse the same path-containment helpers the peaks route uses
  (`resolve_chapter_asset_path` / `safe_join` / `_contained_file`) — treat
  every path component as untrusted (`.agent/rules/backend-paths.md`).
- On read: validate against the contract (§01); **404 if the sidecar's
  `audio_generated_at` doesn't match the chapter's current value** (staleness
  binding, Fable H3) in addition to missing-file/version-mismatch. Do NOT
  lazily recompute on GET (unlike peaks): timing is a finalization-time
  product and recomputing here could disagree with the audio if segments
  changed since the render.

## Portability: export + backup + **restore** (owner-approved scope addition)

Owner constraint: timing must survive when a backup includes chapter audio but
not per-segment WAVs. Fable found that **no backup-import/restore endpoint
exists in the codebase at all today** (only create/list/download/delete) — the
owner has approved building general backup restore as part of this plan,
scoped to what's needed to prove the timing sidecar survives round-trip.

- **Backup bundle creation** (`app/api/routers/projects_helpers.py`
  `_create_backup_archive`, ~lines 268–297): wherever the chapter WAV is added
  to the ZIP, also add the paired `<stem>.timing.json`. **Arc-naming fix
  (Fable M2):** the WAV is written under a **sanitized text-derived stem**
  (`stem_name = Path(text_filename).stem`, line ~293), not the on-disk chapter
  WAV's own filename — the sidecar must be written under
  `chapters/<that same sanitized stem>.timing.json` so create/restore agree on
  naming. Record the arc path in the per-chapter `chapter_map` entry alongside
  `audio_path`.
- **Bundle/manifest model (Fable M1 correction):** `ProjectBackupBundleModel`
  and `ProjectExportManifestModel` (`app/domain/projects/models.py:58-80`)
  currently have **no version field at all** — this plan **adds** a validated
  `bundle_version` (or equivalent), it does not "bump" a pre-existing one.
  Follow the versioned-contracts directive: explicit field, validated at load,
  changelog row. Add `timing_path` (optional) to the chapter entry.
- **Restore/import (new — owner-approved):** build the missing import
  endpoint scoped to this plan's need: given a backup archive, extract chapter
  text + chapter WAV (existing bundle contents) **and** the paired
  `.timing.json` if present, writing the WAV and sidecar back into the
  chapter's audio directory so the reader works immediately post-restore —
  even when the archive contains no segment WAVs. This is new, general-purpose
  functionality (not timing-specific plumbing); scope it minimally: restoring
  chapter text/audio/timing into a project is enough to satisfy the
  durability requirement, full project-structure reconstruction (characters,
  speakers, queue state) is out of scope for this plan unless already trivial
  given what's read.
- **Chapter audio export** (any single-chapter "download audio" path): include
  the sidecar as a companion file when present. Task 1 enumerates export entry
  points.

## Interaction with existing GC

- The per-book orphan-segment GC (`cleanup_orphaned_segments`,
  `app/db/segments.py:453-490`) only deletes `.wav/.mp3/.m4a` files under
  `segments/` — it does not touch chapter-level `.timing.json` sidecars
  (Fable M4: confirmed safe as-is, no design change needed). Task 5 needs only
  a confirming test, not new GC logic.
