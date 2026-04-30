import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Chapter, Job } from '../types';

interface StatusOrbProps {
  chap: Chapter;
  activeJob?: Job;
  doneSegments?: number; 
  totalSegments?: number;
}

export const StatusOrb: React.FC<StatusOrbProps> = ({ 
  chap, 
  activeJob, 
  doneSegments = 0, 
  totalSegments = 0, 
}) => {
  // 1. Determine priority states
  const isError = chap.audio_status === 'error' || chap.audio_status === 'failed';
  const isStale = !!(chap.text_last_modified && chap.audio_generated_at && (chap.text_last_modified > chap.audio_generated_at));
  
  // We only count it as 'processing' (spinner) if we HAVE a live active job.
  // Otherwise, it's a "stuck" indicator and we should show it as partial/unprocessed but stale.
  const isTrulyProcessing = !!activeJob;
  const isStuckProcessing = !activeJob && chap.audio_status === 'processing';
  
  const isComplete = chap.audio_status === 'done' && chap.has_wav;
  const isReadyToStitch = !isStale && !isTrulyProcessing && totalSegments > 0 && doneSegments === totalSegments && !chap.has_wav;
  const isPartial = !isStale && !isTrulyProcessing && doneSegments > 0 && doneSegments < totalSegments;

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
    fill = 'var(--error)';
    content = <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold', lineHeight: '1' }}>!</span>;
    tooltip = 'Render failed. View Queue for details.';
  } else if (isStale || isStuckProcessing) {
    fill = 'var(--warning)';
    orbRadius = 8.5; // Slightly larger
    orbStroke = 'var(--warning-text)'; // Orange border
    orbStrokeWidth = 1.2;
    content = <AlertTriangle size={10} color="#000" strokeWidth={3} style={{ display: 'block' }} />;
    tooltip = isStuckProcessing 
      ? 'Render was interrupted. Needs rebuild.' 
      : 'Needs rebuild: script or voice assignment changed since last render';
  } else if (isTrulyProcessing) {
    fill = 'var(--surface-light)'; // Neutral/subtle blue or grey
    content = <RefreshCw size={10} color="var(--accent)" className="animate-spin" style={{ display: 'block' }} />;
    tooltip = 'Rendering... (see Queue for progress)';
  } else if (isComplete) {
    fill = 'var(--success)';
    content = null;
    tooltip = 'WAV rendered (in sync)';
  } else if (isReadyToStitch) {
    fill = 'var(--surface)';
    showArc = true;
    percent = 100;
    tooltip = 'All segments rendered. Ready to stitch final audio.';
  } else if (isPartial) {
    fill = 'var(--surface)'; // Light gray interior
    showArc = true;
    percent = totalSegments > 0 ? Math.round((doneSegments / totalSegments) * 100) : 0;
    tooltip = `${percent}% of segments rendered. Queue remaining to finish WAV.`;
  } else {
    // Empty state
    fill = 'var(--surface)';
    tooltip = 'No audio yet';
  }

  // Main tooltip base
  const baseTooltip = tooltip;
  const statusTooltip = `\nM4A cached: ${hasM4a ? 'yes' : 'no'}`;
  const combinedTooltip = baseTooltip + statusTooltip;

  // Calculate ring parameters
  const ringRadius = 10.2;

  // Partial Arc progress parameters
  const progressRadius = orbRadius;
  const progressCircumference = 2 * Math.PI * progressRadius;
  const strokeDashoffset = showArc ? progressCircumference - (percent / 100) * progressCircumference : progressCircumference;

  return (
    <div
      title={combinedTooltip}
      aria-label={combinedTooltip}
      style={{
        width: '24px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'relative', width: '24px', height: '24px', willChange: 'transform' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Integrated Status Ring (M4A only full ring) */}
          <circle
            cx="12" cy="12" r={ringRadius}
            fill="none"
            stroke={hasM4a ? 'var(--accent)' : 'var(--border)'}
            strokeWidth="1.2"
            strokeLinecap="round"
            style={{ opacity: isStale ? 0 : (hasM4a ? 0.8 : 0.3), transition: 'all 0.3s' }}
          />

          {/* Base Orb */}
          <circle cx="12" cy="12" r={orbRadius} fill={fill} stroke={orbStroke} strokeWidth={orbStrokeWidth} />
          
          {/* Partial Arc (Progress) */}
          {showArc && (
            <circle
              cx="12" cy="12" r={orbRadius}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
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
