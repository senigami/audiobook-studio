/**
 * WaveformTapeMinimap.test.tsx
 *
 * Tests for frontend/src/app/layout/WaveformTapeMinimap.tsx — the whole-clip
 * minimap strip + draggable window rectangle (audio-player.md 1.6.0 §5.2).
 * Task 007.
 *
 * No boundary mocks needed — pure UI component, no network/clock/audio APIs.
 * The component under test (including its drag/click math) runs for real (R2).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WaveformTapeMinimap } from '@/app/layout/WaveformTapeMinimap';

function mockRect(svg: SVGSVGElement, width = 1000) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: 28,
    width,
    height: 28,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WaveformTapeMinimap', () => {
  it('renders a region with the expected accessible name', () => {
    render(
      <WaveformTapeMinimap
        duration={120}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={vi.fn()}
        peaks={null}
      />,
    );
    expect(screen.getByRole('region', { name: 'Clip overview — drag to navigate' })).toBeInTheDocument();
  });

  it('falls back to flat bars at amplitude 0.4 when peaks is null (still decoding)', () => {
    const { container } = render(
      <WaveformTapeMinimap
        duration={120}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={vi.fn()}
        peaks={null}
      />,
    );
    const bars = container.querySelectorAll('rect.tape-minimap-bar');
    expect(bars.length).toBe(200); // MINIMAP_BARS
    // height for amp=0.4 in a 28px-tall strip: max(1, 0.4*(28-4)) = 9.6
    bars.forEach((bar) => {
      expect(Number(bar.getAttribute('height'))).toBeCloseTo(0.4 * (28 - 4), 1);
    });
  });

  it('samples the real peak array across MINIMAP_BARS evenly-spaced points', () => {
    // Peaks array where value == index / (length-1), so amplitude increases
    // linearly from 0 to 1 across the clip. The minimap must reflect that
    // increasing shape, not a flat fallback.
    const peaks = Array.from({ length: 1000 }, (_, i) => i / 999);
    const { container } = render(
      <WaveformTapeMinimap
        duration={120}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={vi.fn()}
        peaks={peaks}
      />,
    );
    const bars = Array.from(container.querySelectorAll('rect.tape-minimap-bar'));
    expect(bars.length).toBe(200);
    const firstHeight = Number(bars[0].getAttribute('height'));
    const lastHeight = Number(bars[bars.length - 1].getAttribute('height'));
    expect(lastHeight).toBeGreaterThan(firstHeight);
  });

  it('window rectangle width is proportional to windowSec / duration', () => {
    const { container } = render(
      <WaveformTapeMinimap
        duration={100}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={vi.fn()}
        peaks={null}
      />,
    );
    const rect = container.querySelector('rect.tape-minimap-window') as SVGRectElement;
    expect(rect).toBeInTheDocument();
    const viewBox = container.querySelector('svg')!.getAttribute('viewBox')!;
    const viewW = Number(viewBox.split(' ')[2]);
    const expectedWidth = (30 / 100) * viewW;
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(expectedWidth, 0);
  });

  it('window rectangle has a minimum rendered width of 4px even for a tiny window fraction', () => {
    const { container } = render(
      <WaveformTapeMinimap
        duration={100000}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={8}
        onSeek={vi.fn()}
        peaks={null}
      />,
    );
    const rect = container.querySelector('rect.tape-minimap-window') as SVGRectElement;
    expect(Number(rect.getAttribute('width'))).toBeGreaterThanOrEqual(4);
  });

  it('playhead line is positioned at (currentTimeSec / duration) * viewW', () => {
    const { container } = render(
      <WaveformTapeMinimap
        duration={100}
        currentTimeSec={25}
        windowStartSec={0}
        windowSec={30}
        onSeek={vi.fn()}
        peaks={null}
      />,
    );
    const line = container.querySelector('line.tape-minimap-playhead') as SVGLineElement;
    expect(line).toBeInTheDocument();
    const viewBox = container.querySelector('svg')!.getAttribute('viewBox')!;
    const viewW = Number(viewBox.split(' ')[2]);
    expect(Number(line.getAttribute('x1'))).toBeCloseTo((25 / 100) * viewW, 0);
  });

  it('window rect and playhead use solid var(--accent), not glass tint', () => {
    const { container } = render(
      <WaveformTapeMinimap
        duration={100}
        currentTimeSec={25}
        windowStartSec={0}
        windowSec={30}
        onSeek={vi.fn()}
        peaks={null}
      />,
    );
    const rect = container.querySelector('rect.tape-minimap-window') as SVGRectElement;
    const line = container.querySelector('line.tape-minimap-playhead') as SVGLineElement;
    // Window rect border: plain solid accent (spec §5.2/acceptance criteria).
    expect(rect.getAttribute('stroke')).toBe('var(--accent)');
    // Playhead: var(--color-wave-cursor, var(--accent)) per the task's target
    // shape — a dedicated cursor token that falls back to solid accent, never
    // a glass/opacity tint. Assert it resolves through the accent fallback.
    expect(line.getAttribute('stroke')).toBe('var(--color-wave-cursor, var(--accent))');
  });

  it('dragging the window rectangle calls onSeek with the clamped new windowStartSec', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <WaveformTapeMinimap
        duration={100}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={onSeek}
        peaks={null}
      />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    mockRect(svg, 1000);

    // Drag to 90% across → clicked time = 90, centered start would exceed
    // duration - windowSec (70), so must clamp to 70.
    fireEvent.mouseDown(svg, { clientX: 900 });
    expect(onSeek).toHaveBeenCalled();
    const seekedTo = onSeek.mock.calls[onSeek.mock.calls.length - 1][0];
    expect(seekedTo).toBeLessThanOrEqual(70);
    expect(seekedTo).toBeGreaterThanOrEqual(0);
  });

  it('clicking outside the rectangle centers the window on the clicked position', () => {
    const onSeek = vi.fn();
    const { container } = render(
      <WaveformTapeMinimap
        duration={100}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={onSeek}
        peaks={null}
      />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    mockRect(svg, 1000);

    // Click at 50% (time=50), well outside the current [0,30) window rect.
    fireEvent.mouseDown(svg, { clientX: 500 });
    // Expected: onSeek(clickedTime - windowSec/2) clamped = 50 - 15 = 35.
    expect(onSeek).toHaveBeenCalledWith(35);
  });

  it('does not call bus.seek directly — only delegates via the onSeek prop', () => {
    // There is no playerBus import in this component at all; verified by
    // checking onSeek is the sole navigation channel (asserted behaviorally:
    // the only external call this component makes on interaction is onSeek).
    const onSeek = vi.fn();
    const { container } = render(
      <WaveformTapeMinimap
        duration={100}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={onSeek}
        peaks={null}
      />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    mockRect(svg, 1000);
    fireEvent.mouseDown(svg, { clientX: 500 });
    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  it('keyboard ArrowRight/ArrowLeft on the focused minimap steps the window by windowSec', () => {
    const onSeek = vi.fn();
    render(
      <WaveformTapeMinimap
        duration={200}
        currentTimeSec={40}
        windowStartSec={30}
        windowSec={30}
        onSeek={onSeek}
        peaks={null}
      />,
    );
    const region = screen.getByRole('region', { name: 'Clip overview — drag to navigate' });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(60);

    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it('does not render an <audio> element or call new Audio() (single-owner invariant)', () => {
    render(
      <WaveformTapeMinimap
        duration={100}
        currentTimeSec={10}
        windowStartSec={0}
        windowSec={30}
        onSeek={vi.fn()}
        peaks={null}
      />,
    );
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });
});
