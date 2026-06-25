# 004 — Rewrite audio-player.md §5: fit-based, duration-driven, scope-blind rule

status: done
workload: W1 — Spec rewrite + fit-based inline rule
blocked-by: 003 (owner sign-off on W0 mock)
blocks: 005

## Goal

Rewrite `design-docs/specs/audio-player.md` §5 so the binding spec matches the approved design: the scrub representation is governed by a **fit-based, duration-driven, scope-blind** rule rather than the current "representation follows scope" rule. The rewrite also documents the expanded tape, zoom presets, minimap, duration cap, and browser-first/peaks-later strategy. A clean version bump and a single changelog row complete the change.

## Why it matters

005 (the code change) must target a spec that already describes the new contract. Until §5 is rewritten, the live implementation will be in perpetual drift with the spec — which the codebase rules treat as a defect requiring explicit resolution. Specs-first keeps the code review honest: reviewers can verify 005 against this spec rather than against a proposal document.

The rewrite also moves the spec from an ad-hoc per-scope branch ("segment → waveform, chapter → bar") to a single computed predicate that scales with container width, aligns with `modular_architecture.md`'s no-scope-branching rule, and matches the owner's stated mental model.

## Files

- `design-docs/specs/audio-player.md` — **primary target** (§5 full rewrite, TL;DR blurb update, version bump, changelog row)
- `design-docs/specs/design-system.md` — **one-line cross-ref note** at the `AudioLines` row in §9.2 (behavior extends to "open tape when inline track is a bar"; the icon itself is unchanged)

No source code, no test files, no other specs.

## Target shape / contract

### §5 must describe (after rewrite)

**Representation rule — fit-based, duration-driven, scope-blind:**

```
inlineTrack =
  forceWave === true                       → waveform  (user override on)
  forceWave === false                      → bar        (user override off)
  forceWave == null && fitsLegibly(d, w)  → waveform  (auto: short / wide clip)
  forceWave == null && !fitsLegibly(d, w) → bar        (auto: long / narrow clip)

fitsLegibly(durationSec, barWidthPx):
  returns (barWidthPx / durationSec) >= PX_PER_SEC_FLOOR  // ~3 px/sec
  bootstrap (before measured width is known): durationSec <= DURATION_BOOTSTRAP (~120 s)
```

The predicate keys on **audio duration and measured bar width alone** — never on `scope` (`segment` / `chapter` / `preview`). A 90-second chapter clip and a 90-second segment clip produce the same inline track choice.

**AudioLines toggle behavior (two modes, one button):**

- `inlineTrack === waveform` → toggle flips the inline representation to bar (and back). Behavior identical to 1.4.0.
- `inlineTrack === bar` → toggle **opens / closes the expanded tape** (NEW, W2). The tape does not exist in W1 code; §5 must describe the intent so the button already carries the right `aria-label` contract.

**Expanded tape (described in §5, implemented in W2 — tasks 006–009):**

- Opens as a taller region **above the control row, inside the PlayerBar's own footprint** (bar grows upward; not a floating window or sheet). Closing returns the bar to one row.
- Suggested tape height ~96–120 px (vs. the 32 px inline track and 24 px narrow-width strip).
- Paged window with a moving playhead; page-advance at the window edge. No continuous-scroll mode — paged is the default and the only mode in V2. `prefers-reduced-motion` makes page-advance an instant cut (paged is already motion-minimal; there is no continuous scroll to suppress).
- Click to jump (`bus.seek()`); drag to scrub (relative/fine navigation).
- Minimap: a thin full-clip strip with a translucent window rectangle (width = current zoom span); dragging it is coarse navigation across the entire clip.
- Bounded discrete zoom presets (cover-slider style, snap dots): `8 / 15 / 30 / 60 / 120 s` across the viewport. In-cap = native peak resolution; out-cap = legible speech/pause structure (never a single-bar blob, never the whole clip). Pinch/wheel snaps through presets; ±/slider secondary. Zoom level resets to the default preset on new source (`requestId`).
- Single-owner invariant: the tape re-renders the same wavesurfer instance at larger size — no second `<audio>` or second wavesurfer created.

**Duration cap (browser-first phase, W2 — §5 must document):**

- Starting value ~10–15 min, tunable. Above the cap: the tape is not offered, the `AudioLines` toggle does not appear in tape-open mode, behavior is identical to today's plain bar.
- Cap is keyed on **duration alone**, never scope. A short chapter is fully supported; a long segment (from a large-`text_chunk_limit` engine) respects the cap.

**Browser-first / peaks-later strategy (§5 must document):**

- W1–W2 (this work): wavesurfer decodes peaks client-side via Web Audio. No backend change.
- W3 (later): a downsampled peaks sidecar may be emitted at production time for clips over the duration threshold. When a sidecar exists the player renders from it (bypassing browser decode), lifting the cap. The tape/zoom/minimap UI is identical either way — this is a source-swap behind one seam, not a rebuild. The peaks sidecar field in `ArtifactOutputModel` and the `data-model.md` update belong to W3 task 011 and are **not** changed in this task.

**Responsive exception (§5.1) — narrow-width above-reflow:**

The CSS container-query reflow (`@container (max-width: 720px)` → `.player-scrub--wave { order:-1; flex-basis:100% }`) survives unchanged. It applies only when the inline track is a waveform (bar mode has no waveform to reflow). This remains the **only** above-controls layout — the tape (when W2 ships) grows the bar upward via a separate mechanism.

