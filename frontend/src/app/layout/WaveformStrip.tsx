/**
 * WaveformStrip.tsx
 *
 * Renders a wavesurfer.js waveform inside the `player-bar-expansion` slot.
 *
 * ADR-0010 single-owner contract: this component NEVER creates its own
 * <audio> element or AudioContext. It is passed the PlayerBar's existing
 * audioRef element and passes it to wavesurfer via the `media` option so
 * wavesurfer renders peaks + handles seek-on-click while the PlayerBar's
 * single <audio> element remains the sole audio owner.
 *
 * Wavesurfer is lazy-imported (dynamic import) so it does not bloat the
 * entry chunk.
 */

import React, { useEffect, useRef } from 'react';

interface WaveformStripProps {
  /** The PlayerBar's <audio> element. Must not be null when this mounts. */
  audioEl: HTMLAudioElement;
  /** Current audio URL — used to trigger re-init on source change. */
  audioUrl: string;
}

export const WaveformStrip: React.FC<WaveformStripProps> = ({ audioEl, audioUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Hold the wavesurfer instance across re-renders
  const wsRef = useRef<{ destroy(): void } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let destroyed = false;

    // Read CSS custom properties for waveform colours so we stay on the token
    // system. Fall back to sensible defaults if the properties aren't set yet.
    const style = getComputedStyle(document.documentElement);
    const waveColor = style.getPropertyValue('--color-wave').trim() || 'var(--text-muted, #888)';
    const progressColor =
      style.getPropertyValue('--color-wave-progress').trim() || 'var(--accent, #6366f1)';
    const cursorColor =
      style.getPropertyValue('--color-wave-cursor').trim() || 'var(--accent, #6366f1)';

    // Lazy-import so wavesurfer stays out of the entry chunk
    import('wavesurfer.js').then(({ default: WaveSurfer }) => {
      if (destroyed) return;

      // Destroy any previous instance before creating a new one
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }

      // ADR-0010: bind to the existing <audio> element via `media`.
      // wavesurfer v7 accepts a `media` option; passing the PlayerBar's element
      // means wavesurfer drives seek by setting that element's currentTime and
      // reads its playback state — it does NOT create a second audio context.
      const ws = WaveSurfer.create({
        container,
        // Pass the existing audio element — single-owner preserved
        media: audioEl,
        waveColor,
        progressColor,
        cursorColor,
        cursorWidth: 1,
        height: 'auto',
        normalize: true,
        interact: true,
        // Disable wavesurfer's built-in audio backend so it does not create its
        // own AudioContext for playback (it still uses Web Audio for decoding
        // the waveform peaks from the URL, but playback goes through `media`).
        // barWidth and barGap give the classic Audacity look
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
      });

      // Load the audio URL so wavesurfer decodes peaks client-side.
      // The `media` option means wavesurfer will NOT create a new audio element
      // for playback — it only uses this URL for peak decoding.
      ws.load(audioUrl);

      wsRef.current = ws;
    });

    return () => {
      destroyed = true;
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
    };
    // Re-initialise when the audio source changes
  }, [audioUrl, audioEl]);

  return <div ref={containerRef} className="waveform-strip" aria-hidden="true" />;
};
