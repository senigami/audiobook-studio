import React from 'react';
import { AlertTriangle, Clock, Loader2, Check, X } from 'lucide-react';
import type { Chapter, Job } from '@/types';

interface StatusOrbProps {
  chap: Chapter;
  activeJob?: Job;
  queuePending?: boolean;
  doneSegments?: number;
  totalSegments?: number;
  /** Rendered diameter in px. Defaults to 24; the 24-unit artwork scales to fit. */
  size?: number;
}

export const StatusOrb: React.FC<StatusOrbProps> = ({
  chap,
  activeJob,
  queuePending = false,
  doneSegments = 0,
  totalSegments = 0,
  size = 24,
}) => {
  // 1. Determine priority states
  const isError = chap.audio_status === 'error' || chap.audio_status === 'failed';
  const isStale = !!(chap.text_last_modified && chap.audio_generated_at && (chap.text_last_modified > chap.audio_generated_at));
  
  // We only count it as 'processing' (spinner) if we HAVE a live active job.
  // Otherwise, it's a "stuck" indicator and we should show it as partial/unprocessed but stale.
  const isTrulyProcessing = !!activeJob;
  // Preparing = the model-load / indeterminate window WITHIN an active job. Derived
  // from the same signal useStudioChapter.ts uses (reason_code SEGMENT_PENDING /
  // LOADING_MODEL, or indeterminate). This is NOT a new signal — it rides fields
  // already present on the Job the orb receives. Precedence: sits ABOVE the running
  // spinner branch, because during the load window isTrulyProcessing is also true.
  const isPreparing = isTrulyProcessing && (
    activeJob?.reason_code === 'SEGMENT_PENDING' ||
    activeJob?.reason_code === 'LOADING_MODEL' ||
    activeJob?.indeterminate === true
  );
  const isQueued = !activeJob && (queuePending || chap.audio_status === 'processing');
  const isStuckProcessing = !activeJob && chap.audio_status === 'processing' && !queuePending;

  // Real completed-vs-total segment ratio — a discrete manuscript count, not a
  // fabricated progress value. Safe to surface in every state, including the
  // indeterminate preparing window (the arc shows last-known done/total; it does
  // not animate a fake advance).
  const hasSeg = totalSegments > 0 && doneSegments > 0;
  const allSegsDone = totalSegments > 0 && doneSegments >= totalSegments;
  const segPercent = hasSeg ? (doneSegments / totalSegments) * 100 : 0;

  // Ornaments
  const hasM4a = chap.has_m4a;

  // Render variables
  let fill = '';
  let content = null;
  let tooltip = '';
  let showArc = false;
  let percent = 0;
  let orbRadius = 8;
  let orbStroke = 'var(--border)';
  let orbStrokeWidth = 1;

  if (isError) {
    fill = 'rgba(239,68,68,.10)';
    orbStroke = 'var(--error)';
    content = (
      <span data-testid="orb-icon-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
        <X size={10} strokeWidth={2.5} color="var(--error)" style={{ display: 'block' }} />
      </span>
    );
    tooltip = 'Render failed. View Queue for details.';
  } else if (isPreparing) {
    // Distinct preparing tier (progress-presentation.md §2.7): dimmed, calm-pulsing,
    // NO spinner — the model-load window reads differently from active synthesis.
    // The pulse rides `.orb-is-preparing`, which base.css re-enables under
    // prefers-reduced-motion as a calm opacity breathe (no movement) — same
    // essential-state exemption as the ScriptView preparing pulse. The class is
    // orb-scoped (not bare `is-preparing`) so it can't leak onto ScriptView's
    // bare-`is-preparing` script-mode text spans.
    fill = 'rgba(30,79,216,.10)';
    orbStroke = 'var(--live-indicator)';
    content = (
      <span
        data-testid="orb-icon-preparing"
        className="orb-is-preparing"
        aria-hidden="true"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}
      >
        <svg width="6" height="6" viewBox="0 0 6 6" style={{ display: 'block' }}>
          <circle cx="3" cy="3" r="3" fill="var(--live-indicator)" />
        </svg>
      </span>
    );
    tooltip = 'Preparing… loading voice model';
    // The segment arc still reflects real done/total during the load window.
    if (hasSeg) { showArc = true; percent = segPercent; }
  } else if (isTrulyProcessing) {
    fill = 'rgba(30,79,216,.10)';
    orbStroke = 'var(--live-indicator)';
    content = (
      <span data-testid="orb-icon-running" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
        <Loader2 size={10} color="var(--live-indicator)" className="animate-spin" style={{ display: 'block' }} />
      </span>
    );
    tooltip = 'Rendering... (see Queue for progress)';
    // Live segment progress: reflect completed-vs-total segments while rendering.
    if (hasSeg) {
      showArc = true;
      percent = segPercent;
      if (!allSegsDone) tooltip = `Rendering… ${Math.round(segPercent)}% of segments done (see Queue for progress)`;
    }
  } else if (isQueued) {
    fill = 'rgba(100,116,139,.10)';
    orbStroke = 'rgba(100,116,139,.30)';
    content = (
      <span data-testid="orb-icon-queued" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
        <Clock size={10} color="var(--text-muted)" style={{ display: 'block' }} />
      </span>
    );
    tooltip = 'Queued for rendering';
  } else if (isStale || isStuckProcessing) {
    fill = 'var(--warning)';
    orbRadius = 8.5; // Slightly larger
    orbStroke = 'var(--warning-text)'; // Orange border
    orbStrokeWidth = 1.2;
    content = <AlertTriangle size={10} color="var(--text-on-warning)" strokeWidth={3} style={{ display: 'block' }} />;
    tooltip = isStuckProcessing 
      ? 'Render was interrupted. Needs rebuild.' 
      : 'Needs rebuild: script or voice assignment changed since last render';
  } else {
    // Stable state — S × W × M combinatorial:
    //   S (segments) → blue arc at actual segment percentage
    //   W (wav)      → green orb + green check (or gold if M)
    //   M (m4a)      → gold orb
    if (hasM4a) {
      fill = 'var(--status-m4a)';
      orbStroke = 'var(--status-m4a-border)';
      if (chap.has_wav) {
        content = (
          <span data-testid="orb-icon-gold-done" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
            <Check size={10} strokeWidth={2.5} color="var(--status-m4a-icon)" style={{ display: 'block' }} />
          </span>
        );
        tooltip = 'WAV rendered and M4A exported';
      } else {
        tooltip = 'M4A exported';
      }
      if (hasSeg) {
        showArc = true;
        percent = segPercent;
        if (!allSegsDone) tooltip += `. ${Math.round(segPercent)}% of segments rendered.`;
      }
    } else if (chap.has_wav) {
      fill = 'rgba(22,163,74,.10)';
      orbStroke = 'var(--success)';
      content = (
        <span data-testid="orb-icon-done" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
          <Check size={10} strokeWidth={2} color="var(--success)" style={{ display: 'block' }} />
        </span>
      );
      if (hasSeg) {
        showArc = true;
        percent = segPercent;
        tooltip = allSegsDone
          ? 'WAV rendered (in sync)'
          : `WAV rendered. ${Math.round(segPercent)}% of segments rendered.`;
      } else {
        tooltip = 'WAV rendered (in sync)';
      }
    } else if (hasSeg) {
      fill = 'var(--surface)';
      showArc = true;
      percent = segPercent;
      tooltip = allSegsDone
        ? 'All segments rendered. Ready to stitch final audio.'
        : `${Math.round(segPercent)}% of segments rendered. Queue remaining to finish WAV.`;
    } else {
      fill = 'var(--surface)';
      tooltip = 'No audio yet';
    }
  }

  const combinedTooltip = tooltip;

  // Outer decorative ring — sits outside arc track
  const ringRadius = 11.2;

  // Arc drawn outside the orb so it never overlaps the fill.
  // r=9.5: inner edge (8.5) is flush with orb stroke outer edge (orbRadius 8 + half stroke 0.5).
  const arcRadius = 9.5;
  const progressCircumference = 2 * Math.PI * arcRadius;
  const strokeDashoffset = showArc ? progressCircumference - (percent / 100) * progressCircumference : progressCircumference;

  return (
    <div
      role="img"
      title={combinedTooltip}
      aria-label={combinedTooltip}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'relative', width: '24px', height: '24px', willChange: 'transform', transform: `scale(${size / 24})`, transformOrigin: 'top left' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Integrated Status Ring (M4A only full ring) */}
          <circle
            cx="12" cy="12" r={ringRadius}
            fill="none"
            stroke={isTrulyProcessing ? 'var(--live-indicator)' : 'var(--border)'}
            strokeWidth="1.2"
            strokeLinecap="round"
            className={isPreparing ? 'orb-is-preparing' : (isTrulyProcessing ? 'is-running' : undefined)}
            style={{ opacity: isStale ? 0 : (isPreparing ? 0.45 : (isTrulyProcessing ? 0.8 : 0.3)), transition: 'all 0.3s' }}
          />

          {/* Base Orb */}
          <circle cx="12" cy="12" r={orbRadius} fill={fill} stroke={orbStroke} strokeWidth={orbStrokeWidth} />

          {/* Arc track placeholder — always present so layout never shifts */}
          <circle cx="12" cy="12" r={arcRadius} fill="none" stroke="transparent" strokeWidth="2" />

          {/* Partial Arc (Progress) — outside the orb, never overlaps fill */}
          {showArc && (
            <circle
              cx="12" cy="12" r={arcRadius}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray={progressCircumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 12 12)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          )}
        </svg>

        {/* Center Content - using absolute centering for maximum precision */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          lineHeight: 0,
        }}>
          {content}
        </div>
      </div>
    </div>
  );
};
