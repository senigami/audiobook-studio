# Implementation Plan: Player-Piano Auto-Scrolling (Studio Mockup)

A smooth, time-aligned auto-scrolling "follow the playback" system for the **Chapter Studio**
pane of the site mockup (`siteMockup`), built to Apple HIG reading-flow principles.

> **Scope:** This is the *demo mockup* under `frontend/src/demo/stages/siteMockup/`, not the
> production Book player. No backend, no real audio — playback is the simulated `activeTrack`
> ticker that already exists in `siteMockupStage.tsx`.

---

## 0. Ground Truth (verified against current code — read this first)

The original draft of this plan was written against assumptions that are **wrong**. The facts below
were confirmed by reading the files. Trust them over intuition.

1. **`StudioPane` is rendered by `BookPane`, and `BookPane` lives in `siteMockupStage.tsx`** (defined
   ~line 865, renders `<StudioPane />` ~line 921). **`book.tsx` does NOT render `StudioPane`** — it
   only exports `ManuscriptPane`, `CastingPane`, `ReviewPane`. → **Do not edit `book.tsx`.**

2. **The audio "track" already exists.** `SiteMockup` (root, `siteMockupStage.tsx` ~line 931) owns:
   ```ts
   type TrackState = {
     trackName: string; subtitle: string; duration: number;
     currentTime: number; isPlaying: boolean;
     scope: 'segment' | 'chapter' | 'preview';
   };
   const [activeTrack, setActiveTrack] = useState<TrackState | null>(null);
   ```
   A `useEffect` (~line 966) ticks `currentTime` upward by 0.1s every 100ms while `isPlaying`, and
   resets to `{currentTime: 0, isPlaying: false}` when it reaches `duration`. **Reuse this ticker —
   do not add a second clock.**

3. **Playback is triggered by an `aria-label` click delegator, not props.** `handleGlobalClick`
   (~line 1014) inspects the clicked element's `aria-label` and calls `setActiveTrack`. The branch
   `"Play chapter …"` (~line 1050) currently sets **`duration: 1690`** (28:10) — far too long to
   demo scrolling at 1×. The Studio button's label is `"Play chapter 4"` ([studio.tsx:658]), so it
   hits this branch today.

4. **The scroll container is local to `StudioPane`**, not the global `.ns-main-scroll`. It is the
   prose `<div>` at **[studio.tsx:746]**:
   `<div onMouseUp={handleMouseUp} style={{ flex:1, overflowY:'auto', padding:… }}>`.
   This is the element we ref, observe for user scroll, and drive `scrollTop` on.

5. **Each rendered segment already carries `data-chunk-id={chunk.id}`** (e.g. `c1`, `c3`, `c5` …),
   emitted in every branch of `renderChunkElement` ([studio.tsx:435]). We locate segments by querying
   `[data-chunk-id="…"]` **inside the container ref** — this works identically in both `book` and
   `script` view modes.

6. **Not every chunk is a real segment.** `initialChunks` ([studio.tsx:151]) contains whitespace
   spacers (`text: ' '`, no speaker) and one "rendering…" placeholder (`c10`, `styleType:'bg-accent'`,
   `isRendering:true`, no click handler). The follow timeline must be built from **content chunks
   only** (chunks whose trimmed text is non-empty).

7. **`FIT_WAVE_MAX_SEC = 30`** ([siteMockupStage.tsx:607]) decides the scrubber rendering: a
   `duration > 30` renders as a **plain progress bar**, `<= 30` as an inline waveform. A chapter
   should read as a bar, so the follow duration must stay **> 30s** (≈45–60s is ideal: long enough to
   stay a bar, short enough to demo in under a minute).

8. **Design tokens for highlighting exist.** `SPEAKER_TOKEN` ([studio.tsx:16]) maps each speaker to
   `{ text, tintBg, tintBorder }` CSS-variable triples. Use these — **never raw hex**.

---

