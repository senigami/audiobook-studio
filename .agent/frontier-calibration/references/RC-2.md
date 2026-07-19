# RC-2 — Reference analysis: predictive progress bar velocity jitter (pre-fix)

status: gold-standard reference, authored 2026-07-19 from the pre-fix code itself
pre-fix snapshot: commit `c1ead9e917e0b319e5663df498870fca9300e046` (parent of `c27ad636` "1c ETA confidence model (doc 15)", which shipped the fix)

## Question restated

During a live render the progress bar visibly lurches — accelerating and decelerating — as
the backend ETA fluctuates. Given the pre-fix `PredictiveProgressBar` component, explain the
root cause(s) of the visible velocity jitter and why the intended low-confidence smoothing
(the `evidenceWeightFraction` mechanism) never engages.

## What I examined

All line numbers are in the pre-fix snapshot (`git show c1ead9e9:<path>`).

- `frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx`
  - `resolveEndAtMs` (113–146): converts each incoming `etaSeconds`/`estimatedEndAt` prop
    update into a lane end-time, with **no smoothing of any kind**.
  - `getLaneProgress` (148–154): displayed position is a pure linear interpolation from
    `startProgress` toward 0.995 between `startAtMs` and `endAtMs` — so the bar's visible
    velocity is `(0.995 − startProgress) / (endAtMs − startAtMs)`. Any change to the lane
    anchors changes velocity directly.
  - `updateLaneToTarget` (257–401): the per-update lane construction —
    `shouldCorrectStart` re-anchor logic (284–306), re-anchored lane target (308–322),
    confidence default `clamp01(evidenceWeightFraction ?? 1)` (346), and the three-way
    anchor lerp `migratedStartAtMs` / `migratedStartProgress` / `migratedEndAtMs` (348–353).
  - Prop-sync effect (467–485): calls `updateLaneToTarget('prop-sync', …)` on **every**
    change of `progress` / `etaSeconds` / `updatedAt` — i.e., every backend broadcast.
- `frontend/src/components/progress/progressBarContracts.ts` (pre-fix): `SegmentProgressBarInput`
  *accepts* `evidenceWeightFraction` (line 15), but `buildSegmentProgressBarProps` omits it
  from its destructuring and **hardcodes `evidenceWeightFraction: 1`** in the returned props
  (line 61).
- Callers at the same commit: `frontend/src/pages/ChapterEditor/components/ChapterHeader.tsx`
  215–217 (derives a confidence from `liveSegmentProgressJob.confidence` / coverage ratio)
  and 515 (passes it into `buildSegmentProgressBarProps` — where it is dropped);
  `frontend/src/components/queue/QueueItem.tsx` 332–334, 470;
  `frontend/src/pages/ProjectDetail/components/ChapterList.tsx` 125, 254.
- Backend confidence source: `app/api/contracts/events.py::compute_progress_confidence`
  (169–190) — returns 1.0 at progress 0 and for terminal states, otherwise
  `coverage_ratio * progress`.
- The fix commit `c27ad636` and current `PredictiveProgressBar.tsx` (post-fix,
  velocity-continuous lane + `useEtaConfidence`) — used only to confirm which version is
  pre-fix, not as evidence.

## Analysis

The bar renders position by linear interpolation along a "lane" (`startAtMs`,
`startProgress`, `endAtMs`); its **visible velocity is entirely a function of the lane
anchors**. Every backend broadcast rebuilds the lane via `updateLaneToTarget`. Three
interacting defects make each rebuild a velocity discontinuity, and defeat the smoothing
that was supposed to damp it.

### Cause 1 — the confidence weight is effectively always 1

`PredictiveProgressBar.tsx:346`:

```ts
const confidence = clamp01(evidenceWeightFraction ?? 1);
```

