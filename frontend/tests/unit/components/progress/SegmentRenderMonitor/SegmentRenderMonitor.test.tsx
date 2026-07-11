/**
 * Tests for SegmentRenderMonitor — the production, data-driven render monitor
 * (design-docs/specs/progress-presentation.md §7A/§8, invariants M1-M3).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SegmentRenderMonitor,
  charWeightedProgress,
  type SegmentRenderMonitorSegment,
} from '@/components/progress/SegmentRenderMonitor/SegmentRenderMonitor';

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function makeSegments(n: number, overrides: Partial<SegmentRenderMonitorSegment>[] = []): SegmentRenderMonitorSegment[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `seg-${i}`,
    charCount: 100 + i,
    phase: 'done' as const,
    progress: 1,
    ...(overrides[i] ?? {}),
  }));
}

describe('SegmentRenderMonitor — M1 aggregate math', () => {
  it('computes the char-weighted aggregate matching a hand-computed value', () => {
    // 3 segments: done (100 chars), rendering at 50% (200 chars), queued-equivalent
    // preparing (100 chars, contributes 0). Hand math:
    // filled = 100*1 + 200*0.5 + 0 = 200; total = 400 -> 0.5
    const segments: SegmentRenderMonitorSegment[] = [
      { id: 'a', charCount: 100, phase: 'done', progress: 1 },
      { id: 'b', charCount: 200, phase: 'rendering', progress: 0.5 },
      { id: 'c', charCount: 100, phase: 'preparing', progress: 0 },
    ];
    expect(charWeightedProgress(segments)).toBeCloseTo(0.5, 5);
  });

  it('renders the same aggregate percentage in the DOM as the hand-computed value', () => {
    mockMatchMedia(false);
    // 10 segments, all 100 chars except the rendering one (200 chars). Hand math:
    // filled = 100*1 (seg 0, done) + 200*0.5 (seg 1, rendering) + 8*100*1 (segs 2-9, done)
    //        = 100 + 100 + 800 = 1000; total = 100 + 200 + 8*100 = 1100 -> 1000/1100 = 90.9% -> 91%
    const segments = makeSegments(10, [
      { phase: 'done', progress: 1, charCount: 100 },
      { phase: 'rendering', progress: 0.5, charCount: 200 },
    ]);
    // Remaining 8 segments default to done/progress 1 from makeSegments — force them
    // to a known, simple state instead so the hand math stays legible.
    const fixed: SegmentRenderMonitorSegment[] = segments.map((s, i) =>
      i < 2 ? s : { ...s, phase: 'done', progress: 1, charCount: 100 },
    );

    render(<SegmentRenderMonitor segments={fixed} cap={3} />);
    expect(screen.getByText('91%')).toBeInTheDocument();
  });
});

describe('SegmentRenderMonitor — degrade-by-count', () => {
  it('renders nothing when segments.length < 10', () => {
    mockMatchMedia(false);
    const segments = makeSegments(9);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the full block strip for 10-60 segments', () => {
    mockMatchMedia(false);
    const segments = makeSegments(25);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    const strip = container.querySelector('[role="img"]');
    expect(strip).not.toBeNull();
    // One decorative block per segment.
    expect(strip?.querySelectorAll('[aria-hidden="true"]').length).toBe(25);
  });

  it('renders a compact "N of M done" summary bar for > 60 segments, with all N rows still in the accessible table', () => {
    mockMatchMedia(false);
    const segments = makeSegments(75, Array.from({ length: 75 }, (_, i) => (i < 40 ? { phase: 'done' as const } : { phase: 'preparing' as const, progress: 0 })));
    render(<SegmentRenderMonitor segments={segments} cap={3} />);

    // Summary bar text.
    expect(screen.getByText(/40 of 75 segments done/i)).toBeInTheDocument();

    // No full block strip (no per-segment decorative blocks) — only the summary role=img.
    const imgs = screen.getAllByRole('img', { hidden: true });
    expect(imgs.length).toBe(1);

    // Accessible table still has all 75 rows, reachable via <details> disclosure.
    const table = screen.getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    // header row + 75 data rows
    expect(rows.length).toBe(76);
  });
});

describe('SegmentRenderMonitor — M3 reduced motion', () => {
  it('does not apply the active/preparing animation classes when prefers-reduced-motion is set', () => {
    mockMatchMedia(true);
    const segments = makeSegments(12, [
      { phase: 'rendering', progress: 0.4 },
      { phase: 'preparing', progress: 0 },
    ]);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    expect(container.querySelector('.segment-render-monitor__block--active')).toBeNull();
    expect(container.querySelector('.segment-render-monitor__block--preparing')).toBeNull();
  });

  it('applies the active/preparing animation classes when motion is not reduced', () => {
    mockMatchMedia(false);
    const segments = makeSegments(12, [
      { phase: 'rendering', progress: 0.4 },
      { phase: 'preparing', progress: 0 },
    ]);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    expect(container.querySelector('.segment-render-monitor__block--active')).not.toBeNull();
    expect(container.querySelector('.segment-render-monitor__block--preparing')).not.toBeNull();
  });
});

describe('SegmentRenderMonitor — M2 failure cue is not hue-only', () => {
  it('gives a failed segment the crosshatch class, not just a color/border', () => {
    mockMatchMedia(false);
    const segments = makeSegments(11, [{ phase: 'failed', progress: 0.5 }]);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    const crosshatch = container.querySelector('.segment-render-monitor__crosshatch');
    expect(crosshatch).not.toBeNull();
  });

  it('still surfaces the crosshatch failure cue when degraded to the > 60 summary bar', () => {
    mockMatchMedia(false);
    const segments = makeSegments(65, [{ phase: 'failed', progress: 0.3 }]);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    // The visual strip has degraded to the summary bar, but the M2 invariant
    // ("in every case") still requires a non-hue failure signal outside the
    // collapsed accessible table.
    const crosshatch = container.querySelector('.segment-render-monitor__crosshatch');
    expect(crosshatch).not.toBeNull();
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
  });
});