## 1. Design Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| **D1 — Highlight** | Active segment gets a speaker-tinted background applied directly to its words, plus a soft focus ring (`box-shadow`), layered *on top* of the segment's existing `styleType` styling without replacing it. | Marker-on-the-words follow cue; speaker color reinforces casting. |
| **D2 — Viewport position** | Active segment is parked in the **upper third** of the container: `targetScrollTop = segment.offsetTop − container.clientHeight / 3`. | Teleprompter/e-reader reading flow — eyes stay high, upcoming text stays visible. |
| **D3 — Motion model** | Scroll is driven **only on active-segment *change*** (discrete), not every tick. Use a single `container.scrollTo({ top, behavior })`. This avoids fighting the 100ms ticker. | A "player piano" advances segment-by-segment; per-frame lerping is over-engineered for a mockup and stutters against the 10Hz tick. |
| **D4 — Manual override** | A genuine user scroll **pauses following indefinitely** and shows a floating `↓ Resume following` pill. Tapping it (or the Play/Pause transport, or restarting the chapter) re-engages following and scrolls back. | HIG: never yank a reader who deliberately scrolled away. |
| **D5 — Scope gate** | Following engages **only** when `activeTrack.scope === 'chapter'` **and** `activeTrack.trackName === 'Chapter 4'` (the studio chapter). Segment/voice previews never move the transcript. | A 7s segment preview must not hijack the page. |
| **D6 — Reduced motion** | When `matchMedia('(prefers-reduced-motion: reduce)')` matches, all scrolls use `behavior:'auto'` (instant) and the pill's snap-back is instant. | Accessibility / HIG. |
| **D7 — Never click-to-play; hover popup owns actions** | Clicking a line **never** starts playback. Hovering any content line surfaces a floating popup (the existing `HoverSentenceControls`, extended to all lines) holding a voice-assignment dropdown plus action buttons — one of which is **Play from here**. The existing arm-swatch-then-click assignment flow is unchanged. | Earlier builds auto-played on line click, which fought text selection/assignment. HIG: a click is for selection/editing; transport belongs on explicit controls. |

### D7 detail — hover popup behavior
- **Click on a line:** does *nothing* to playback. It continues to drive sub-sentence selection /
  speaker assignment exactly as today ([studio.tsx:342] `handleSentenceClick`, only acts when a cast
  swatch is armed). No regression to that flow.
- **Hover on a line:** reveals the per-line popup. Today `HoverSentenceControls` ([studio.tsx:113])
  renders only for the single chunk flagged `hasHoverControls` (`c6`). Extend it so it appears for
  **every content chunk** on hover (reveal via CSS `:hover` on the wrapping span — keep it cheap;
  do not mount a popup per chunk eagerly).
- **Popup contents:** (1) voice/speaker dropdown (already present — "Maren ▾"); (2) **Play from here**
  action; (3) keep the existing **Rebuild segment** action.
- **"Play from here" semantics (ties into follow mode):** seek the chapter follow-track to this
  segment's start and follow from there —
  ```ts
  const onPlayFromHere = (chunkId: string) => {
    const seg = timeline.find(s => s.id === chunkId);
    if (!seg || !setActiveTrack) return;
    setActiveTrack({
      trackName: 'Chapter 4', subtitle: 'Chapter playback',
      duration: STUDIO_FOLLOW_DURATION_SEC,
      currentTime: seg.start, isPlaying: true, scope: 'chapter',
    });
    setIsFollowing(true);
    lastActiveIdRef.current = null; // force a snap to the new active segment
  };
  ```
  This is distinct from the existing **"Preview segment"** button (a 7s `scope:'segment'` isolated
  preview via the delegator). Recommendation: the popup's primary transport action is **Play from
  here** (chapter + follow); "Preview segment" may stay as a secondary "hear just this line" affordance
  or be dropped — reviewer's call, but do not wire *both* to the same icon.

---

## 2. Data Model — Segment Timeline

Add this near the top of `studio.tsx`, after `initialChunks`. It maps each **content** chunk to a
time window, distributing the demo duration proportionally to text length (longer lines read longer).