The default is **full trust**. And on the surface that matters during a live render — the
segment bar — the prop never arrives with anything else: `buildSegmentProgressBarProps`
(`progressBarContracts.ts:61`) hardcodes `evidenceWeightFraction: 1` and silently ignores
the `evidenceWeightFraction` field its own input type declares, so the confidence value
ChapterHeader carefully derives at lines 215–217 is dropped on the floor before it reaches
the bar. (QueueItem does thread `job.confidence` through, but
`compute_progress_confidence` returns 1.0 at progress 0 and for terminal/finalizing states,
and the queue bar wasn't the reported surface.) With `confidence = 1`, the lerp at 348–353
degenerates to "adopt the new target lane outright" — the entire smoothing mechanism is a
no-op in production.

### Cause 2 — confidence lerps the *position anchors*, not the trust/velocity

Even where a `< 1` weight did arrive, the mechanism is conceptually wrong. Lines 348–353
lerp **all three** lane parameters:

```ts
const migratedStartAtMs = currentStartAtMs + (targetStartAtMs - currentStartAtMs) * confidence;
const migratedStartProgress = currentStartProgress + (targetStartProgress - currentStartProgress) * confidence;
let migratedEndAtMs = ... currentEndAtMs + (nextEndAtMs - currentEndAtMs) * confidence;
```

Lerping `startAtMs`/`startProgress` blends *where the bar thinks it started*, i.e. its
position math — it does not blend *how much to trust the new estimate's speed*. Worse, the
`shouldCorrectStart` block above it (284–306) re-anchors unconditionally whenever the
incoming percentage is ahead of the current visual (or on backward migration): it computes a
fictitious start time `targetStartAtMs = (nowMs − targetT·nextEndAtMs)/(1 − targetT)` (317)
so that the lane passes through the incoming progress *now*. So on essentially every
advancing update the target lane is a freshly re-anchored line through (now, incomingProgress)
→ (rawEta, 0.995), and with confidence = 1 (Cause 1) the bar adopts it wholesale. The key
separating insight: **position and velocity are distinct concerns**. Position already has a
correct contract (the authoritative floor, 272–279: never move backward unless allowed).
Only the *velocity* — the slope implied by the end time — should be confidence-modulated. The
pre-fix code modulates position anchors and leaves velocity to whatever the raw numbers say.

### Cause 3 — raw, unsmoothed ETA samples drive the lane end time

`resolveEndAtMs` (113–146) maps each incoming `etaSeconds` sample directly to `endAtMs` with
no EMA, no outlier rejection, and no slope rate-limit; the prop-sync effect (467–485) feeds
every backend broadcast straight into it. Backend ETAs naturally jitter (per-segment timing
variance, remaining-work re-estimates), so `endAtMs` jumps on every update. Because velocity
= (0.995 − startProgress)/(endAtMs − startAtMs), each jitter in the end time is a jump in
the bar's visible slope. The 2-second lane migration (`transitionTickCount:8 × tickMs:250`,
or only 3×250ms = 750ms on the segment bar per `progressBarContracts.ts`) eases the
*position* between old and new lanes but does nothing to converge the *velocities* — after
each short migration the bar runs at the new raw slope until the next update yanks it again.
That alternating adopt-jitter-adopt-jitter is exactly the perceived "speeds up and slows
down."

### Why the three interact

Cause 3 supplies the noisy signal; Cause 2 guarantees each noisy sample re-anchors the whole
line the bar travels along rather than merely bending its future slope; Cause 1 removes the
one damping knob that existed. Fixing any single one is insufficient: smoothing the ETA
alone (the tempting "just smooth it" answer) still leaves position re-anchoring teleporting
the lane on every advancing update, and wiring a real confidence value into the pre-fix lerp
would still modulate the wrong quantity. The shipped fix (commit `c27ad636`, doc 15)
accordingly did all three: removed `evidenceWeightFraction` and derived trust `w` inside the
bar, made lane construction velocity-continuous (position always continues from the current
visual; only the blended end time changes), and EMA-smoothed + slope-rate-limited the ETA
end-time signal.

## Confidence + what would change it

**High (≈0.95)** on the three causes and the position/velocity framing: each is directly
readable in the pre-fix source at the cited lines, the fix commit changes exactly those
mechanisms, and the ground-truth writeup (doc 15 "Current defect") lists the same three.

One deliberate refinement over the ground-truth doc: doc 15 says "no caller passes it
[evidenceWeightFraction]." Strictly, three call sites *do* compute and pass values at the
pre-fix commit (ChapterHeader, QueueItem, ChapterList) — but the segment-bar path drops the
value in `buildSegmentProgressBarProps` (hardcoded `1`), so the doc's claim is true in
effect for the reported surface while false as a literal statement about call sites. A
grader should accept either phrasing but give extra credit for spotting the hardcoded-1 drop.

What would lower confidence: evidence that the owner-reported lurch was on the *queue* bar
specifically (where `job.confidence` could genuinely be < 1), which would shift Cause 1's
weight from "default never overridden" toward "confidence present but misapplied per Cause 2."
The symptom analysis (Causes 2–3) is unaffected either way.

## What I couldn't determine

- Which exact surface the owner was watching when reporting the defect (segment bar in
  ChapterHeader vs. queue-row bar); the code supports the same failure on both, with Cause 1
  strongest on the segment bar.
- The real-world magnitude/frequency of backend ETA jitter at the time (no captured traces
  in-repo from the defect period); Cause 3 rests on the code structurally passing raw
  samples through, plus doc 15's contemporaneous statement that backend ETA "naturally
  jitters," not on a measured trace.
- Whether the line numbers cited in the scenario menu (~327, ~329–334, ~265–303) refer to
  an intermediate revision — in the `c1ead9e9` snapshot the same constructs sit at 346,
  348–353, and 284–306. Same code, slightly shifted lines.
