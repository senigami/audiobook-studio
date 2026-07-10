import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Square, Rewind, FastForward, AudioLines, Waves, GalleryHorizontalEnd } from 'lucide-react';
import { usePlayerBus, seek, play, pause, stop, skip, reportTime, notifyEnded, notifyError, notifyPrev, notifyNext } from '@/store/playerBus';
import { WaveformStrip } from './WaveformStrip';
import { WaveformTape } from './WaveformTape';
import type { TapeZoomPreset } from './waveformTapeZoomPresets';
import { LAYERS } from './layering';
import { fitsLegibly } from './playerRepresentation';

/**
 * Duration cap in seconds above which the tape is never offered (browser-decode
 * safety). Task 008 (backend peaks sidecar) imports this exact constant to decide
 * when to fetch a server-computed peaks sidecar instead.
 */
export const TAPE_DURATION_CAP_SEC = 600;

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
    title,
    subtitle,
  } = state;

  // Scrub representation defaults to duration-driven fit (fitsLegibly), but the
  // far-right toggle lets the user flip it. The override resets to the duration
  // default whenever a new source loads (requestId bumps).
  const [forceWave, setForceWave] = useState<boolean | null>(null);

  const [tapeOpen, setTapeOpen] = useState<boolean>(false);
  const [windowSec, setWindowSec] = useState<TapeZoomPreset>(30);
  const [tapeMode, setTapeMode] = useState<'paged' | 'moving'>('paged');

  // Only for disabling/labeling PlayerBar's own motion-toggle button.
  // WaveformTape already internally clamps to 'paged' when prefers-reduced-motion
  // is active, regardless of the `mode` prop it's given — do not double-gate the
  // prop value against this state, pass `mode={tapeMode}` plainly.
  //
  // Lazy useState initializer (not useRef(...).current) — reading a ref's
  // .current during render trips this repo's react-hooks/refs lint rule;
  // mirrors the same read-once-at-mount pattern as useReducedMotion() in
  // WaveformTape.tsx.
  const [prefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    setForceWave(null);
    setTapeOpen(false);
    setWindowSec(30);
    setTapeMode('paged');
  }, [requestId]);

  // Measures the scrub container's actual rendered width so fitsLegibly() can
  // compare it against the clip duration. Starts at 0 (unmeasured) so the
  // duration-only bootstrap threshold applies until the first observation.
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);
  const scrubContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrubContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setMeasuredWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // empty deps — ref node is stable after mount

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

  // Default representation is duration-driven (scope-blind); forceWave
  // overrides when the user flips the AudioLines toggle.
  const showWave = forceWave ?? fitsLegibly(duration, measuredWidth);

  const tapeAvailable = duration > 0 && duration <= TAPE_DURATION_CAP_SEC;

  const handleWaveToggle = () => {
    if (tapeAvailable && !showWave) {
      setTapeOpen(prev => !prev);
    } else {
      setForceWave(prev => (prev === null ? !showWave : !prev));
    }
  };

  return (
    <div className="player-bar" style={{ zIndex: LAYERS.PLAYER_BAR }}>
      <audio
        ref={audioCallbackRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
      />

      {tapeOpen && tapeAvailable && !showWave && audioEl && (
        <div className="player-tape-region">
          <WaveformTape
            audioEl={audioEl}
            audioUrl={audioUrl}
            duration={duration}
            windowSec={windowSec}
            mode={tapeMode}
            onZoomChange={setWindowSec}
          />
          <button
            type="button"
            className="player-btn tape-motion-toggle"
            onClick={() => setTapeMode(m => (m === 'paged' ? 'moving' : 'paged'))}
            aria-label={tapeMode === 'moving' ? 'Switch to paged motion' : 'Switch to moving motion'}
            aria-pressed={tapeMode === 'moving'}
            disabled={prefersReducedMotion}
            title={prefersReducedMotion ? 'Moving motion disabled (reduced motion)' : undefined}
          >
            {tapeMode === 'moving' ? <GalleryHorizontalEnd size={14} /> : <Waves size={14} />}
          </button>
        </div>
      )}

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
        </div>

        {/* Scrub track — representation is duration-driven (fitsLegibly):
            a short clip renders an inline waveform, a long one a plain slider.
            Scope-blind (audio-player.md 1.6.0) and can be flipped via the
            far-right toggle. When the waveform is shown it reflows above the
            controls on narrow widths via the CSS container query
            (.player-scrub--wave). */}
        <div
          ref={scrubContainerRef}
          className={`player-scrub${showWave ? ' player-scrub--wave' : ''}`}
        >
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

        {/* Representation override — defaults to duration fit, flip waveform ↔ bar on demand */}
        <button
          type="button"
          className={`player-btn player-btn-wave${showWave ? ' player-btn-wave--on' : ''}`}
          onClick={handleWaveToggle}
          aria-pressed={(tapeOpen && tapeAvailable && !showWave) || showWave}
          aria-label={
            showWave
              ? 'Show progress bar'
              : !tapeAvailable
                ? 'Show waveform'
                : tapeOpen
                  ? 'Close tape view'
                  : 'Open tape view'
          }
        >
          <AudioLines size={15} />
        </button>
      </div>
    </div>
  );
};
