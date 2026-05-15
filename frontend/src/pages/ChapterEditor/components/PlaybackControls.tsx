import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward } from 'lucide-react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  isPaused: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev?: () => void;
  onNext?: () => void;
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
  hasPrev,
  hasNext,
  className = '',
}) => {
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
