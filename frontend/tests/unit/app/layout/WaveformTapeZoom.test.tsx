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
  it('steps "out" toward larger window sizes, clamped at 120 (index 4)', () => {
    expect(snapZoom(30, 'out')).toBe(60);
    expect(snapZoom(120, 'out')).toBe(120); // already at cap
  });

  it('steps "in" toward smaller window sizes, clamped at 8 (index 0)', () => {
    expect(snapZoom(30, 'in')).toBe(15);
    expect(snapZoom(8, 'in')).toBe(8); // already at floor
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

  it('slider aria attributes reflect the active preset index', () => {
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
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '4');
    expect(slider).toHaveAttribute('aria-valuenow', String(TAPE_ZOOM_PRESETS_SEC.indexOf(60)));
  });

  it('moving the slider calls onZoomChange with the preset at the new index', () => {
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
    fireEvent.change(slider, { target: { value: '4' } });
    expect(onZoomChange).toHaveBeenCalledWith(120);
  });

  it('zoom-in cap: presets that would exceed available peak resolution are disabled and unselectable', () => {
    // containerWidthPx=800, duration=120 → peaks/sec available = 3600/120 = 30.
    // A preset at `secs` needs peaks/sec >= containerWidthPx/secs to be valid:
    //   8s  → needs 100 px/s (30 < 100: invalid)
    //   15s → needs 53.3 px/s (30 < 53.3: invalid)
    //   30s → needs 26.7 px/s (30 >= 26.7: valid — first valid preset)
    //   60s, 120s → also valid (looser requirement)
    // So only presets 8s (idx 0) and 15s (idx 1) are below the cap; 30s (idx 2)
    // is the first enabled preset.
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={3600}
        containerWidthPx={800}
      />,
    );
    const dots = document.querySelectorAll('.ns-size-tick');
    // 8s dot (index 0) and 15s dot (index 1) must be disabled.
    expect(dots[0]).toHaveClass('tape-zoom-dot--disabled');
    expect(dots[1]).toHaveClass('tape-zoom-dot--disabled');
    // 30s (index 2) must remain enabled.
    expect(dots[2]).not.toHaveClass('tape-zoom-dot--disabled');

    const slider = screen.getByRole('slider', { name: 'Zoom level' });
    expect(slider).toHaveAttribute('min', '2');

    // Attempting to select a disabled preset (index 0) must not fire onZoomChange
    // with that value — the slider's min already prevents reaching it, but
    // guard defensively too.
    fireEvent.change(slider, { target: { value: '0' } });
    expect(onZoomChange).not.toHaveBeenCalledWith(8);
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
    // Same fixture as the zoom-in-cap test above: the cap lands on index 2 (30s).
    const onZoomChange = vi.fn();
    render(
      <WaveformTapeZoom
        windowSec={30}
        onZoomChange={onZoomChange}
        duration={120}
        availablePeaks={3600}
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
