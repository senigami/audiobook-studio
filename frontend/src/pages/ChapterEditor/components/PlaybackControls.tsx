import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  isPaused: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSkimStart?: (direction: 'forward' | 'backward') => void;
  onSkimStop?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  className?: string;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  isPaused,
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  onSkimStart,
  onSkimStop,
  hasPrev,
  hasNext,
  className = '',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent, direction: 'forward' | 'backward') => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSkimStart?.(direction);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSkimStop?.();
    }
  };

  return (
    <div className={`playback-controls ${className}`.trim()} aria-label="Chapter playback controls">
      <div className="playback-controls-button-row">
        <button
          onClick={onPrev}
          disabled={!hasPrev || !onPrev}
          className="playback-control-button"
          title="Previous Segment"
          aria-label="Previous Segment"
        >
          <SkipBack size={18} />
        </button>

        <button
          onPointerDown={() => onSkimStart?.('backward')}
          onPointerUp={onSkimStop}
          onPointerLeave={onSkimStop}
          onPointerCancel={onSkimStop}
          onKeyDown={(e) => handleKeyDown(e, 'backward')}
          onKeyUp={handleKeyUp}
          onBlur={onSkimStop}
          disabled={!isPlaying}
          className="playback-control-button"
          title="Skim Backward"
          aria-label="Skim Backward"
        >
          <ChevronsLeft size={18} />
        </button>

        {!isPlaying || isPaused ? (
          <button
            onClick={onPlay}
            className="playback-control-button playback-control-button-primary"
            title="Play"
            aria-label="Play"
          >
            <Play size={18} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onPause}
            className="playback-control-button playback-control-button-primary is-active"
            title="Pause"
            aria-label="Pause"
          >
            <Pause size={18} fill="currentColor" />
          </button>
        )}

        <button
          onClick={onStop}
          disabled={!isPlaying}
          className="playback-control-button"
          title="Stop"
          aria-label="Stop"
        >
          <Square size={18} fill={isPlaying ? "currentColor" : "none"} />
        </button>

        <button
          onPointerDown={() => onSkimStart?.('forward')}
          onPointerUp={onSkimStop}
          onPointerLeave={onSkimStop}
          onPointerCancel={onSkimStop}
          onKeyDown={(e) => handleKeyDown(e, 'forward')}
          onKeyUp={handleKeyUp}
          onBlur={onSkimStop}
          disabled={!isPlaying}
          className="playback-control-button"
          title="Skim Forward"
          aria-label="Skim Forward"
        >
          <ChevronsRight size={18} />
        </button>

        <button
          onClick={onNext}
          disabled={!hasNext || !onNext}
          className="playback-control-button"
          title="Next Segment"
          aria-label="Next Segment"
        >
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
};
