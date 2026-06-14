import { Play, Pause, RotateCcw, RotateCw } from 'lucide-react';

interface FollowAlongPanelProps {
  position: number;
  duration: number;
  isPlaying: boolean;
  togglePlayPause: () => void;
  seekBy: (seconds: number) => void;
  chapterTitle: string;
  activeSegmentId: string | null;
  totalSegments: number;
  activeSegmentIndex: number;
  onReRenderSegment?: () => void;
  isReRendering?: boolean;
  reRenderError?: string | null;
}

export function FollowAlongPanel({
  position,
  duration,
  isPlaying,
  togglePlayPause,
  seekBy,
  chapterTitle,
  activeSegmentId,
  totalSegments,
  activeSegmentIndex,
  onReRenderSegment,
  isReRendering,
  reRenderError,
}: FollowAlongPanelProps) {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div
      className="follow-along-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-panel)',
        minWidth: '260px',
      }}
    >
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
        Follow-Along Playback
      </h3>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <strong>Chapter:</strong> {chapterTitle || 'No Chapter Selected'}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          margin: '12px 0',
        }}
      >
        <button
          type="button"
          onClick={() => seekBy(-5)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
          title="Rewind 5s"
        >
          <RotateCcw size={16} />
        </button>

        <button
          type="button"
          onClick={togglePlayPause}
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'white',
          }}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>

        <button
          type="button"
          onClick={() => seekBy(5)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
          title="Forward 5s"
        >
          <RotateCw size={16} />
        </button>
      </div>

      {/* Progress track */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div
          style={{
            height: '6px',
            background: 'var(--border)',
            borderRadius: '3px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'var(--accent)',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>{formatTime(position)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {activeSegmentId && (
        <div
          style={{
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border)',
            paddingTop: '8px',
            marginTop: '8px',
          }}
        >
          <div>
            <strong>Segment:</strong> {activeSegmentIndex + 1} / {totalSegments}
          </div>
          <div style={{ fontSize: '0.65rem', fontStyle: 'italic', marginTop: '2px' }}>
            ID: {activeSegmentId}
          </div>
          {onReRenderSegment && (
            <button
              type="button"
              onClick={onReRenderSegment}
              disabled={isReRendering}
              aria-label="Regenerate Segment"
              style={{
                marginTop: '8px',
                padding: '6px 10px',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-button)',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: isReRendering ? 'not-allowed' : 'pointer',
                opacity: isReRendering ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                width: '100%',
              }}
            >
              {isReRendering ? 'Regenerating...' : 'Regenerate Segment'}
            </button>
          )}
          {reRenderError && (
            <div
              role="alert"
              style={{
                marginTop: '6px',
                fontSize: '0.65rem',
                color: 'var(--error, #e53e3e)',
                padding: '4px 6px',
                background: 'var(--error-tint-bg, color-mix(in srgb, var(--error, #e53e3e) 10%, transparent))',
                borderRadius: 'var(--radius-button)',
                border: '1px solid var(--error-border, color-mix(in srgb, var(--error, #e53e3e) 30%, transparent))',
              }}
            >
              {reRenderError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
