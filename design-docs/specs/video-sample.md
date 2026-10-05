# Chapter Sample Video Contract

```
spec_version: 1.0.0
status: active
sources:
  - app/engines/video_utils.py
  - app/api/routers/chapters_assets.py
  - frontend/src/api/index.ts
  - design-docs/plans/pr-dispatch/08-video-utils-decision.md
```

> **TL;DR:** A one-click, per-chapter "Export Video Sample" renders a short, shareable **MP4**
> (book cover + chapter audio) entirely locally via ffmpeg and returns it for the user to
> download. Length- and orientation-capped; the Studio logo stands in when a project has no
> cover. Nothing is uploaded anywhere.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-07-16 | Initial spec. The per-chapter "Export Video Sample" affordance (present since v1) now produces a real MP4 instead of streaming raw audio. New `POST /api/chapters/{id}/export-video` route; `generate_video_sample` reworked to fill any frame (letterbox, no crop), support orientation + duration, and degrade gracefully when ffmpeg is absent. |

## 1. Purpose

A shareable teaser: from a chapter whose audio is fully rendered, produce a short MP4 pairing the
first N seconds of that audio with the **book cover** as a static visual — suitable for posting to
social media or sending to beta listeners. This is a marketing/delight artifact, **not** a
production deliverable: it is never part of the release/approval gate and is not tracked in the
audiobook deliverable record.

**Artifact category.** MP4 video is a distinct artifact category alongside the existing convention
(voice samples/bundles = MP3, chapter/book render audio = WAV). Video samples are throwaway share
artifacts, regenerated on demand.

## 2. Contract

### 2.1 Route

`POST /api/chapters/{chapter_id}/export-video`

| Param | In | Default | Notes |
|-------|----|---------|-------|
| `chapter_id` | path | — | Canonicalized (UUID); 404 if unknown. |
| `project_id` | query | chapter's project | Resolves cover + storage context. |
| `orientation` | query | `square` | `square` (1080×1080) or `portrait` (1080×1920); unknown → default. |
| `duration` | query | `30` | Seconds of audio; clamped to `[1, 120]`. |

**Responses:**
- `200` — `video/mp4` file body (`Content-Disposition` attachment).
- `404` — chapter/project unknown, or no rendered audio for the chapter yet.
- `503` — ffmpeg is not installed (clear "video tools unavailable" message).
- `500` — render failed for any other reason (generic user-safe message; details logged).

### 2.2 Rendering (`app/engines/video_utils.py`)

- The visual is scaled to **fit** inside the frame and **padded (letterboxed)** onto a dark canvas
  (`0x0B0B0C`) — the whole cover is preserved, **never cropped**.
- Fallback: when the project has no cover, the bundled Studio logo (`assets/logo.png`) is used.
- `-t {duration}` caps the clip; `-shortest` ends it early when the audio is shorter than the cap.
- Output: H.264 (`libx264`, `yuv420p`, `-tune stillimage`, low fps) + AAC audio, `+faststart`.
- ffmpeg absence is detected up front (`shutil.which`) and returns `FFMPEG_MISSING_RC` (127) rather
  than crashing.

### 2.3 Storage & security

- Output is written under the per-project chapter dir
  (`projects/<id>/chapters/<chapter_id>/sample_<W>x<H>.mp4`); orientation is encoded in the filename
  so square/portrait don't clobber each other.
- All input paths (chapter audio, cover) resolve through the standard containment helpers; the
  served file is re-verified under `PROJECTS_DIR` before `FileResponse` (Rule 9).
- **Local-only.** Generation and delivery never touch the network; the user shares the downloaded
  file themselves. No share-to-platform integration exists.

## 3. Frontend

The existing per-chapter "Export Video Sample" menu item (Book Contents/Manuscript stages and the
Project Detail chapter list) is enabled only when `audio_status === 'done'`. It calls
`api.exportChapterVideo`, then downloads the returned blob via `downloadBlob`. Current defaults are
one-click (square, 30s); per-export orientation/length selection and a waveform-based clip picker
are planned follow-ups — the route already accepts the parameters.

## 4. Out of scope (future)

- Waveform clip selection (choose *which* segment of audio, not just the first N seconds).
- Rights/clearance gating and export logging (raised by the Rights Manager / Publisher Ops persona
  lenses); deferred until the clearance model exists.
- Blurred-cover background fill / animated waveform overlay.
