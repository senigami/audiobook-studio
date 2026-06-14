import React, { useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Square, Rewind, FastForward } from 'lucide-react';
import { usePlayerBus, seek, play, pause, stop, skip, reportTime, notifyEnded, notifyError, notifyPrev, notifyNext } from '@/store/playerBus';
import { LAYERS } from './layering';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds === Infinity || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const PlayerBar: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const state = usePlayerBus();
  const {
    audioUrl,
    playing,
    requestId,
    seekRequestId,
    position,
    duration,
    queue,
    scope,
    title,
    subtitle,
  } = state;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.src !== (audioUrl || '')) {
      audio.src = audioUrl || '';
    }

    if (audioUrl) {
      if (playing) {
        audio.play().catch((err) => {
          console.warn('Audio play failed:', err);
        });
      } else {
        audio.pause();
      }
    }
  }, [audioUrl, playing, requestId]);

  // Dedicated seek effect: fires whenever seek() increments seekRequestId,
  // moves currentTime without fighting the timeupdate reporter.
  useEffect(() => {
    if (seekRequestId === 0) return;
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = position;
    }
  }, [seekRequestId]);  

  if (!audioUrl) {
    return null;
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      reportTime(audio.currentTime, audio.duration || 0);
    }
  };

  const handleEnded = () => {
    notifyEnded();
  };

  const handleError = () => {
    notifyError();
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio) {
      reportTime(audio.currentTime, audio.duration || 0);
    }
  };

  const handlePlayPause = () => {
    if (playing) {
      pause();
    } else {
      play();
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    seek(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  return (
    <div
      className="player-bar"
      style={{
        zIndex: LAYERS.PLAYER_BAR,
        ['--player-waveform-height' as any]: '0px',
      }}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
      />

      <div className="player-bar-expansion" />

      <div className="player-bar-content">
        <div className="player-bar-controls">
          <button
            type="button"
            className="player-btn"
            onClick={notifyPrev}
            disabled={!queue.hasPrev}
            aria-label="Previous"
          >
            <SkipBack size={16} />
          </button>

          <button
            type="button"
            className="player-btn"
            onClick={() => skip(-10)}
            aria-label="Skip back 10 seconds"
          >
            <Rewind size={16} />
          </button>

          <button
            type="button"
            className="player-btn player-btn-primary"
            onClick={handlePlayPause}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            type="button"
            className="player-btn"
            onClick={() => skip(10)}
            aria-label="Skip forward 10 seconds"
          >
            <FastForward size={16} />
          </button>

          <button
            type="button"
            className="player-btn"
            onClick={notifyNext}
            disabled={!queue.hasNext}
            aria-label="Next"
          >
            <SkipForward size={16} />
          </button>

          <button
            type="button"
            className="player-btn player-btn-stop"
            onClick={stop}
            aria-label="Stop"
          >
            <Square size={14} />
          </button>
        </div>

        <div className="player-bar-info">
          <div className="player-bar-title-group">
            <span className="player-title">{title}</span>
            {subtitle && <span className="player-subtitle">{subtitle}</span>}
          </div>
          {scope && <span className="player-scope-badge">{scope}</span>}
        </div>

        <div className="player-bar-progress-container">
          <input
            type="range"
            className="player-progress-slider"
            min={0}
            max={duration || 100}
            value={position}
            onChange={handleSeekChange}
            aria-label="Seek progress"
          />
          <span className="player-time-display">
            {formatTime(position)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};
