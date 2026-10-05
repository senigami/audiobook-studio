/**
 * SegmentRenderStrip — "BitTorrent-style" segment block-fill for the Activity
 * queue screen.
 *
 * Sits BENEATH the chapter's aggregate progress bar (additive, not a
 * replacement). A chapter is shown as a row of variable-width blocks — each
 * block sized proportionally to its segment's character count — that fill in as
 * audio data arrives. Several segments render at once (per-engine concurrency
 * cap), spread across render-group "sections", so the strip reads as parallel
 * mini-queues filling rather than a single left-to-right wipe.
 *
 * The component plays the role of the backend: it owns the simulated segment
 * state machine (queued → preparing(model load) → rendering → done, plus a
 * fail→retry) and derives the aggregate bar from the same char-weighted sum the
 * real app uses, so the two layers can never drift.
 *
 * Honest preview, not production: a real chapter can have hundreds of segments;
 * the production component will need a binning strategy above ~40 segments. The
 * mock uses legible counts.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ProgressBar } from './shared';

export interface SegmentPlan {
  /** per-segment character counts; drives block width (flex-grow) */
  chars: number[];
  /** number of per-engine render groups the segments are split across */
  groups: number;
  /** max segments rendering at once (per-engine concurrency cap); default 3 */
  cap?: number;
  /** fill-rate multiplier; < 1 renders slower (a longer job), default 1 */
  speed?: number;
  /** index of a segment that fails once mid-render then retries, or null */
  doomed?: number | null;
}

type SegState = 'queued' | 'preparing' | 'rendering' | 'done' | 'failed';

interface SegRT {
  id: number;
  chars: number;
  group: number;
  state: SegState;
  fill: number;      // 0..1, meaningful while rendering/done
  rate: number;      // per-tick fill increment, rolled on slot entry
  prep: number;      // preparing-window ticks left
  failedOnce: boolean;
  failWait: number;  // ticks held in failed before retry
}

const DEFAULT_CAP = 3;  // max segments active at once (per-engine cap)
const TICK_MS = 120;    // sim cadence
const HOLD_TICKS = Math.ceil(800 / TICK_MS); // pause at 100% before looping

const groupOf = (i: number, total: number, groups: number) =>
  Math.min(groups - 1, Math.floor(i / Math.ceil(total / groups)));

// Longer segments fill a touch slower (variable size → variable time); `speed`
// scales the whole job (< 1 = slower render).
const rollRate = (chars: number, speed = 1) =>
  ((0.085 - (chars / 500) * 0.04) + Math.random() * 0.02) * speed;

const makeSegs = (plan: SegmentPlan): SegRT[] =>
  plan.chars.map((chars, id) => ({
    id, chars, group: groupOf(id, plan.chars.length, plan.groups),
    state: 'queued', fill: 0, rate: 0, prep: 0, failedOnce: false, failWait: 0,
  }));

// Frozen representative frame for prefers-reduced-motion (no timer runs).
const staticSegs = (plan: SegmentPlan): SegRT[] => {
  const cap = plan.cap ?? DEFAULT_CAP;
  const segs = makeSegs(plan);
  const doneCount = Math.round(segs.length * 0.4);
  const activeFills = [0.3, 0.5, 0.7, 0.85];
  segs.forEach((s, i) => {
    if (i < doneCount) { s.state = 'done'; s.fill = 1; }
    else if (i < doneCount + cap) { s.state = 'rendering'; s.fill = activeFills[i - doneCount] ?? 0.5; }
  });
  if (plan.doomed != null) {
    const d = segs[plan.doomed];
    if (d && d.state !== 'done') { d.state = 'failed'; d.fill = 0.5; }
  }
  return segs;
};

const charWeightedProgress = (segs: SegRT[]): number => {
  const total = segs.reduce((a, s) => a + s.chars, 0);
  if (!total) return 0;
  const filled = segs.reduce((a, s) =>
    a + (s.state === 'done' ? s.chars : s.state === 'rendering' ? s.chars * s.fill : 0), 0);
  return filled / total;
};