```ts
// Follow-mode demo duration. Must stay > FIT_WAVE_MAX_SEC (30) so the chapter
// scrubber still renders as a bar, and short enough to demo in well under a minute.
export const STUDIO_FOLLOW_DURATION_SEC = 48;

// Build [{ id, start, end }] for content chunks only (skip whitespace spacers and
// the non-interactive "rendering…" placeholder). Proportional to text length so the
// playhead dwells longer on longer lines.
export function buildSegmentTimeline(
  chunks: { id: string; text: string }[],
  totalSec: number,
): { id: string; start: number; end: number }[] {
  const content = chunks.filter(c => c.text.trim().length > 0);
  const totalChars = content.reduce((n, c) => n + c.text.trim().length, 0) || 1;
  let acc = 0;
  return content.map(c => {
    const dur = (c.text.trim().length / totalChars) * totalSec;
    const seg = { id: c.id, start: acc, end: acc + dur };
    acc += dur;
    return seg;
  });
}

// Pure lookup: which content chunk id is active at time t (binary/linear scan is fine
// for ~10 segments). Returns null when before the first or after the last segment.
export function activeChunkIdAt(
  timeline: { id: string; start: number; end: number }[],
  t: number,
): string | null {
  for (const s of timeline) if (t >= s.start && t < s.end) return s.id;
  return null;
}
```

> These three are **pure functions** — they are the only part worth a unit test (§6).

---

## 3. Proposed Changes

### [MODIFY] `siteMockupStage.tsx`

1. **Differentiate the Studio chapter from the chapter-list play.** In `handleGlobalClick`, **before**
   the generic `"Play chapter "` branch (~line 1050), add a specific branch for the studio button so
   it gets the short follow-duration instead of 1690s:
   ```ts
   // Studio "Play chapter" — short, follow-along demo track (player-piano).
   if (ariaLabel === 'Play chapter 4 (follow)') {
     setActiveTrack({
       trackName: 'Chapter 4',
       subtitle: 'Chapter playback',
       duration: STUDIO_FOLLOW_DURATION_SEC, // 48s → stays a bar (>30), demos fast
       currentTime: 0, isPlaying: true, scope: 'chapter',
     });
     return;
   }
   ```
   Import `STUDIO_FOLLOW_DURATION_SEC` from `./siteMockup/panes/studio`. (Branch ordering matters:
   exact-match branches must precede the `startsWith('Play chapter ')` branch.)

2. **Thread the track into `BookPane → StudioPane`.** `BookPane` (defined ~line 865) must accept and
   forward the track:
   ```ts
   const BookPane: React.FC<{
     onBack: () => void;
     activeTab: BookTab;
     setActiveTab: (t: BookTab) => void;
     activeTrack: TrackState | null;          // ADD
     setActiveTrack: React.Dispatch<React.SetStateAction<TrackState | null>>; // ADD
   }> = ({ …, activeTrack, setActiveTrack }) => ( …
     {activeTab === 'Studio' && <StudioPane activeTrack={activeTrack} setActiveTrack={setActiveTrack} />}
   ```
   And at the `<BookPane … />` render site (~line 1259) pass `activeTrack={activeTrack}` and
   `setActiveTrack={setActiveTrack}` (both already in scope in `SiteMockup`).

   > `setActiveTrack` is forwarded so the Resume pill / transport can re-engage; following itself is
   > read-only on `activeTrack`. If a reviewer prefers, the pill can re-engage purely via local state
   > and `setActiveTrack` can be omitted — but forwarding it keeps the door open for seek-on-click.

3. **Do NOT touch `book.tsx`.** (It does not render `StudioPane`.)

### [MODIFY] `studio.tsx`

1. **Props.** Change `export const StudioPane: React.FC = () => {` to accept:
   ```ts
   export const StudioPane: React.FC<{
     activeTrack?: TrackState | null;
     setActiveTrack?: React.Dispatch<React.SetStateAction<TrackState | null>>;
   }> = ({ activeTrack = null, setActiveTrack }) => {
   ```
   Import the `TrackState` type from the stage (or lift it to a shared module — see note at end).
   Optional props keep the component renderable in isolation (existing tests/storybook).

2. **Refs & state.**
   ```ts
   const scrollRef = useRef<HTMLDivElement>(null);      // the prose container (line 746)
   const [isFollowing, setIsFollowing] = useState(true); // user can pause via manual scroll
   const lastActiveIdRef = useRef<string | null>(null);  // detect segment *change* (D3)
   const timeline = useMemo(
     () => buildSegmentTimeline(chunks, STUDIO_FOLLOW_DURATION_SEC),
     [chunks],
   );
   const reduceMotion = usePrefersReducedMotion(); // small helper, or inline matchMedia (D6)
   ```

