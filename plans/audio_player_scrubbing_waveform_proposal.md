# Proposal — Scrubbing waveform + duration-adaptive scrub track

```
status: DRAFT — proposal, not yet approved. No code, no spec edit until owner sign-off.
author: design (Apple HIG lead) + owner
date: 2026-06-16
supersedes (if approved): audio-player.md §5 "representation follows scope" → "representation follows fit"
related: docs/specs/audio-player.md (1.5.0), docs/specs/design-system.md §9, ADR-0010
```

> **TL;DR:** Replace the *scope-based* waveform rule (segment → wave, chapter → bar) with a *fit-based* rule: the inline scrub track is a waveform whenever the whole loaded clip renders legibly at the current bar width, and a plain seek bar when it doesn't. When it's a bar, the existing far-right `AudioLines` toggle opens an **expanded "tape"** — a **paged**, click-and-drag-scrub detail view with a minimap and a small set of **bounded zoom presets**. The player only ever reasons about **the audio currently loaded in it**, which removes the per-segment-timing backend dependency entirely. Annotation/edit-marking is **post-V2** and out of scope here.

> **Spec-rewrite note (owner):** these specs describe how we view the code *now*, not the path we took to get here. When this is promoted into `audio-player.md`, §5 is **rewritten clean** — we do not document the prior experimentation, the removed R7 expansion strip, or "re-added" history. The changelog gets one ordinary entry for the new design.

---

## 1. What changes vs. today

Current contract (audio-player.md §5, owner-affirmed across 1.2.0→1.5.0):

- **Segment scope** → wavesurfer waveform inline as the scrub track (a few seconds of speech, legible).
- **Chapter scope** → plain seek slider (an hour of narration is a "near-uniform amplitude carpet").
- Far-right `AudioLines` toggle (`forceWave: boolean | null`) flips waveform ↔ bar, reset to scope default on each new source.

The owner reasoning behind that rule is **correct and preserved** — we are not putting a useless compressed waveform back into the bar. We are changing *what decides* between waveform and bar, and adding a real way to get legible detail at long durations (zoom) instead of giving up.

### The one-line shift

| | Today | Proposed |
|---|---|---|
| Decides inline waveform vs. bar | **scope** (`segment` vs `chapter`) | **fit** (does the whole clip render legibly at this width?) |
| Long-clip detail | not available (bar only) | `AudioLines` toggle opens an **expanded zoomed tape** |
| Player's knowledge of the world | scope-aware | **only the currently-loaded audio** — no outside context |

---

## 2. Why fit beats scope (the part the owner was struggling with)

Scope is a *proxy* for "is this short enough to read." Duration is the real variable, and even duration is a proxy for the true predicate: **pixels-per-second at the current bar width.** A 90-second segment and a 90-second chapter clip should look identical in the bar; tying behavior to the word "chapter" was an accident of how the data is labeled.

**Primary rule (proposed):** render the inline waveform when the whole clip fits at ≥ a legibility floor of px/sec at the *current* bar width; otherwise render the bar. This is a computed predicate, not a magic number, and it composes with the container-query reflow the bar already uses (§5.1 today).

- 🟢 Suggested floor: **~3 px/sec** of readable structure. At a ~600 px inline track that's ~200 s (~3.3 min) before it collapses to a bar; on a wide desktop bar the threshold rises automatically, on a narrow window it falls — which is the correct, HIG-deferential behavior (the control adapts to the material and the container).
- For SSR / first paint before width is known, fall back to a **duration threshold (~120 s)** and re-evaluate on mount. The duration number is only a bootstrap; px/sec is the truth.

This unifies the owner's own words — "once the waveform becomes compact enough, then it becomes just a bar" — into one rule that needs no scope branching. (It also happens to honor `modular_architecture.md`: no engine/scope-ID branching for core behavior.)

---

## 3. The expanded "tape" (the magnifying glass)

When the inline track is a **bar** (long clip), the far-right `AudioLines` toggle stops being "swap inline look" and becomes "**open the detail tape**." This is exactly the owner's framing: "we have that icon on the right already, which would allow us to pop it over to the wave view and give that scrubber area."

