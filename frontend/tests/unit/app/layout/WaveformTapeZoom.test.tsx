/**
 * WaveformTapeZoom.test.tsx
 *
 * Tests for frontend/src/app/layout/WaveformTapeZoom.tsx — the cover-slider
 * zoom preset control (audio-player.md 1.6.0 §5.2). Task 007.
 *
 * No boundary mocks needed — this is a pure, self-contained UI component
 * (no network, no clock, no audio APIs). Nothing here is mocked; the
 * component under test runs for real (R2).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WaveformTapeZoom, snapZoom } from '@/app/layout/WaveformTapeZoom';
import { TAPE_ZOOM_PRESETS_SEC } from '@/app/layout/WaveformTape';

describe('snapZoom', () => {
  it('steps "out" toward larger window sizes, clamped at 120 (last index)', () => {
    expect(snapZoom(30, 'out')).toBe(60);
    expect(snapZoom(120, 'out')).toBe(120); // already at cap
  });

  it('steps "in" toward smaller window sizes, clamped at 3 (index 0)', () => {
    expect(snapZoom(8, 'in')).toBe(5);
    expect(snapZoom(3, 'in')).toBe(3); // already at floor
  });
});

describe('WaveformTapeZoom', () => {
  it('renders 5 tick dots, one per preset', () => {
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={vi.fn()}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    const dots = document.querySelectorAll('.ns-size-tick');
    expect(dots).toHaveLength(TAPE_ZOOM_PRESETS_SEC.length);
  });

  it('does not render second-labels ("8s", "30s", etc.) next to the tick dots', () => {
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={vi.fn()}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    expect(screen.queryByText(/8s/)).not.toBeInTheDocument();
    expect(screen.queryByText(/30s/)).not.toBeInTheDocument();
    expect(screen.queryByText(/120s/)).not.toBeInTheDocument();
  });

  it('slider aria attributes reflect the active preset index, in on-screen (right=tightest) position', () => {
    render(
      <WaveformTapeZoom
        windowSec={60}
        onZoomChange={vi.fn()}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Zoom level' });
    const lastIdx = TAPE_ZOOM_PRESETS_SEC.length - 1;
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', String(lastIdx));
    // 60s is index 5 of 6 (LAST_IDX); on-screen position is LAST_IDX - idx.
    expect(slider).toHaveAttribute('aria-valuenow', String(lastIdx - TAPE_ZOOM_PRESETS_SEC.indexOf(60)));
  });

  it('moving the slider to its rightmost position (tightest zoom) calls onZoomChange with 3s', () => {
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Zoom level' });
    const lastIdx = TAPE_ZOOM_PRESETS_SEC.length - 1;
    // The DOM range input's own value space is on-screen position, not raw
    // preset index (see WaveformTapeZoom.tsx visPos) — its max is the
    // rightmost (tightest, 3s) position.
    fireEvent.change(slider, { target: { value: String(lastIdx) } });
    expect(onZoomChange).toHaveBeenCalledWith(3);
  });

  it('moving the slider to its leftmost position (widest zoom) calls onZoomChange with 120s', () => {
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Zoom level' });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(onZoomChange).toHaveBeenCalledWith(120);
  });

  it('zoom-in cap: presets with too few real samples in the visible window are disabled and unselectable', () => {
    // MIN_SAMPLES_IN_VIEW = 4 (WaveformTapeZoom.tsx): a preset at `secs` needs
    // secs * peaksPerSec >= 4 to be enabled. duration=120, availablePeaks=24
    // → peaksPerSec = 0.2.
    //   3s  → 0.6 samples (invalid)
    //   5s  → 1.0 samples (invalid)
    //   8s  → 1.6 samples (invalid)
    //   15s → 3.0 samples (invalid)
    //   30s → 6.0 samples (valid — first valid preset)
    //   60s, 120s → also valid (looser requirement)
    // So presets 3s/5s/8s/15s (indices 0-3) are below the cap; 30s (index 4)
    // is the first enabled preset.
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={24}
        containerWidthPx={800}
      />,
    );
    const dots = document.querySelectorAll('.ns-size-tick');
    // 3s/5s/8s/15s dots (indices 0-3) must be disabled.
    expect(dots[0]).toHaveClass('tape-zoom-dot--disabled');
    expect(dots[1]).toHaveClass('tape-zoom-dot--disabled');
    expect(dots[2]).toHaveClass('tape-zoom-dot--disabled');
    expect(dots[3]).toHaveClass('tape-zoom-dot--disabled');
    // 30s (index 4) must remain enabled.
    expect(dots[4]).not.toHaveClass('tape-zoom-dot--disabled');

    const slider = screen.getByRole('slider', { name: 'Zoom level' });
    const lastIdx = TAPE_ZOOM_PRESETS_SEC.length - 1;
    // Reachable on-screen range is [0, LAST_IDX - zoomInCapIdx] = [0, 2].
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', String(lastIdx - 4));

    // Attempting to select a disabled preset (index 0 = 3s, on-screen
    // position LAST_IDX) must not fire onZoomChange with that value — the
    // slider's max already prevents reaching it, but guard defensively too.
    fireEvent.change(slider, { target: { value: String(lastIdx) } });
    expect(onZoomChange).not.toHaveBeenCalledWith(3);
  });

  it('zoom-in cap: a realistic sidecar peak density (8 peaks/sec) leaves every preset reachable', () => {
    // Regression for the bug where a bars-vs-peaks-parity cap made only 3 of
    // 7 presets reachable for any chapter long enough to need the
    // server-computed peaks sidecar. 8 peaks/sec is used here as a
    // deliberately LOW density (below compute_peaks_sidecar's current fixed
    // PEAKS_PER_SEC = 60, app/engines/audio_ops.py, and below the previous
    // PEAKS_PER_SEC = 8 this bug shipped with) to prove the cap's floor logic
    // holds at either density: even at 8 peaks/sec the tightest 3s preset has
    // 24 real samples in view — comfortably above MIN_SAMPLES_IN_VIEW (4) —
    // so nothing should be capped.
    const durationSec = 867; // ~14:27, a typical chapter length
    const availablePeaks = Math.ceil(durationSec * 8);
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={vi.fn()}
        duration={durationSec}
        availablePeaks={availablePeaks}
        containerWidthPx={800}
      />,
    );
    const dots = document.querySelectorAll('.ns-size-tick');
    dots.forEach((dot) => expect(dot).not.toHaveClass('tape-zoom-dot--disabled'));
    const slider = screen.getByRole('slider', { name: 'Zoom level' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', String(TAPE_ZOOM_PRESETS_SEC.length - 1));
  });

  it('the "Zoom out" button steps one preset toward more seconds, not jump-to-extreme', () => {
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(onZoomChange).toHaveBeenCalledWith(60); // one step from 30, not a jump to 120
  });

  it('the "Zoom in" button steps one preset toward fewer seconds, not jump-to-extreme', () => {
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        // Deliberately uncapped (zoomInCapIdx=0): 100000 peaks / 120s far exceeds
        // what an 8s-wide, 800px window needs, so this test isolates the
        // step-by-one behavior from the separate zoom-in-cap clamp below.
        availablePeaks={100000}
        containerWidthPx={800}
      />,
    );
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(onZoomChange).toHaveBeenCalledWith(15); // one step from 30, not a jump to 8
  });

  it('the "Zoom out" button clamps at the widest preset (120s), it never overshoots', () => {
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={120}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(onZoomChange).toHaveBeenCalledWith(120);
  });

  it('the "Zoom in" button clamps at the zoom-in cap, not the raw index-0 floor', () => {
    // Same fixture as the zoom-in-cap test above: the cap lands on index 4 (30s).
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={24}
        containerWidthPx={800}
      />,
    );
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(onZoomChange).toHaveBeenCalledWith(30); // already at the cap; must not select a disabled preset
  });

  it('while peaks are still decoding (availablePeaks null) all presets are enabled', () => {
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={vi.fn()}
        duration={120}
        availablePeaks={null}
        containerWidthPx={800}
      />,
    );
    const dots = document.querySelectorAll('.ns-size-tick');
    dots.forEach((dot) => expect(dot).not.toHaveClass('tape-zoom-dot--disabled'));
    const slider = screen.getByRole('slider', { name: 'Zoom level' });
    expect(slider).toHaveAttribute('min', '0');
  });

  it('tick dots carry a descriptive aria-label per preset', () => {
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={vi.fn()}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    expect(screen.getByLabelText('8 seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('120 seconds')).toBeInTheDocument();
  });

  it('the active preset dot is visually marked (accent-filled)', () => {
    render(
      <WaveformTapeZoom
        windowSec={15}
        onZoomChange={vi.fn()}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    const dots = document.querySelectorAll('.ns-size-tick');
    expect(dots[TAPE_ZOOM_PRESETS_SEC.indexOf(15)]).toHaveClass('tape-zoom-dot--active');
  });

  it('does not render an <audio> element or call new Audio() (single-owner invariant)', () => {
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={vi.fn()}
        duration={120}
        availablePeaks={4000}
        containerWidthPx={800}
      />,
    );
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });
});
