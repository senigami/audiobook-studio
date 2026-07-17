# 01 — Task 1 findings: finalization funnel, group ordering, player bus

Status: **investigation complete**. This corrects/refines the provisional
assumptions in `01-timing-contract.md`, `02-generation-and-portability.md`,
and `03-reader-frontend.md`. No code was written for this task.

---

## 1. The finalization funnel

**The three call sites the plan named are real, and they do converge — but
not at the plugin function the plan assumed is the best hook point.**

All three sites call the same plugin function,
`_persist_mixed_chapter_output(jid, chapter_id, output_path)`
(`tts_engines/tts_mixed/handler.py:457-478`), immediately after a successful
`stitch_segments` call:

- Sequential: `handle_mixed_job` (`tts_engines/tts_mixed/handler.py:481-611`)
  calls `stitch_segments(...)` at line 590, then
  `_persist_mixed_chapter_output(jid, j.chapter_id, out_wav)` at **line 601**.
- Parallel: `stitch_fn` closure in
  `app/api/routers/generation_shared.py:288-314` calls `stitch_segments(...)`
  at line 295, then `_persist_mixed_chapter_output(task_id, chapter_id,
  out_wav)` at **line 313**.
- Crash-recovery: `Orchestrator._stitch_recovered_chapter`
  (`app/orchestration/scheduler/orchestrator.py:574-611`) calls
  `stitch_segments(...)` at line 583, then `_persist_mixed_chapter_output(
  context.task_id, context.chapter_id, output_path)` at **line 606**.

So yes — genuinely one shared function, three call sites. `grep` confirms
these are the *only* three callers of `_persist_mixed_chapter_output` in the
repo (outside tests).

**But there is a fourth, better convergence point, one level up, that is
already core (non-plugin) code and already has a working precedent for
exactly this kind of post-finalize sidecar generation:**
`TaskOrchestrator.submit()` (`app/orchestration/scheduler/orchestrator.py`).

All three finalization paths are reached only through a `StudioTask.run()`
invoked from inside `submit()`:

- The sequential path runs inside `SynthesisTask.run()`
  (`app/orchestration/tasks/synthesis.py:316-363`, calls `handle_mixed_job`),
  submitted via `background_tasks.add_task(orchestrator.submit, task)`
  (`app/api/routers/generation_chapters.py:216`, `:351`).
- The parallel path runs inside `ChapterSynthesisTask.run()`
  (`app/orchestration/tasks/segment_synthesis.py:1159-1345`, whose
  `stitch_fn` is the `generation_shared.py` closure above), submitted the
  same way.
- The recovery path reconstructs either a `ChapterSynthesisTask` (with
  `_stitch_fn = self._stitch_recovered_chapter`,
  `orchestrator.py:556-564`) or a plain `SynthesisTask`
  (`orchestrator.py:449-466`, `_reconstruct_task`), and re-submits it via
  `threading.Thread(target=self.submit, args=(task,))`
  (`orchestrator.py:433-438`).

`submit()` (`orchestrator.py:82`) dispatches the task, and at
**`orchestrator.py:264-273`**:

```python
if result.status == "completed":
    self._publish(context=context, status="completed", progress=1.0, ...)
    self._emit_chapter_peaks_sidecar(context)
```

`_emit_chapter_peaks_sidecar` (`orchestrator.py:286-327`) is an **existing,
core, engine-agnostic, best-effort post-chapter-finalize hook** — its own
docstring says it fires "at the single engine-agnostic completion point in
`submit()` so it covers BOTH the XTTS remote-synthesis path and the local
`mixed` path without branching on engine id." It guards on
`context.task_type == "synthesis"` and `context.payload.get("scope") ==
"chapter"` and `output_path` ending in `.wav`, then calls
`ensure_peaks_sidecar(wav_path)` — swallowing all exceptions.

