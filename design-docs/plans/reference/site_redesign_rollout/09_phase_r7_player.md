# Phase R7 — Unified Player Surface (complete the U16 mock)

*Owner-requested 2026-06-14: the shipped player bar lacks VCR skim controls, a real scope
toggle, and the waveform; build the full U16 mock surface. Reference mock: the U16 card in the
styleguide + `frontend/src/demo/stages/siteMockup` PlayerBar. Spec: design-docs/specs/audio-player.md
(this phase moves §5 waveform from "future" to "shipped" — bump the spec when done).
Same contract as the rollout (00_execution_contract.md): one commit per task, tokens only,
single-owner (ADR-0010) preserved, memory-safe tests (targeted + --maxWorkers=1, never full suite).*

## Current gap (verified 2026-06-14)
- PlayerBar transport = prev / play-pause / next / stop + seek slider + time. MISSING: skim
  back/forward (⏪/⏩), the mock's 5-button VCR layout.
- Scope is a passive `player-scope-badge`, NOT a Segment↔Chapter toggle control.
- No waveform; wavesurfer.js not installed; the `player-bar-expansion` slot is reserved/empty.
- playerBus exposes load/play/pause/stop/seek/reportTime/notifyEnded|Error|Prev|Next — NO skim
  or scope-switch helpers.

## Tasks

### R7-T1 — Complete the VCR transport (no dependency, do first)
- Add bus helpers `skip(deltaSeconds)` (seek(clamp(position+delta)), reuses the seekRequestId
  path so the element moves) — used for skim. Keep prev/next (notifyPrev/Next) and stop.
- PlayerBar transport reordered to the mock: ⏮ prev · ⏪ skim-back(−10s) · ▶/⏸ · ⏩ skim-fwd(+10s)
  · ⏭ next. Keep Stop reachable (e.g. small secondary). All buttons aria-labeled; disabled states
  for prev/next from queue.hasPrev/hasNext.
- Tests: bus skip() clamps + moves element (PlayerBar seek effect); transport renders 5 controls.

### R7-T2 — Scope toggle (Segment ↔ Chapter)
- Bus: add `availableScopes`/scope-switch support so a consumer can register BOTH a segment source
  and a chapter source for the current context; `switchScope('segment'|'chapter')` swaps the loaded
  audioUrl + reloads. If only one scope is available, render the badge (current behavior), not a toggle.
- Studio/Review register both when a chapter is rendered (chapter full render + the active segment).
- Bar: render the Segment/Chapter pill toggle (mock treatment) when >1 scope available.
- Tests: switchScope swaps audioUrl + bumps requestId; toggle only shows with 2 scopes.

### R7-T3 — Waveform (wavesurfer.js) in the expansion slot
- Add `wavesurfer.js` dependency (the decided library, audio-player.md §5). Lazy-import it so it
  doesn't bloat the entry chunk (dynamic import in a WaveformStrip component).
- WaveformStrip renders peaks for the current audioUrl into the `player-bar-expansion` slot; sets
  `--player-waveform-height` when shown; seek-on-click maps to bus seek(); reflects position.
- "Wave" toggle button on the bar; persisted preference (utils/playerPrefs.ts mirroring theme.ts);
  default off. Decode client-side (Web Audio) with peak downsampling for long files.
- Tests: toggle persists; WaveformStrip mounts only when on; click computes a seek (mock wavesurfer).

### R7-T4 — Unified-surface polish + Review integration + verify
- Restyle the bar to match the mock (controls row, scope toggle, wave toggle, expansion). Tokens only,
  light+dark. The Review follow-along panel keeps text-tracking but its transport delegates to the bar
  (no duplicate competing transport — single owner).
- Ensure the bar is reliably present once audio loads from any surface (Studio segment, chapter render,
  Voices preview, Review chapter). Verify the Review "Load & Play" path surfaces the bar.
- Spec: bump design-docs/specs/audio-player.md (§5 waveform → shipped; transport/scope sections updated) +
  changelog row; note in ADR-0010 if the scope model changed.
- Full memory-safe verification at the end.

## Acceptance
- Bar shows full VCR transport (prev/skim-back/play/skim-fwd/next + stop + seek + time).
- Scope toggle swaps segment↔chapter audio when both exist; badge when one.
- Waveform toggles on/off (persisted), renders peaks, seek-on-click works; bar geometry stable.
- Single-owner audit still clean (one <audio>, in PlayerBar). Build+lint+targeted tests green; one
  careful full-suite run at the end.