3. **Scope gate + active id (derived, not stored).**
   ```ts
   const followEngaged =
     !!activeTrack && activeTrack.scope === 'chapter' && activeTrack.trackName === 'Chapter 4';
   const activeChunkId = followEngaged
     ? activeChunkIdAt(timeline, activeTrack.currentTime)
     : null;
   ```

4. **Highlight (D1).** In `renderChunkElement`, compute `const isActive = chunk.id === activeChunkId;`
   and **layer** an additive style on top of whatever each branch already returns — do *not* add a 7th
   branch. Simplest: build a shared `activeOverlay` style object and spread it into the `style` of each
   returned `<span>`:
   ```ts
   const activeOverlay = isActive
     ? { background: tok.tintBg, color: tok.text,
         boxShadow: `0 0 0 2px ${tok.tintBorder}`, borderRadius: 4,
         transition: 'background .2s ease, box-shadow .2s ease' }
     : null;
   ```
   Spread `...activeOverlay` **last** in each branch's `style={{ … }}` so it wins over the base
   `styleType` look while keeping layout. (For the `underline`/`hasHoverControls` branches it tints
   the run; for `bg-success`/`bg-accent` it overrides the static tint while active.)

5. **Follow effect (D3 + D6).** Drive scroll only when the active segment *changes*:
   ```ts
   useEffect(() => {
     if (!followEngaged || !isFollowing || !activeChunkId) return;
     if (activeChunkId === lastActiveIdRef.current) return; // only on change
     lastActiveIdRef.current = activeChunkId;
     const container = scrollRef.current;
     const el = container?.querySelector<HTMLElement>(`[data-chunk-id="${activeChunkId}"]`);
     if (!container || !el) return;
     const target = Math.max(0, el.offsetTop - container.clientHeight / 3); // D2 upper-third
     container.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
   }, [activeChunkId, followEngaged, isFollowing, reduceMotion]);
   ```
   > `offsetTop` is relative to the nearest positioned ancestor. Add `position: 'relative'` to the
   > container at [studio.tsx:746] so `offsetTop` is measured against the scroller, not some outer box.

6. **Manual-scroll detection — the critical part (D4).** **Do NOT use the `scroll` event** to detect
   the user — the auto-scroll in step 5 fires `scroll` and would instantly pause itself. Instead
   listen for genuine user-intent gestures on the container and pause following:
   ```ts
   useEffect(() => {
     const c = scrollRef.current;
     if (!c) return;
     const pause = () => setIsFollowing(false);
     c.addEventListener('wheel', pause, { passive: true });
     c.addEventListener('touchmove', pause, { passive: true });
     const onKey = (e: KeyboardEvent) => {
       if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)) pause();
     };
     c.addEventListener('keydown', onKey);
     return () => {
       c.removeEventListener('wheel', pause);
       c.removeEventListener('touchmove', pause);
       c.removeEventListener('keydown', onKey);
     };
   }, []);
   ```

7. **Re-engage triggers (D4).**
   - Resume pill `onClick`: `setIsFollowing(true)` then force a snap by clearing
     `lastActiveIdRef.current = null` so the follow effect re-runs and scrolls to the current segment.
   - When a fresh chapter track starts (`currentTime` resets to ~0 / new `trackName`), reset
     `setIsFollowing(true)` and `lastActiveIdRef.current = null` via an effect keyed on
     `activeTrack?.trackName`.
   - **Teardown:** when `followEngaged` becomes false (Stop → `activeTrack` null, or track ends),
     clear `lastActiveIdRef.current = null`. `activeChunkId` already becomes null, so the highlight
     clears automatically.