Both `SynthesisTask.describe()` (`app/orchestration/tasks/synthesis.py:245-281`,
`scope: "chapter" if self.chapter_id and not self.segment_ids else "job"`)
and `ChapterSynthesisTask.describe()`
(`app/orchestration/tasks/segment_synthesis.py:623-640`, `"scope": "chapter"`
unconditionally) set this scope correctly, and both carry `output_path` and
`voice_profile_id` in `payload`. So `_emit_chapter_peaks_sidecar`'s guard
already fires for exactly the same completed-chapter-render set as the three
plugin call sites above — sequential, parallel, and recovery alike (recovery
re-submits through the same `submit()`, so it hits the same branch).

**Correction to the plan's framing:** "one shared funnel to hook" is true at
two different levels. `_persist_mixed_chapter_output` is the shared funnel
for *DB status writes* (marks the chapter row `done`). `submit()`'s
completed-branch is the shared funnel for *post-finalize side effects*
(peaks sidecar today; timing sidecar should join it here, not at the plugin
function). Hooking at `submit()` needs zero changes to any of the three
call sites or their signatures — see §3 for why the ordered group/path list
doesn't need to be threaded through them.

**Answer: add timing generation as a sibling of `_emit_chapter_peaks_sidecar`,
called from `orchestrator.py:273`** (e.g. add a new
`self._emit_chapter_timing_sidecar(context)` line right after it), not by
modifying `_persist_mixed_chapter_output` or its three callers.

**Note on `assembly.py`:** confirmed correct as stated in the plan —
`AssemblyTask`/`stitch_segments` in `app/orchestration/tasks/assembly.py` is
only submitted with `is_audiobook=True`, from
`app/api/routers/projects_assembly.py:254,258` (M4B book assembly). It is not
a fourth chapter-finalization path; do not hook there.

---

## 2. Core vs. plugin boundary

**A core (non-plugin) "chapter WAV finalized, do a post-finalize side
effect" helper already exists** — it's the very hook identified in §1:
`TaskOrchestrator._emit_chapter_peaks_sidecar`
(`app/orchestration/scheduler/orchestrator.py:286-327`), called from
`app/orchestration/scheduler/orchestrator.py:273`, both fully under `app/`
(core), with zero plugin imports of its own (it imports
`app.engines.audio_ops.ensure_peaks_sidecar`, also core).

This is a closer, cleaner match to the plan's stated need ("hoist a 'chapter
WAV finalized' helper into `app/`... that the plugin already delegates
into") than anything living in `app/domain/chapters/` — I searched for an
existing helper there (`assets.py`, `facade.py`, `helpers.py`,
`operations.py`, `performance_schema.py`, `repository.py`) and confirmed
none of them own a "chapter finalized" cross-cutting hook; `operations.py`
only has direct SQL updates on `chapters`/`chapter_segments`, not a
finalize-event hook. `_persist_mixed_chapter_output` itself remains plugin
code — the plan is right that new core work must not be added inside it —
but per §1, **the correct fix is not to hoist that function's logic into
`app/`; it's to add the new work at the orchestrator hook that already sits
above all three callers**, which was already a step further from plugin
code than `_persist_mixed_chapter_output` is.

**Recommendation for Task 4:** do not touch
`tts_engines/tts_mixed/handler.py`, `generation_shared.py`'s `stitch_fn`, or
`orchestrator.py`'s `_stitch_recovered_chapter` at all. Add:

```python
# orchestrator.py, right after line 273's self._emit_chapter_peaks_sidecar(context)
self._emit_chapter_timing_sidecar(context)
```

with a new `_emit_chapter_timing_sidecar(self, context: TaskContext) -> None`
method mirroring `_emit_chapter_peaks_sidecar`'s guard/try/except shape, that
derives the ordered group list itself (§3) and calls
`build_chapter_timing(project_id, chapter_id, chapter_wav_path, group_paths)`
(the Task 3 generator, living under `app/domain/chapters/`, e.g.
`app/domain/chapters/timing.py`, sibling to `performance_schema.py`). This
keeps engine-ID-agnostic core code as the sole caller of both the model
validator (Task 2) and the generator (Task 3) — plugin code is never
involved.

