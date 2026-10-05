import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Square, Rewind, FastForward, AudioLines, Waves, GalleryHorizontalEnd, Volume2, Volume1, VolumeX } from 'lucide-react';
import { usePlayerBus, seek, play, pause, stop, skip, reportTime, notifyEnded, notifyError, notifyPrev, notifyNext } from '@/store/playerBus';
import { WaveformStrip } from './WaveformStrip';
import { WaveformTape } from './WaveformTape';
import type { TapeZoomPreset } from './waveformTapeZoomPresets';
import { LAYERS } from './layering';
import { fitsLegibly } from './playerRepresentation';
import { fetchPeaksSidecar } from '@/api/fetchPeaksSidecar';

/**
 * Duration cap in seconds above which the tape is never offered (browser-decode
 * safety). Task 008 (backend peaks sidecar) imports this exact constant to decide
 * when to fetch a server-computed peaks sidecar instead.
 */
export const TAPE_DURATION_CAP_SEC = 600;

// Owner-requested (2026-07-16): the global player had no volume control, so
// it always played at the OS/system volume. Persisted across sessions like
// the theme preference (utils/theme.ts's STORAGE_KEY pattern), since
// PlayerBar is a single app-lifetime instance and the user's chosen level
// should survive a reload, not just a track change.
const VOLUME_STORAGE_KEY = 'studio-player-volume';

function loadVolumePref(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 1;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
  } catch {
    return 1;
  }
}

function saveVolumePref(volume: number): void {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

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

  // Volume (owner-requested, 2026-07-16): 0-1, persisted across sessions.
  // `prevVolumeRef` remembers the last non-zero level so the mute toggle can
  // restore it, same as a normal media player's mute button.
  const [volume, setVolume] = useState<number>(() => loadVolumePref());
  const prevVolumeRef = useRef<number>(volume > 0 ? volume : 1);

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

  // Only forceWave resets per-track: it is a scope-blind representation
  // override tied to fitting the CURRENT clip's duration (fitsLegibly), so a
  // new source needs to re-derive its own default rather than inherit the
  // previous clip's override.
  //
  // tapeOpen/windowSec/tapeMode are deliberately NOT reset here — they are
  // session-scoped tape-view preferences (owner request: "if I open the
  // waveform and then play a different audio I want it to stay in the same
  // view that I had selected" — the tape's open/closed state, its zoom
  // level, and its paged/moving mode must all survive switching to a
  // different track within the same browser session). They intentionally
  // carry over from whatever the user last set, across every track change,
  // for the lifetime of this PlayerBar instance (i.e. the browser session —
  // PlayerBar is mounted once for the app's lifetime and returning null
  // above does not unmount/reset component state). They are NOT persisted to
  // localStorage/sessionStorage — no full-reload persistence is implied or
  // required by the request, and this repo has no existing sessionStorage
  // convention to match (only localStorage, used for permanent
  // cross-restart settings like theme/rail state, a different scope than
  // this request). If the new track is over the duration cap (tapeAvailable
  // false) or fits the inline waveform (showWave true), the tape region
  // simply doesn't render regardless of tapeOpen — no dangling UI.
  useEffect(() => {
    setForceWave(null);
  }, [requestId]);

  // Server-computed peaks sidecar (task 008) — lets long chapters (over
  // TAPE_DURATION_CAP_SEC) get a tape fed by a precomputed peaks array
  // instead of a browser AudioContext decode. Only fetched for over-cap
  // clips; under-cap clips already decode via usePeaks inside WaveformTape.
  const [sidecarPeaks, setSidecarPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    setSidecarPeaks(null); // reset on new source
    if (duration <= TAPE_DURATION_CAP_SEC || !audioUrl) return;
    let cancelled = false;
    fetchPeaksSidecar(audioUrl).then(peaks => {
      if (!cancelled) setSidecarPeaks(peaks);
    });
    return () => {
      cancelled = true;
    };
  }, [requestId, duration, audioUrl]);

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

  // Loads a new source only when the track actually changes (audioUrl or a
  // fresh requestId — e.g. replaying the same track from loadAndPlay).
  //
  // Bug this fixes: this used to live in one combined effect keyed on
  // [audioUrl, playing, requestId] that compared `audio.src !== audioUrl`
  // before reassigning. `audio.src` is a DOM getter that always returns a
  // browser-RESOLVED absolute URL (e.g.
  // `http://host/out/voices/Dark%20Fantasy/...`), while `audioUrl` from the
  // bus is the original relative, unencoded path
  // (`/out/voices/Dark Fantasy/...`) — those two strings are NEVER equal, so
  // the guard always failed open and `audio.src` got reassigned on every
  // effect run, including runs triggered by `playing` alone (i.e. every
  // Play/Pause click). Reassigning `.src` aborts and reloads the media
  // element, momentarily resetting `currentTime`/`duration` to 0/NaN, which
  // flipped `tapeAvailable`/`showWave` false then true again — unmounting and
  // remounting `.player-tape-region` and replaying its `player-tape-open`
  // mount animation. That's the visible "jump like it's quickly closing and
  // reopening" on Play. Splitting the source load into its own effect keyed
  // only on the track identity (not `playing`) means clicking Play/Pause
  // never touches `audio.src` at all.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = audioUrl || '';
  }, [audioUrl, requestId]);

  // Drives play/pause on the already-loaded element — never touches `.src`.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (playing) {
      audio.play().catch((err) => {
        console.warn('Audio play failed:', err);
      });
    } else {
      audio.pause();
    }
  }, [audioUrl, playing, requestId]);

  // Apply volume to the underlying element whenever it changes, and also
  // when a fresh <audio> node mounts (audioEl) so a newly-loaded track
  // immediately reflects the persisted/chosen level rather than the
  // browser's own default of 1.
  useEffect(() => {
    if (audioEl) {
      audioEl.volume = volume;
    }
  }, [audioEl, volume]);

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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val > 0) prevVolumeRef.current = val;
    setVolume(val);
    saveVolumePref(val);
  };

  const handleMuteToggle = () => {
    const next = volume > 0 ? 0 : (prevVolumeRef.current || 1);
    setVolume(next);
    saveVolumePref(next);
  };

  // Default representation is duration-driven (scope-blind); forceWave
  // overrides when the user flips the AudioLines toggle.
  const showWave = forceWave ?? fitsLegibly(duration, measuredWidth);

  const tapeAvailable = (duration > 0 && duration <= TAPE_DURATION_CAP_SEC) || sidecarPeaks !== null;

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
            peaks={sidecarPeaks}
            zoomRowTrailing={
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
            }
          />
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

        {/* Volume control (owner-requested, 2026-07-16): mute toggle + level
            slider, same as a normal media player — the global player used to
            always play at the system/OS volume with no way to adjust it. */}
        <div className="player-bar-volume" role="group" aria-label="Volume">
          <button
            type="button"
            className="player-btn"
            onClick={handleMuteToggle}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            aria-pressed={volume === 0}
          >
            {volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            className="player-volume-slider"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
            aria-label="Volume level"
          />
        </div>

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