8. **Resume pill (D4 + HIG a11y).** Wrap the prose container’s parent ([studio.tsx:744]) so it is
   `position: relative` and render an absolutely-positioned `<button>` **only when**
   `followEngaged && !isFollowing`:
   ```tsx
   {followEngaged && !isFollowing && (
     <button
       type="button"
       aria-label="Resume following playback"
       onClick={() => { setIsFollowing(true); lastActiveIdRef.current = null; }}
       style={{
         position: 'absolute', left: '50%', bottom: 'var(--space-3)',
         transform: 'translateX(-50%)', zIndex: 20,
         display: 'inline-flex', alignItems: 'center', gap: 6,
         minHeight: 44, padding: '0 var(--space-3)',          // ≥44pt tap target (HIG)
         borderRadius: 'var(--radius-round)',
         background: 'var(--surface)', color: 'var(--accent)',
         border: '1px solid var(--accent-tint-border)',
         boxShadow: 'var(--shadow-md)', cursor: 'pointer',
         fontSize: 'var(--type-caption)', fontWeight: 600,
       }}
     >
       <ArrowDown size={14} aria-hidden="true" /> Resume following
     </button>
   )}
   ```
   Place it inside the relative wrapper, above the prose but clear of the bottom `PlayerBar`
   (the bar lives at the mock root, outside this pane, so `bottom: var(--space-3)` is safe).

9. **Update the Play-chapter button label** so it routes to the new short-track branch (step §3.1 of
   the stage): change `aria-label="Play chapter 4"` ([studio.tsx:658]) to
   `aria-label="Play chapter 4 (follow)"`. Keep the visible text "Play chapter".

10. **Per-line hover popup (D7).** Make `HoverSentenceControls` render for every content chunk on
    hover, not just `c6`. Pass it the chunk id and an `onPlayFromHere(chunkId)` callback (defined per
    §1 D7 detail). Reveal-on-hover (CSS `:hover` on the wrapping `<span>`, `opacity`/`visibility`
    transition) keeps it from cluttering the prose. Add **Play from here** to the popup; keep the
    speaker dropdown and **Rebuild segment**. Give the Play control an `aria-label="Play from here"`
    and a ≥24px hit area (inline control; the 44pt rule applies to primary touch targets like the
    Resume pill, but keep inline controls comfortably clickable). **Confirm clicking the line text
    itself still only assigns/selects — never plays.**

11. **Toolbar tidy (optional, HIG deference — do last, keep diff small).** The toolbar
    ([studio.tsx:620-692]) packs `Book/Script`, `Play chapter`, `Safe text`, `#`. If grouping
    `Safe text` + `#` behind a single "View options" affordance, do it as a *separate* commit so the
    follow feature can be reviewed in isolation. **Not required for this feature.**

---

## 4. Apple HIG Notes (applied above)

- **Reading flow (D2):** upper-third parking, not centering — matches teleprompter/e-reader norms.
- **Deference / no yanking (D4):** manual scroll wins indefinitely; re-engagement is user-initiated.
- **Fluidity (D3):** native smooth scroll, segment-granular, no per-frame jitter.
- **Accessibility:** `prefers-reduced-motion` honored (D6); pill is a real `<button>` with an
  `aria-label` and a ≥44pt target; highlight relies on tinted background **plus** a focus ring (not
  color alone) so it survives low-contrast/colorblind viewing.

---

## 5. Risks & Gotchas (read before coding)

1. **Self-pause loop** — using `scroll` instead of `wheel`/`touchmove`/`keydown` will make auto-scroll
   pause itself on its first move. (§3.6 avoids this.)
2. **Smooth-scroll thrash** — calling `scrollTo` every tick instead of per segment-change restarts the
   animation 10×/sec. (§3.5 gates on `activeChunkId` change.)
3. **`offsetTop` reference frame** — container must be `position: relative` or offsets come from the
   wrong ancestor and scrolling lands off-target. (§3.5 note.)
4. **Scope bleed** — without the §3.3 gate, a 7s segment preview or voice preview scrolls the
   transcript. The gate also checks `trackName === 'Chapter 4'`.
5. **Duration vs scrubber rendering** — keep `STUDIO_FOLLOW_DURATION_SEC > 30` or the chapter scrubber
   silently flips to a waveform (`FIT_WAVE_MAX_SEC`).
6. **Whitespace/placeholder chunks** — must be excluded from the timeline (§2 filter), else the
   highlight lands on an empty spacer and "nothing" appears active.