---

## 3. Authoritative ordered group list

**There is no ready-made `(group_id, wav_path, member_segment_ids[])` list
sitting in a variable at the hook point** — `submit()`/
`_emit_chapter_peaks_sidecar`'s `TaskContext` only carries `output_path`
(the chapter WAV) and `voice_profile_id`, not the per-group path list. But
the exact, authoritative, reproducible list is cheap to rebuild at hook time
from the same inputs all three finalization paths already use, and mapping
by filename is more robust than a positional zip. Concretely:

**Group construction is identical across all three paths.** Every one of
them builds its chunk groups via `build_chunk_groups(<fresh
get_chapter_segments(chapter_id) rows>, voice_profile)`
(`app/domain/chunk_groups.py:47-94`) at (or immediately before) stitch time:

- Sequential: `handle_mixed_job` rebuilds `fresh_groups =
  build_chunk_groups(get_chapter_segments(j.chapter_id), j.speaker_profile)`
  right before stitching (`tts_engines/tts_mixed/handler.py:580`) —
  deliberately fresh per the INV-2 comment at lines 571-578 ("stitch order
  must always be DB/manuscript segment order... rebuilding fresh_groups from
  the DB here... is itself the stitch barrier").
- Parallel: `ChapterSynthesisTask._build_groups()`
  (`app/orchestration/tasks/segment_synthesis.py:985-989`) calls
  `build_chunk_groups(self.script, self.voice_profile_id)`, where
  `self.script` is the same `get_chapter_segments`-sourced row list captured
  when the task was built (`generation_shared.py:257`,
  `_get_chapter_segments(chapter_id)`).
- Recovery: `_reconstruct_chapter_task_from_context`
  (`orchestrator.py:516-554`) fetches `segments =
  get_chapter_segments(chapter_id)` (line 529) and builds the
  `ChapterSynthesisTask` with `script=segments`, so `_build_groups()` runs
  the identical call.

**Each group's WAV file is named after its own leader segment's id**, not
positionally: `_chunk_output_path`/`render_one_group`
(`tts_engines/tts_mixed/handler.py:71-74`, `:380-391`) writes each group to
`chapter_dir/segments/{group["segments"][0]["id"]}.wav`, and the DB's
`audio_file_path` for every member of that group is set to that same
filename (`update_segments_bulk(..., audio_file_path=seg_out.name, ...)`,
handler.py:445-450). `clear_duplicate_segment_audio_paths`
(`app/db/segments.py:256-...`) actively clears any *other* segment's stale
reference to the same filename after each group completes, so under normal
operation each completed group's WAV is uniquely named by its leader's
`chapter_segments.id`.

**Recommended authoritative-list construction for `build_chapter_timing`'s
caller** (in the new `_emit_chapter_timing_sidecar`/generator):

1. `segments = get_chapter_segments(chapter_id)` (fresh, `segment_order` asc
   — same call all three paths make).
2. `groups = build_chunk_groups(segments, context.payload.get("voice_profile_id"))`.
3. `chapter_dir = get_chapter_dir(project_id, chapter_id)`.
4. For each `group` in `groups` (this order **is** the stitch order — INV-2 /
   `_fan_out_chapter`'s `segment_order`-sorted stitch barrier both preserve
   `build_chunk_groups`' input order, which itself preserves `segment_order`
   ASC):
   - `leader_id = group["segments"][0]["id"]` → this **is** the group's
     stable `group_id` (no synthesis needed — chunk-group dicts have no
     `group_id` field today, but the leader segment id already uniquely and
     durably identifies the group, matching the on-disk filename).
   - `wav_path = chapter_dir / "segments" / f"{leader_id}.wav"` (equivalent
     to `_group_ready_audio_path(group, chapter_dir)` in
     `tts_engines/tts_mixed/handler.py:303-308`, which several core modules
     already import directly — `generation_shared.py:254`,
     `orchestrator.py:524` — so importing it from core for this purpose is
     consistent with existing precedent, though a hand-rolled two-line
     equivalent avoids a new plugin import from the new module if preferred).
   - `member_segment_ids = [s["id"] for s in group["segments"]]`.
   - Skip (log, don't fail) any group whose `wav_path` doesn't exist — should
     not happen post-finalize, but stay defensive per the "no estimation"
     contract.
5. This ordered `(leader_id, wav_path, member_segment_ids)` list is exactly
   what was stitched, by construction (same segments fetch, same grouping
   function, same filename convention the stitcher's own inputs used) —
   **matching by filename (leader id), not by position**, which is also
   immune to the one defensive edge case below.

**One nuance to flag, not a blocker:** `handle_mixed_job`'s sequential path
builds its stitched `segment_paths` list with a defensive consecutive-dedup
(`tts_engines/tts_mixed/handler.py:581-584`: `if group_path and
(not segment_paths or segment_paths[-1] != group_path)`). Given the
leader-id-based unique naming and `clear_duplicate_segment_audio_paths`
guarantee above, two *adjacent* groups should never legitimately resolve to
the same file, so this guard should not trigger in practice — but if it
ever did, the filename-driven reconstruction in this section still produces
one timing entry per group (never silently drops one), which is more
correct than mirroring the dedup. No code change is proposed here; just
documenting why the recommended reconstruction (filename-keyed, not
positional) is preferred over trying to intercept the three calls' internal
path lists.

**How to map each `wav_path` back to member `chapter_segments.id`s:**
`group["segments"]` (the list already on the `build_chunk_groups` output
dict) — each entry is a row dict from `load_chunk_segments`/
`get_chapter_segments` and has `["id"]`. No extra query needed beyond the
one `get_chapter_segments` call in step 1.

**Confirming the stitcher's own input:** `stitch_segments`
(`app/engines/audio_ops.py:106-144`, param `segment_wavs: list[Path]`)
receives exactly one path per contributing group in all three call sites —
never one path per raw `chapter_segments` row. The docstring/comment at
`audio_ops.py:126` ("Simple concat for segments (they should all be same
sample rate/channels from the synthesis engine)") is the "assumed, not
guaranteed" risk the contract doc (Fable H2) already flags — confirmed real,
not something Task 1 needs to resolve further.

---

## 4. Chapter's `audio_generated_at` field

Confirmed: **`chapters.audio_generated_at`** (a real column, declared at
`app/db/core.py:189` for the `chapters` table — a same-named column also
exists on `chapter_segments` at `app/db/core.py:253`, used for per-segment
staleness, not to be confused with the chapter-level one).

Written when the chapter WAV finalizes, inside
`_persist_mixed_chapter_output` (`tts_engines/tts_mixed/handler.py:457-468`):

```python
def _persist_mixed_chapter_output(jid: str, chapter_id: str, output_path: Path) -> None:
    generated_at = time.time()
    duration = get_audio_duration(output_path)
    update_chapter(
        chapter_id,
        audio_status="done",
        audio_file_path=output_path.name,
        audio_generated_at=generated_at,
        audio_length_seconds=duration,
    )
```

This is the single write path for the chapter-level field (called from all
three finalization sites per §1), so the timing sidecar's
`audio_generated_at` should be read back from the chapter row (via
`get_chapter(chapter_id)["audio_generated_at"]`) at generation time — not
recomputed with a fresh `time.time()` — so it matches exactly what
`_persist_mixed_chapter_output` already wrote for this same finalize event.
Since the new hook (§1/§2) runs from `submit()` strictly after `task.run()`
returns "completed" (which is strictly after `_persist_mixed_chapter_output`
has already run inside that same `run()` call), the chapter row's
`audio_generated_at` is guaranteed already updated by the time the timing
hook reads it.

---

## 5. Frontend player bus

Confirmed in `frontend/src/store/playerBus.ts`:

- `PlayerScope = 'segment' | 'chapter' | 'preview' | 'book'` (line 7).
- `PlayerBusState.audioUrl: string | null` (line 13).
- `PlayerBusState.position: number` — **seconds** (line 15, explicit
  comment).
- `PlayerBusState.duration: number` — **seconds** (line 16, explicit
  comment).
- `PlayerBusState.scope: PlayerScope | null` (line 10).
- `seek(seconds: number): void` (line 153) —
  `setState({ position: seconds, seekRequestId: state.seekRequestId + 1 })`.

`app/layout/PlayerBar.tsx` is actually
`frontend/src/app/layout/PlayerBar.tsx` (the `app/` in the plan's shorthand
is `frontend/src/app/`, consistent with this repo's documented frontend
layout — not an error). It only *consumes* the bus
(`usePlayerBus`/`seek`/`play`/`pause`/etc., line 3) — it never itself sets
`scope`; scope is set by whichever page calls `loadAndPlay`.

**The Book tab already sets `scope: 'chapter'` when its chapter player is
active.** `frontend/src/pages/Book/components/ChapterTable.tsx`:

```ts
// line 147-150
const audioUrl = audioPath
  ? `/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${encodeURIComponent(audioPath)}`
  : null;
const isCurrentChapterAudio = audioUrl != null && playerBus.scope === 'chapter' && playerBus.audioUrl === audioUrl;
```

and its play button (line 244-250):

```ts
loadAndPlay({
  scope: 'chapter',
  title: chapter.title || 'Chapter Audio',
  subtitle: `Chapter ${index + 1}`,
  audioUrl,
});
```

So the reader's `useReaderSync` gate should be exactly
`playerBus.scope === 'chapter' && playerBus.audioUrl === <this chapter's
same-shaped audioUrl>` — reusing the identical URL-construction expression
already at `ChapterTable.tsx:147-149`
(`/api/projects/{project_id}/chapters/{chapter_id}/assets/audio?filename=${encodeURIComponent(audio_file_path)}`),
not a request the reader's mount needs to make itself — the Book tab's
existing play button is the only thing that ever sets this scope today.
(`CastPalette.tsx:336-337` sets `scope: 'preview'` for voice-cast previews —
confirms the gate is necessary, since preview playback shares the same bus.)

---

## 6. Fullscreen helper

Confirmed: `grep -rl "requestFullscreen\|useFullscreen\|fullscreenElement\|exitFullscreen" frontend/src` returns **no matches**. No existing fullscreen helper exists anywhere in the frontend. Task 8's `useFullscreen` hook is genuinely net-new code, as the plan already assumed.

---

## 7. Export entry points

Besides the backup archive (`app/api/routers/projects_helpers.py`
`_create_backup_archive`, confirmed at lines 221-295, `stem_name` logic at
line 293 as the plan cites), there are **two** additional single-chapter
audio download paths, both under `app/api/routers/chapters_assets.py`:

1. **`GET /projects/{project_id}/chapters/{chapter_id}/assets/{asset_type}`**
   with `asset_type="audio"` (`chapters_assets.py:155-211`) — the generic
   chapter-asset route. This is what the frontend actually uses today both
   for playback (`ChapterTable.tsx` builds this URL directly, see §5) and
   for its "Download Audio" menu item (`ChapterTable.tsx:271-279`, same URL
   with `?filename=`). This route is also where the *existing* `.peaks.json`
   sidecar convention lives (`asset_type="peaks"` branch,
   `chapters_assets.py:165-179`) — the exact precedent `02-...md` wants the
   new `.../timing` route to mirror.
2. **`POST /chapters/{chapter_id}/export-audio`** (`chapters_assets.py:64-97`)
   — a dedicated export endpoint (`AudioExportRequest.format` = `"wav"` or
   `"mp3"`) that calls `export_chapter_audio(chapter_id, format=...)`
   (`app/domain/chapters/assets.py:10-50`) and returns a `FileResponse`.

**Correction to the plan's framing:** both of the above are **single-file**
`FileResponse` downloads (a raw WAV or MP3 byte stream) — there is no
"bundle" for either one to attach a companion `.timing.json` file to; unlike
the backup archive (a ZIP that can hold multiple files), a single audio
`FileResponse` has no natural carrier for a second file. Attaching the
sidecar to these two routes would require either (a) changing their
response shape (out of scope — no such change is requested or needed), or
(b) the frontend fetching the dedicated `GET .../chapters/{chapter_id}/timing`
route independently, which is already the planned design (§02/Task 5) and
is sufficient: the reader is a live, in-app view that talks to the API
directly, it never consumes a locally-downloaded file. **Only the backup/
restore path (Task 6) genuinely needs the sidecar embedded in an archive**,
because that's the one portability case where the timing JSON must survive
without a live API to fetch it from (round-tripping through a ZIP that may
be restored on a different machine/session). No further export-route
changes are needed beyond what §02/Task 6 already scope.

Two more chapter-audio-adjacent routes exist and were checked, neither is
relevant to the sidecar:
- `POST /chapters/{chapter_id}/export-video` (`chapters_assets.py:281-359`)
  — produces an MP4 (audio + cover art), not exported chapter audio; a video
  container has no meaningful use for a JSON timing sidecar.
- `POST /chapters/{chapter_id}/export-sample` (`chapters_assets.py:214-252`)
  — returns a JSON `{status, url}` pointing back at the `assets/audio` route
  above; it doesn't itself serve bytes.

---

## Ready to proceed

No blocking ambiguity remains. Summary of the pinned facts Tasks 2-9 should
build from:

- **Hook point (Tasks 1/4):** add a new
  `TaskOrchestrator._emit_chapter_timing_sidecar(context)` method, called
  immediately after `self._emit_chapter_peaks_sidecar(context)` at
  `app/orchestration/scheduler/orchestrator.py:273`. Do not touch
  `_persist_mixed_chapter_output` or its three callers.
- **Core vs. plugin (Task 1):** the orchestrator hook above is the core
  helper; no plugin code needs to change.
- **Group ordering source (Tasks 3/4):** rebuild
  `build_chunk_groups(get_chapter_segments(chapter_id), voice_profile_id)`
  fresh at hook time (`voice_profile_id` already available on
  `context.payload`); key each group by its leader segment id
  (`group["segments"][0]["id"]`), resolve
  `chapter_dir/"segments"/f"{leader_id}.wav"`, and use `group["segments"]`
  for member `segment_ids`. This is provably the same construction all
  three finalization paths already use.
- **`audio_generated_at` (Task 2/3):** `chapters.audio_generated_at`,
  read back via `get_chapter(chapter_id)` at generation time (already
  written by the time the new hook fires), not a fresh timestamp.
- **Player bus (Task 7):** `scope: PlayerScope | null` (`'segment' |
  'chapter' | 'preview' | 'book'`), `audioUrl: string | null`,
  `position`/`duration` in seconds, `seek(seconds: number)`. The Book tab's
  `ChapterTable.tsx` already sets `scope: 'chapter'` + the matching
  `audioUrl` on chapter play; the reader gates on the same two fields, no
  new scope-setting code needed elsewhere.
- **Fullscreen (Task 8):** confirmed no existing helper; net-new.
- **Export entry points (Task 6):** two single-file FileResponse routes
  found beyond the backup archive
  (`assets/{asset_type}=audio` and `POST .../export-audio`); neither needs
  a code change for sidecar portability — only the backup/restore archive
  does.

No open questions require a human decision before Task 2 begins.