### Layout
- The tape opens as a **taller region above the control row, inside the PlayerBar's own footprint** (the bar grows upward — owner-approved; it does **not** become a floating window or sheet). Single-owner invariant intact — same one `<audio>`, same one wavesurfer instance, re-rendered larger. Closing returns the bar to one row.
- Suggested tape height ~96–120 px (vs. the 32 px inline track) so amplitude structure is genuinely legible.

### Motion — paged by default (owner)
- **Default = paged window.** The tape shows a fixed window of audio with a **moving playhead** traversing it; when the playhead reaches the window edge, the window **advances one page** (teleprompter-paging), it does not scroll continuously. This is calmer, far cheaper to render, and is what we ship by default — not just under Reduce Motion.
- **Reduce Motion** changes nothing for us here since paged *is* the default; we simply never enable a continuous-scroll mode that would violate it. (A smooth center-playhead scroll could be a future opt-in, but it is **not** part of this design.)

### Interaction (all owner-approved)
- **Click to jump** anywhere on the tape → `bus.seek()`.
- **Drag to scrub** — grab the tape and drag the audio under the playhead (relative/fine navigation). Complements, doesn't replace, the bar's absolute tap-to-jump.
- **Minimap** (owner's favorite, and mine — and now load-bearing): a thin **full-clip** strip with a translucent rectangle marking the tape's current window/page. Because the tape never shows the whole hour (see Zoom), the minimap is *the* whole-clip map: the rectangle's width = how much audio the current zoom shows, and dragging it is coarse navigation across the entire clip. This makes the overview↔detail relationship *visible* instead of magic — the thing that makes pro timelines learnable.

### Zoom — a few bounded presets (owner)
Modeled on the **cover-size slider** we already shipped: a small set of **discrete magnification presets** with snap points and tick dots, **bounded on both ends**. We do **not** offer free continuous zoom and we do **not** zoom out to show the entire clip (the minimap does that).
- **Zoom-in cap = native peak resolution** — never magnify past the detail the peaks actually carry, so the waveform never degrades into a fabricated-looking shape.
- **Zoom-out cap = before "blob"** — the least-detailed preset still shows legible speech/pause structure, never a single uniform bar.
- 🟢 Suggested presets as *seconds-of-audio across the tape viewport* (tunable starting values): **8 s · 15 s · 30 s · 60 s · 120 s** — most-zoomed shows ~8 s of detail; least-zoomed shows ~2 min and stops there. Each step is a linear magnification affecting px/sec at reasonable amounts.
- 🟡 **Control:** lead with **direct manipulation** — pinch (trackpad) / scroll-wheel-over-tape snaps through the presets — backed by a **secondary − / slider / + with tick dots** for discoverability and consistency with the cover slider. Snap-to-preset, never free-floating.
- Zoom level is **per-source session state** (remembered while a clip is loaded, reset to the default preset on each new source via `requestId`), consistent with how `forceWave` already resets. Not persisted across sessions.

---

## 4. The backend question — fully sidestepped (owner)

🟢 **The player only ever reasons about *the audio currently loaded in it*, which removes the backend dependency entirely:**
- A **segment** clip is the only audio loaded; on `onEnded` the adapter loads the next segment (already how the VCR adapter works, §4). Scrubbing/zooming/paging within it needs zero outside context.
- A **chapter** clip is the whole assembled WAV; zooming, paging, and scrubbing within it only need that WAV's peaks. No per-segment offset table required.

So the §6 "no per-segment timestamp into the assembled chapter WAV" limitation **does not touch** this feature at all.

### Annotation / edit-marking → post-V2 (owner)
Marking edit points directly on the tape is **explicitly out of scope for V2** and deferred. The honest reason it can't be done cleanly today is that an *actionable* chapter-scope mark ("mark here → re-render that segment") needs timestamp→segment mapping the backend doesn't have. Rather than ship a half-version (visual bookmarks that don't re-render), we defer the whole annotation workflow until the backend offset data exists. This proposal covers **display + navigation only**.

---

## 5. HIG guardrails (binding if approved)

- 🟢 **Paged by default satisfies Reduce Motion for free.** Because the tape pages rather than continuously scrolls (§3), there is no continuous auto-scroll to suppress. We simply never enable a smooth-scroll mode. OS Reduce Motion still suppresses incidental transitions (page-advance can be an instant cut rather than an animated slide when the setting is on).
- 🟢 **Calm by default, motion on demand.** The persistent bar stays calm (bar or short inline waveform). The tape is something the user **opens** — the bar never grows or animates on its own. The page-advance motion is a *deliberate, contained* event, not ambient noise competing with read-along.
- 🟢 **Targets ≥ 44 pt** for the scrub grab area, minimap rectangle, and zoom controls. The toggle needs an `aria-label`; keyboard: ←/→ nudge, `+`/`-` step zoom presets.
- 🟡 **Contrast on glass.** Playhead line and markers must read against the translucent bar — solid accent for the playhead, not glass-on-glass tint.
- 🟢 **Single-owner preserved.** One `<audio>`, one wavesurfer instance, re-rendered/repositioned. The expanded tape must not spawn a second audio owner (the conversion-complete grep in §4 must still match only `PlayerBar.tsx` + capture).

---

## 6. State model (for the spec rewrite of §5)

```
inlineTrack =
  forceWave === true                      → waveform (user override on)
  forceWave === false                     → bar      (user override off)
  forceWave == null && fitsLegibly(dur,w) → waveform (auto: short/wide)
  forceWave == null && !fitsLegibly       → bar       (auto: long/narrow)

fitsLegibly(durationSec, barWidthPx) = (barWidthPx / durationSec) >= PX_PER_SEC_FLOOR  // ~3
// bootstrap before width known: durationSec <= DURATION_BOOTSTRAP (~120s)

AudioLines toggle behavior:
  inlineTrack === waveform → toggle flips inline to bar (and back)   // unchanged from 1.4.0
  inlineTrack === bar      → toggle OPENS/CLOSES the expanded tape    // NEW

expanded tape (open state, long clips):
  - paged window + moving playhead (page-advance at edge); no continuous scroll
  - click→seek, drag→scrub
  - minimap = full-clip strip; window rectangle (width = current zoom span), drag = coarse nav
  - bounded zoom PRESETS (e.g. 8/15/30/60/120 s across viewport):
      in-cap  = native peak resolution (no fabricated detail)
      out-cap = legible structure, never a single-bar blob, never the whole clip
      pinch/wheel snaps through presets; ±/slider secondary
  - zoom + tape state reset to default preset on new source (requestId)
```

`forceWave`/`requestId` plumbing already exists (1.4.0/1.5.3) — this extends it, doesn't rebuild it.

---

## 7. Peaks data — browser-first now, server sidecar later

**Strategy (owner): rely on the browser now; fold in a server peaks sidecar later, only for files long enough to need it.** This unblocks the *entire* feature — inline waveform, tape, zoom, scrub, minimap — with **zero backend work**, and the later sidecar is a transparent optimization.

### Why this is clean, not a double-build
wavesurfer renders from **peaks**, and it accepts either browser-decoded peaks *or* pre-supplied `peaks` (with `duration`) that bypass decode. The tape/zoom/scrub/minimap UI is **identical** regardless of source. So adding the server sidecar later changes only **where the peaks come from** — a contained source-swap behind one seam, not a UI rebuild. (This corrects an earlier draft that treated browser-then-sidecar as building the chapter path twice; it isn't.)

### The cost ceiling, and the safety cap — keyed on duration, not scope
The decision is governed by **audio duration alone**, never the segment/chapter label: a short chapter decodes fine, and a long segment (a large-`text_chunk_limit` engine can emit a paragraph-length chunk) may not. The bottleneck is **download size + decode memory, not CPU**:
- Render audio is uncompressed **WAV**: an hour ≈ **150–300 MB** on the wire.
- `decodeAudioData` holds the full decoded PCM: an hour ≈ `44100 × 3600 × 4 B` ≈ **~600 MB** float32/channel — a memory bomb that janks/crashes the tab.

So the browser-first phase ships with a **duration cap** (🟡 starting value ~**10–15 min**, tunable to where decode stays comfortable), applied to *any* loaded clip regardless of scope. **At or below the cap:** browser-decode, full waveform/tape/zoom. **Above the cap:** behave exactly like today — plain seek bar, no tape offered. No regression, no crash. The cap is a *safety guard*, not a feature gate the user fights.

### Folding in the sidecar later
When ready, the **producing task emits a downsampled peaks sidecar at production time for any artifact over the duration threshold** — the *synthesis* task for a long segment, the *assembly* task for a chapter (a validated artifact, per the "decisions use validated artifact metadata" model; computed once at production, never lazily on playback). Artifacts under the threshold get no sidecar and simply browser-decode. Then:
- The player's rule is uniform and scope-blind: **if a sidecar exists for the loaded URL, render from it; else browser-decode.** The UI is untouched either way.
- The **duration cap lifts toward the full hour** for clips that have a sidecar, because we no longer download/decode the WAV in the browser.
- The sidecar is **tiny vs. the WAV** (a few hundred peak pairs/sec → a few MB even for an hour); its resolution **sets the zoom-in cap** (§3).
- Add **windowed/virtualized rendering** (draw the visible page ± buffer) for the hour-long case.

---

## 8. Proposed rollout (if approved)

- **Phase 1 — Spec rewrite + fit-based inline rule (pure frontend).** Swap `scope === 'segment'` for `fitsLegibly(...)` in `PlayerBar`; rewrite §5. Segments and short chapters get the inline waveform via browser decode; longer clips fall to the bar. No new surface, smallest/safest, shippable alone.
- **Phase 2 — Full tape + zoom, browser-decoded (pure frontend).** The whole UX — paged window + moving playhead, click+drag scrub, minimap, bounded zoom presets, `AudioLines`-opens-tape — built against **browser-decoded peaks**, gated by the **length cap** (§7). Works for segments and short/medium chapters (the realistic majority during dev and early use). Above the cap → plain bar, exactly like today. **Zero backend.**
- **Phase 3 — Server peaks sidecar (backend + thin frontend), later.** The **producing task emits the downsampled peaks artifact at production time** for any clip over the duration threshold — synthesis for a long segment, assembly for a chapter (§7). The peaks **source** swaps to the sidecar for clips that have one, **lifting the duration cap toward the full hour**; add virtualized rendering. The UI from Phase 2 is unchanged — this is a source-swap + perf layer, not a rebuild.
- **Annotation / edit-marking — post-V2, not scheduled here.** Gated on backend per-segment offset data (§4); excluded from this proposal entirely.

---

## 9. Decisions — resolved with owner (2026-06-16)

1. **Legibility floor** ✅ ~3 px/sec, width-adaptive, ~120 s bootstrap fallback.
2. **Annotation** ✅ deferred **post-V2**; display + navigation only.
3. **Tape placement** ✅ **grow the bar upward** (single surface, single focus context).
4. **Zoom** ✅ a few **bounded discrete presets** (cover-slider style): in-cap at native peak resolution, out-cap before blob, never the whole clip (minimap owns whole-clip nav). Pinch/wheel snaps; ±/slider secondary.
5. **Motion** ✅ **paged by default** (moving playhead, page-advance at edge); no continuous scroll mode.
6. **Spec authoring** ✅ when promoted, §5 is **rewritten clean** — no experimentation/revert history recorded.
7. **Peaks strategy** ✅ **browser-first now, server sidecar later.** Build the whole UX against browser-decoded peaks (Phases 1–2, zero backend); fold in a peaks sidecar (Phase 3) only for clips past the threshold. Source-swap behind one seam, not a rebuild.
8. **Duration-driven, scope-blind** ✅ both the display rule *and* the peaks/cap decision key on **audio duration alone**, never segment-vs-chapter. A short chapter browser-decodes; a long segment gets a sidecar. The sidecar is emitted by whichever task produces the artifact (synthesis for segments, assembly for chapters) when its duration exceeds the threshold.
9. **Safety cap** ✅ browser-first ships with a duration cap (~10–15 min, tunable); above it → plain bar (today's behavior), so an over-long file can't crash the tab before a sidecar exists.

Remaining (non-blocking): the exact cap value (tune to where browser decode stays comfortable on target hardware) and the sidecar's peak resolution (sets the zoom-in cap). Both are tuning numbers, not design questions.
```
