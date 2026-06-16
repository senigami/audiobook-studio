import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Square, Rewind, FastForward, Activity } from 'lucide-react';
import { usePlayerBus, seek, play, pause, stop, skip, switchScope, reportTime, notifyEnded, notifyError, notifyPrev, notifyNext } from '@/store/playerBus';
import { WaveformStrip } from './WaveformStrip';
import { LAYERS } from './layering';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds === Infinity || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const PlayerBar: React.FC = () => {
  // audioRef is used for direct DOM access in effects/handlers (never read during render).
  const audioRef = useRef<HTMLAudioElement>(null);

  // audioEl state is set via callback ref so WaveformStrip can receive the DOM node
  // *after* it mounts — reading audioRef.current during render is not allowed in React 19.
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const audioCallbackRef = useCallback((node: HTMLAudioElement | null) => {
    // Keep both in sync: the ref for effects/handlers, the state for render-time children
    (audioRef as React.MutableRefObject<HTMLAudioElement | null>).current = node;
    setAudioEl(node);
  }, []);

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
    altScope,
  } = state;

  // Scrub representation defaults to the scope type (segment → waveform, else →
  // bar), but the far-right toggle lets the user flip it. The override resets to
  // the scope default whenever a new source loads (requestId bumps).
  const [forceWave, setForceWave] = useState<boolean | null>(null);
  useEffect(() => { setForceWave(null); }, [requestId]);

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

  // Default representation follows scope; forceWave overrides when the user flips.
  const showWave = forceWave ?? (scope === 'segment');

  return (
    <div className="player-bar" style={{ zIndex: LAYERS.PLAYER_BAR }}>
      <audio
        ref={audioCallbackRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
      />

      <div className="player-bar-content">
        <div className="player-bar-controls" role="group" aria-label="Playback controls">
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

        <div className="player-bar-divider" aria-hidden="true" />

        <div className="player-bar-info">
          <div className="player-bar-title-group">
            <span className="player-title">{title}</span>
            {subtitle && <span className="player-subtitle">{subtitle}</span>}
          </div>
          {scope && altScope ? (
            <div className="player-scope-toggle" role="group" aria-label="Audio scope">
              {/* Active pill — current scope */}
              <button
                type="button"
                className="player-scope-pill player-scope-pill--active"
                onClick={switchScope}
                aria-pressed={true}
                aria-label={`Playing ${scope}`}
              >
                {scope}
              </button>
              {/* Inactive pill — tap to switch */}
              <button
                type="button"
                className="player-scope-pill"
                onClick={switchScope}
                aria-pressed={false}
                aria-label={`Switch to ${altScope.scope}`}
              >
                {altScope.scope}
              </button>
            </div>
          ) : (
            scope && <span className="player-scope-badge">{scope}</span>
          )}
        </div>

        {/* Scrub track — representation defaults to scope (segment → inline
            waveform / else → plain slider) and can be flipped via the far-right
            toggle. When the waveform is shown it reflows above the controls on
            narrow widths via the CSS container query (.player-scrub--wave). */}
        <div className={`player-scrub${showWave ? ' player-scrub--wave' : ''}`}>
          {showWave && audioEl ? (
            <div className="player-waveform-inline">
              <WaveformStrip audioEl={audioEl} audioUrl={audioUrl} />
            </div>
          ) : (
            <input
              type="range"
              className="player-progress-slider"
              min={0}
              max={duration || 100}
              value={position}
              onChange={handleSeekChange}
              aria-label="Seek progress"
            />
          )}
        </div>

        <span className="player-time-display">
          {formatTime(position)} / {formatTime(duration)}
        </span>

        {/* Representation override — defaults to scope, flip waveform ↔ bar on demand */}
        <button
          type="button"
          className={`player-btn player-btn-wave${showWave ? ' player-btn-wave--on' : ''}`}
          onClick={() => setForceWave(!showWave)}
          aria-pressed={showWave}
          aria-label={showWave ? 'Show progress bar' : 'Show waveform'}
        >
          <Activity size={15} />
        </button>
      </div>
    </div>
  );
};
