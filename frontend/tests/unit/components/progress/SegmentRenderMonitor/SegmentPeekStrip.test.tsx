/**
 * Tests for SegmentPeekStrip (task 011) — the Level-2 condensed block row
 * shared with the full field via SegmentBlockRow.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SegmentPeekStrip } from '@/components/progress/SegmentRenderMonitor/SegmentPeekStrip';
import type { SegmentRenderMonitorSegment } from '@/components/progress/SegmentRenderMonitor/SegmentBlockRow';

function makeSegments(n: number, overrides: Partial<SegmentRenderMonitorSegment>[] = []): SegmentRenderMonitorSegment[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `seg-${i}`,
    charCount: 100 + i,
    phase: 'done' as const,
    progress: 1,
    ...(overrides[i] ?? {}),
  }));
}

describe('SegmentPeekStrip', () => {
  it('renders a condensed block row using the shared block encoding (role=img)', () => {
    const segments = makeSegments(12, [
      { phase: 'rendering', progress: 0.3 },
      { phase: 'rendering', progress: 0.6 },
    ]);
    const { container } = render(
      <SegmentPeekStrip segments={segments} activeCount={2} onExpand={vi.fn()} onDismiss={vi.fn()} />,
    );
    const strip = container.querySelector('[role="img"]');
    expect(strip).not.toBeNull();
    expect(strip?.querySelectorAll('[aria-hidden="true"]').length).toBe(12);
  });

  it('calls onExpand when the strip is clicked', () => {
    const onExpand = vi.fn();
    const segments = makeSegments(12, [{ phase: 'rendering', progress: 0.3 }, { phase: 'rendering', progress: 0.6 }]);
    render(<SegmentPeekStrip segments={segments} activeCount={2} onExpand={onExpand} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /expand segment render detail/i }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when the dismiss control is clicked, independent of the expand button', () => {
    const onExpand = vi.fn();
    const onDismiss = vi.fn();
    const segments = makeSegments(12, [{ phase: 'rendering', progress: 0.3 }, { phase: 'rendering', progress: 0.6 }]);
    render(<SegmentPeekStrip segments={segments} activeCount={2} onExpand={onExpand} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss segment render peek strip/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();
  });

  // Regression (owner-reported): at a high segment count (e.g. 466), the
  // block row's summed per-block minWidth (SegmentBlockRow's 6px floor)
  // exceeds the card's width, and a flex item's default min-width: auto
  // inflates every ancestor in the flex chain to that content size instead
  // of letting overflow: hidden clip it — the row bleeds out of the card
  // into whatever sits next to it. Every flex container between the strip
  // root and the block row must break that default with min-width: 0 so
  // percentage/flex sizing is driven by the available space, not the
  // block row's intrinsic content width.
  it('breaks the flex min-width:auto chain so a high segment count cannot inflate ancestor width', () => {
    const segments = makeSegments(466);
    const { container } = render(
      <SegmentPeekStrip segments={segments} activeCount={5} onExpand={vi.fn()} onDismiss={vi.fn()} />,
    );
    const root = container.querySelector('.segment-peek-strip') as HTMLElement;
    const expandButton = screen.getByRole('button', { name: /expand segment render detail/i });
    const rowSpan = expandButton.querySelector('span') as HTMLElement;

    for (const el of [root, expandButton, rowSpan]) {
      expect(['0', '0px']).toContain(el.style.minWidth);
    }
  });
});