7. **Stop teardown** — when `activeTrack` goes null mid-follow, reset `lastActiveIdRef` so a later
   replay snaps correctly (§3.7).

---

## 6. Verification Plan

### Automated
- **Typecheck + build:** `npm -C frontend run build` (must pass — this is a `tsc -b` gate).
- **Lint:** `npm -C frontend run lint`.
- **Unit test (the pure logic only):** add `frontend/tests/unit/demo/studioTimeline.test.ts`
  covering `buildSegmentTimeline` and `activeChunkIdAt`:
  - windows are contiguous, ascending, and sum to `STUDIO_FOLLOW_DURATION_SEC`;
  - whitespace/empty chunks are excluded;
  - `activeChunkIdAt` returns the right id at boundaries (`start` inclusive, `end` exclusive) and
    `null` before the first / after the last segment.
  Run: `npm -C frontend run test -- --run studioTimeline` *(single-file, per repo test-memory rule —
  do not run the whole vitest suite).*

### Manual (in the running demo / preview)
1. Open Studio (Library → book → **Studio** tab). Click **Play chapter**.
   - ✅ Segment highlight advances line-by-line; the active line parks in the **upper third**.
   - ✅ Highlight uses the speaker's color (Narrator/Maren/Dov) + focus ring.
2. **Scroll away with the wheel/trackpad** mid-playback.
   - ✅ Following stops; **`↓ Resume following`** pill appears; playback keeps advancing without
     yanking the viewport.
   - ✅ Auto-scroll does **not** pause itself spontaneously (the self-pause bug).
3. Click the pill.
   - ✅ Viewport smoothly snaps back to the active line and resumes following.
   - ✅ Pill is keyboard-focusable and activates on Enter/Space.
4. **Scope isolation:** with the chapter playing, trigger a segment preview / voice preview elsewhere
   — ✅ the transcript does **not** scroll for those tracks.
5. **Stop** (player-bar stop) — ✅ highlight clears, pill gone; replaying snaps correctly.
6. **Reduced motion:** enable OS "Reduce Motion" — ✅ scrolls jump instantly, no animation.
7. **Dark mode** — ✅ highlight + pill legible against dark surfaces (tokens already theme-aware).
8. **Hover popup (D7):** hover any line — ✅ popup appears with voice dropdown + **Play from here** +
   Rebuild. Click **Play from here** on a mid-chapter line — ✅ playback seeks to that line, highlight
   + follow start from there. Click the line *text* — ✅ it selects/assigns (with a swatch armed) and
   **never** starts playback.
9. **Regression:** text selection → speaker-assign context menu, arm-swatch-then-click assignment,
   Commit, Export, Safe-text/# toggles, and Book↔Script view switch all still work.

---

## 7. File-Touch Summary

| File | Change |
|------|--------|
| `frontend/src/demo/stages/siteMockupStage.tsx` | New `"Play chapter 4 (follow)"` delegator branch; thread `activeTrack`/`setActiveTrack` through `BookPane` into `StudioPane`. |
| `frontend/src/demo/stages/siteMockup/panes/studio.tsx` | Timeline helpers (§2); props; refs/state; scope gate; active highlight overlay; follow effect; user-scroll detection; re-engage/teardown; Resume pill; play-button label; per-line hover popup with **Play from here** (D7). |
| `frontend/tests/unit/demo/studioTimeline.test.ts` | New unit test for the pure timeline functions. |
| ~~`book.tsx`~~ | **No change** (does not render `StudioPane`). |

> **Shared-type note:** `TrackState` currently lives in `siteMockupStage.tsx`. Importing it into
> `studio.tsx` from the stage is fine, but a cleaner option is to lift `TrackState` (and
> `STUDIO_FOLLOW_DURATION_SEC`) into `siteMockup/shared.tsx` and import from there in both files,
> avoiding a child→parent import. Pick one and be consistent.

> **Synced copy:** `design-docs/plans/player_piano_scrolling_plan.md` in the repo holds the **identical** content
> to this file (kept in sync deliberately). If you edit one, edit the other — or collapse to a single
> source of truth.