// One simulation tick: advance active segments, retry failures, then backfill
// open slots from the queue up to CAP — a queued segment whose group hasn't
// loaded its model yet pays a brief "preparing" window first.
const step = (prev: SegRT[], plan: SegmentPlan): SegRT[] => {
  const cap = plan.cap ?? DEFAULT_CAP;
  const segs = prev.map(s => ({ ...s }));
  const loadedGroups = new Set<number>();
  segs.forEach(s => { if (s.state === 'rendering' || s.state === 'done') loadedGroups.add(s.group); });

  for (const s of segs) {
    if (s.state === 'preparing') {
      s.prep -= 1;
      if (s.prep <= 0) { s.state = 'rendering'; s.fill = 0; s.rate = rollRate(s.chars, plan.speed); loadedGroups.add(s.group); }
    } else if (s.state === 'rendering') {
      s.fill = Math.min(1, s.fill + s.rate);
      if (plan.doomed === s.id && !s.failedOnce && s.fill > 0.55) {
        s.state = 'failed'; s.failedOnce = true; s.failWait = 10;
      } else if (s.fill >= 1) {
        s.state = 'done';
      }
    } else if (s.state === 'failed') {
      s.failWait -= 1;
      if (s.failWait <= 0) { s.state = 'rendering'; s.fill = 0; s.rate = rollRate(s.chars, plan.speed); }
    }
  }

  const active = () => segs.filter(s => s.state === 'preparing' || s.state === 'rendering' || s.state === 'failed').length;
  const preparingGroups = new Set(segs.filter(s => s.state === 'preparing').map(s => s.group));
  for (const s of segs) {
    if (active() >= cap) break;
    if (s.state !== 'queued') continue;
    if (!loadedGroups.has(s.group) && !preparingGroups.has(s.group)) {
      s.state = 'preparing'; s.prep = 4 + Math.floor(Math.random() * 4);
      preparingGroups.add(s.group);
    } else {
      s.state = 'rendering'; s.fill = 0; s.rate = rollRate(s.chars, plan.speed); loadedGroups.add(s.group);
    }
  }
  return segs;
};

const blockStyle = (s: SegRT): React.CSSProperties => {
  const base: React.CSSProperties = {
    flexGrow: s.chars,
    flexBasis: 0,
    minWidth: 3,        // slivers stay visible without gaps between them
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    // No per-block radius/gap: the row reads as one continuous strip (the
    // container rounds + clips the outer ends).
  };
  if (s.state === 'queued') return { ...base, background: 'var(--surface-alt)' };
  if (s.state === 'preparing') return { ...base, background: 'var(--accent-tint-bg)' };
  if (s.state === 'done') return { ...base, background: 'var(--action-primary)' };
  if (s.state === 'failed') return { ...base, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--action-danger)' };
  // rendering — teal track comes from the .ns-seg-active class; inner blue fill
  // is drawn separately and advances over it.
  return base;
};

export const SegmentRenderStrip: React.FC<{ plan: SegmentPlan }> = ({ plan }) => {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [segs, setSegs] = useState<SegRT[]>(() => (reduced ? staticSegs(plan) : makeSegs(plan)));
  const holdRef = useRef(0);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  // Reset segments when the motion preference or plan changes.
  useEffect(() => { setSegs(reduced ? staticSegs(plan) : makeSegs(plan)); }, [reduced, plan]);

  // Drive the simulation. Gated on reduced-motion at the TIMER level — the
  // interval never starts, so there's no DOM churn for assistive tech.
  useEffect(() => {
    if (reduced) return;
    const iv = setInterval(() => {
      setSegs(prev => {
        if (prev.every(s => s.state === 'done')) {
          holdRef.current += 1;
          if (holdRef.current > HOLD_TICKS) { holdRef.current = 0; return makeSegs(plan); }
          return prev;
        }
        return step(prev, plan);
      });
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [reduced, plan]);

  const cap = plan.cap ?? DEFAULT_CAP;
  const total = segs.length;
  const doneCount = segs.filter(s => s.state === 'done').length;
  const activeCount = segs.filter(s => s.state === 'preparing' || s.state === 'rendering' || s.state === 'failed').length;
  const complete = doneCount === total;
  const pct = Math.round(charWeightedProgress(segs) * 100);

  const caption = complete
    ? `Render complete · ${total} segments`
    : `${activeCount} rendering in parallel · ${doneCount}/${total} segments`;

  const ariaLabel = complete
    ? `Render complete, ${total} segments`
    : `Rendering ${doneCount} of ${total} segments, ${activeCount} in parallel`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Aggregate bar — calm; motion lives in the block row below it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ProgressBar pct={pct} />
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>{pct}%</span>
      </div>

      {/* Torrent-style segment block-fill. */}
      <div
        role="img"
        aria-label={ariaLabel}
        style={{
          display: 'flex', gap: 0, height: 10, width: '100%',
          borderRadius: 3, overflow: 'hidden', background: 'var(--surface-alt)',
        }}
      >
        {segs.map(s => {
          const titleState = s.state === 'rendering' ? `rendering ${Math.round(s.fill * 100)}%` : s.state;
          return (
            <div
              key={s.id}
              aria-hidden="true"
              title={`Segment ${s.id + 1} · ${s.chars} chars · ${titleState}`}
              className={
                s.state === 'rendering' ? 'ns-seg-active'
                  : s.state === 'preparing' ? 'ns-seg-prep'
                    : undefined
              }
              style={{
                ...blockStyle(s),
                // Desync the active-block pulse so workers read as independent.
                animationDelay: s.state === 'rendering' ? `${(s.id % cap) * -0.5}s` : undefined,
              }}
            >
              {s.state === 'rendering' && (
                <div
                  className="ns-seg-fill"
                  style={{ width: `${s.fill * 100}%`, height: '100%', background: 'var(--action-primary)' }}
                />
              )}
              {s.state === 'failed' && (
                <div style={{ width: '100%', height: '100%', background: 'var(--action-danger)', opacity: 0.18 }} />
              )}
            </div>
          );
        })}
      </div>

      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{caption}</span>
    </div>
  );
};
