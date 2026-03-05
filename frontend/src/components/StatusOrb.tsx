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
  const isError = chap.audio_status === 'error';
  const isStale = !!(chap.text_last_modified && chap.audio_generated_at && (chap.text_last_modified > chap.audio_generated_at));
  const isProcessing = chap.audio_status === 'processing' || !!activeJob;
  const isComplete = chap.audio_status === 'done' && chap.has_wav;
  const isPartial = !isStale && !isProcessing && doneSegments > 0 && doneSegments < totalSegments && !chap.has_wav;

  // Ornaments
  const hasMp3 = chap.has_mp3;
  const hasM4a = chap.has_m4a;

  // Render variables
  let fill = '';
  let content = null;
  let tooltip = '';
  let showArc = false;
  let percent = 0;

  if (isError) {
    fill = 'var(--error)';
    content = <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>!</span>;
    tooltip = 'Render failed. View Queue for details.';
  } else if (isStale) {
    fill = 'var(--warning)';
    content = <AlertTriangle size={8} color="#000" strokeWidth={3} />;
    tooltip = 'Needs rebuild: script or voice assignment changed since last render';
  } else if (isProcessing) {
    fill = 'var(--surface-light)'; // Neutral/subtle blue or grey
    content = <RefreshCw size={10} color="var(--accent)" className="animate-spin" />;
    tooltip = 'Rendering... (see Queue for progress)';
  } else if (isComplete) {
    fill = 'var(--success)';
    content = null;
    tooltip = 'WAV rendered (in sync)';
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

  // Calculate arc parameters
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = showArc ? circumference - (percent / 100) * circumference : circumference;

  return (
    <div
      title={tooltip}
      aria-label={tooltip}
      style={{
        width: '24px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', width: '20px', height: '20px' }}>
        <svg width="20" height="20" viewBox="0 0 20 20" style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Base Orb */}
          <circle cx="10" cy="10" r="8" fill={fill} stroke="var(--border)" strokeWidth="1" />
          
          {/* Partial Arc */}
          {showArc && (
            <circle
              cx="10" cy="10" r="8"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 10 10)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          )}

          {/* M4A Ornament (10 o'clock) */}
          {hasM4a && (
             <circle cx="3" cy="7" r="1.8" fill="var(--accent)" />
          )}

          {/* MP3 Ornament (2 o'clock) */}
          {hasMp3 && (
             <circle cx="17" cy="7" r="1.8" fill="var(--text-secondary)" />
          )}
        </svg>

        {/* Center Content */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          {content}
        </div>
      </div>
    </div>
  );
};
