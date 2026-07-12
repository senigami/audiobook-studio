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
});