**Peaks strategy (§5.2, renamed from "Wavesurfer wiring"):**

Describe both the browser-decode path (current) and the sidecar source-swap seam (W3). The wiring contract (seek-on-click, position reflection) is unchanged from 1.5.0.

### TL;DR blurb (first paragraph)

Replace the current waveform sentence ("Waveform representation follows scope…") with the fit-based rule summary: the inline scrub track is a waveform whenever the whole loaded clip renders legibly at the current bar width (fit predicate, ~3 px/sec floor, ~120 s bootstrap); otherwise a plain seek bar. The `AudioLines` toggle opens an expanded detail tape when the track is a bar.

### Spec version bump

- `spec_version: 1.5.0` → `1.6.0`
- `updated: 2026-06-16` (unchanged date is fine if still today; match actual authoring date)

### Changelog row (one, clean)

```
| 1.6.0 | 2026-06-16 | §5 rewritten: representation rule changed from scope-driven to fit-based, duration-driven, scope-blind (fitsLegibly predicate, ~3 px/sec floor, ~120 s bootstrap). AudioLines toggle gains tape-open behavior when inline track is a bar. Expanded tape, zoom presets, minimap, duration cap (~10–15 min), and browser-first/peaks-later strategy documented. data-model.md peaks sidecar field deferred to W3 (task 011). |
```

No prior-experimentation history, no "removed / re-added" language. Per owner (proposal §9, decision 6): the spec describes how the code works *now*, not the path taken.

### design-system.md §9.2 cross-ref note

At the `AudioLines` row in the canonical control→icon table, append a parenthetical clarifying the extended behavior:

```
| Waveform ↔ bar toggle | `AudioLines` | (behavior: flip inline representation when track is a waveform; open/close expanded tape when track is a bar — see audio-player.md §5) |
```

The icon itself (`AudioLines`) does not change. This is a note, not a new table column — a trailing parenthetical on the existing row, or a footnote immediately below the table, is acceptable. Match whichever style fits the existing table formatting.

## Steps

1. Read `design-docs/specs/audio-player.md` in full (already read; verify line numbers before editing).
2. Rewrite §5 (`## 5. Waveform — representation follows scope`) per the target shape above. Rename the heading to `## 5. Waveform — fit-based, duration-driven, scope-blind rule`. Keep §5.1 (responsive exception, updated as above), rename and update §5.2 (peaks / wavesurfer wiring). Remove §5.3 (`Implementation status`) — it was a temporary "SHIPPED" notice no longer needed once the spec is current. The pending implementation status of W2 (tape) belongs in a `## 5.3 Implementation status` note that lists: §5 predicate — W1 (task 005, live); tape / zoom / minimap / duration cap — W2 (tasks 006–009, pending); peaks sidecar source-swap — W3 (task 011, later).
3. Update the TL;DR blurb (the block-quoted first paragraph).
4. Bump `spec_version` to `1.6.0` and add the single changelog row.
5. Update `design-docs/specs/design-system.md` §9.2: add the parenthetical note to the `AudioLines` row.
6. Read both files back, confirm: no scope-based wording remains in §5, version is bumped, changelog has exactly one new row, the design-system note is present, no experimentation history recorded.

## Acceptance criteria

- `design-docs/specs/audio-player.md` `spec_version` is `1.6.0`.
- Changelog has exactly **one** new row (1.6.0); no "removed," "re-added," or experimentation history is present.
- §5 heading reads `## 5. Waveform — fit-based, duration-driven, scope-blind rule` (or equivalent that omits "representation follows scope").
- §5 body describes: the `fitsLegibly` predicate (~3 px/sec floor, ~120 s bootstrap), the two toggle behaviors (flip inline / open tape), the expanded tape (paged, click+drag, minimap, zoom presets), the duration cap (~10–15 min, tunable), and the browser-first/peaks-later strategy.
- §5 does **not** contain "scope === 'segment'" or "representation follows scope" as normative text.
- `data-model.md` / peaks sidecar fields are **not** mentioned as changes in this task — they are deferred to W3.
- `design-docs/specs/design-system.md` §9.2 `AudioLines` row carries a note about the extended tape-open behavior with a cross-ref to `audio-player.md §5`.
- `npm -C frontend run build` passes (no source was touched — this is a fast check to confirm no import drift).

## Out of scope

- Any change to `PlayerBar.tsx`, `WaveformStrip.tsx`, `playerBus.ts`, or any other source file — that is task 005.
- Any change to `data-model.md` or `ArtifactOutputModel` — that is W3 task 011.
- The tape component, zoom control, minimap — those are W2 tasks 006–009.
- Mock / styleguide changes — those are W0 tasks 001–003.
- Documenting the prior "representation follows scope" history in the changelog beyond the single clean row.

## References

- `design-docs/plans/audio_player_scrubbing_waveform_proposal.md` §§2, 3, 5–9 (design source of truth)
- `design-docs/plans/audio_player_waveform_scrubber/00-audit-report.md` §D (reconciliation) and §F (locked decisions)
- `design-docs/plans/audio_player_waveform_scrubber/01-roadmap.md` — task 004 description
- `design-docs/specs/audio-player.md` 1.5.0 (the file being rewritten)
- `design-docs/specs/design-system.md` §9 (the cross-ref target)
- `frontend/src/app/layout/PlayerBar.tsx:46–47, 121` (current predicate, for spec accuracy)
- `frontend/src/store/playerBus.ts:26` (`duration` field confirmed present on the bus)
