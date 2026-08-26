/**
 * Tests for SegmentRenderMonitor — the production, data-driven render monitor
 * (design-docs/specs/progress-presentation.md §7A/§8, invariants M1-M3).
 */
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('SegmentRenderMonitor — M1 failed-credit bug fix', () => {
  it('gives a failed segment zero credit, never partial credit for progress made before failing', () => {
    // filled = 100*1 (done) + 0 (failed, was 50% through 200 chars before it failed);
    // total = 300 -> 1/3, not (100 + 100)/300 = 2/3.
    const segments: SegmentRenderMonitorSegment[] = [
      { id: 'a', charCount: 100, phase: 'done', progress: 1 },
      { id: 'b', charCount: 200, phase: 'failed', progress: 0.5 },
    ];
    expect(charWeightedProgress(segments)).toBeCloseTo(100 / 300, 5);
  });
});

describe('SegmentRenderMonitor — real render-batch counts (renderGroupCount/completedRenderGroups)', () => {
  it('uses renderGroupCount/completedRenderGroups for the N of M label, not segments.length', () => {
    mockMatchMedia(false);
    // 402-row-equivalent segment set (scaled down for the test), 58 real batches, 7 done.
    const segments = makeSegments(100, Array.from({ length: 100 }, (_, i) => (i < 20 ? { phase: 'done' as const } : { phase: 'preparing' as const, progress: 0 })));
    render(
      <SegmentRenderMonitor
        segments={segments}
        cap={3}
        renderGroupCount={58}
        completedRenderGroups={7}
      />,
    );
    // Summary bar (> 60 segments) reads the real batch numbers, not 20/100,
    // and uses "batches" (not "segments") since the numbers are batch-derived.
    expect(screen.getByText(/7 of 58 batches done/i)).toBeInTheDocument();
    expect(screen.queryByText(/20 of 100 segments done/i)).toBeNull();
    expect(screen.queryByText(/segments done/i)).toBeNull();
  });

  it('falls back to segments.length/doneCount when renderGroupCount is absent', () => {
    mockMatchMedia(false);
    const segments = makeSegments(75, Array.from({ length: 75 }, (_, i) => (i < 40 ? { phase: 'done' as const } : { phase: 'preparing' as const, progress: 0 })));
    render(<SegmentRenderMonitor segments={segments} cap={3} />);
    expect(screen.getByText(/40 of 75 segments done/i)).toBeInTheDocument();
  });

  it('the aggregate % ignores renderGroupCount/completedRenderGroups entirely — it stays char-weighted over segments (B9/M1), independent of frozen batch siblings', () => {
    mockMatchMedia(false);
    // Sibling-freeze scenario: one "leader" segment mid-render, the rest of its
    // batch's siblings frozen at preparing/0 — render-group counters say 1/2
    // batches done, but the char-weighted % must still be computed from the
    // real segment set, not derived from (or matching) the batch ratio.
    const segments: SegmentRenderMonitorSegment[] = [
      { id: 'leader', charCount: 100, phase: 'rendering', progress: 0.5 },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `sib-${i}`, charCount: 100, phase: 'preparing' as const, progress: 0 })),
    ];
    render(
      <SegmentRenderMonitor
        segments={segments}
        cap={3}
        renderGroupCount={2}
        completedRenderGroups={1}
      />,
    );
    // filled = 100*0.5 = 50; total = 1100 -> ~4.5% -> rounds to 5%.
    expect(screen.getByText('5%')).toBeInTheDocument();
  });

  it('falls back to the real segment-derived count when completedRenderGroups is missing, rather than showing 0', () => {
    mockMatchMedia(false);
    const segments = makeSegments(75, Array.from({ length: 75 }, (_, i) => (i < 40 ? { phase: 'done' as const } : { phase: 'preparing' as const, progress: 0 })));
    render(
      <SegmentRenderMonitor
        segments={segments}
        cap={3}
        renderGroupCount={58}
        completedRenderGroups={undefined}
      />,
    );
    // hasRenderGroupData must require BOTH fields — a partial payload falls
    // all the way back to the real segment-derived doneCount, never "0 of 58".
    expect(screen.getByText(/40 of 75 segments done/i)).toBeInTheDocument();
    expect(screen.queryByText(/0 of 58/i)).toBeNull();
  });

  it('labels batch-derived counts "batches", not "segments"', () => {
    mockMatchMedia(false);
    const segments = makeSegments(100, Array.from({ length: 100 }, (_, i) => (i < 20 ? { phase: 'done' as const } : { phase: 'preparing' as const, progress: 0 })));
    render(
      <SegmentRenderMonitor
        segments={segments}
        cap={3}
        renderGroupCount={58}
        completedRenderGroups={7}
      />,
    );
    expect(screen.queryByText(/segments/i)).toBeNull();
    expect(screen.getAllByText(/batches/i).length).toBeGreaterThan(0);
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

describe('SegmentRenderMonitor — §7A milestone aria-live region', () => {
  function getLiveRegion(container: HTMLElement): HTMLElement {
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    return region as HTMLElement;
  }

  it('announces "Rendering started" as soon as the monitor mounts', () => {
    mockMatchMedia(false);
    const segments = makeSegments(60, Array.from({ length: 60 }, () => ({ phase: 'preparing' as const, progress: 0 })));
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    expect(getLiveRegion(container).textContent).toMatch(/rendering started/i);
  });

  it('announces only at coarse thresholds (not per-segment), at 25%-of-60 cadence', () => {
    mockMatchMedia(false);
    const base = makeSegments(60, Array.from({ length: 60 }, () => ({ phase: 'preparing' as const, progress: 0 })));
    const { container, rerender } = render(<SegmentRenderMonitor segments={base} cap={3} />);
    const region = getLiveRegion(container);
    const seenAnnouncements = new Set<string>([region.textContent ?? '']);

    // Step doneCount from 1 to 59, one segment at a time — a per-tick update
    // storm. The live region text must change far less often than 59 times.
    for (let done = 1; done <= 59; done += 1) {
      const stepped = base.map((s, i) => (i < done ? { ...s, phase: 'done' as const, progress: 1 } : s));
      rerender(<SegmentRenderMonitor segments={stepped} cap={3} />);
      seenAnnouncements.add(region.textContent ?? '');
    }

    // Only a handful of distinct announcements should have fired across 59
    // per-segment updates (start + ~3 thresholds), never one per segment.
    expect(seenAnnouncements.size).toBeLessThan(10);
    const joined = Array.from(seenAnnouncements).join(' | ');
    // 25%-of-60 cadence lands on 15 (25%), 30 (50%), 45 (75%) segments done.
    expect(joined).toMatch(/15 of 60 segments complete/i);
    expect(joined).toMatch(/30 of 60 segments complete/i);
  });

  it('announces completion, including a failed-count variant, without per-segment noise', () => {
    mockMatchMedia(false);
    const segments = makeSegments(20, Array.from({ length: 20 }, (_, i) => (i === 0 ? { phase: 'failed' as const, progress: 0.5 } : { phase: 'done' as const, progress: 1 })));
    const { container, rerender } = render(
      <SegmentRenderMonitor
        segments={segments.map((s, i) => (i === 0 ? s : { ...s, phase: 'preparing' as const, progress: 0 }))}
        cap={3}
      />,
    );
    const region = getLiveRegion(container);
    rerender(<SegmentRenderMonitor segments={segments} cap={3} />);
    expect(region.textContent).toMatch(/rendering complete/i);
    expect(region.textContent).toMatch(/1 segment failed/i);
  });

  it('does not re-announce the same threshold on unrelated re-renders', () => {
    mockMatchMedia(false);
    const segments = makeSegments(60, Array.from({ length: 60 }, (_, i) => (i < 15 ? { phase: 'done' as const } : { phase: 'preparing' as const, progress: 0 })));
    const { container, rerender } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    const region = getLiveRegion(container);
    const first = region.textContent;
    // Re-render with an identical segment set (e.g. a parent re-render caused
    // by an unrelated state change) — must not re-fire the same milestone.
    rerender(<SegmentRenderMonitor segments={[...segments]} cap={3} />);
    expect(region.textContent).toBe(first);
  });
});

describe('SegmentRenderMonitor — task 010 popover interaction (mouse)', () => {
  it('opens a non-aria-hidden popover with segment detail when a block is clicked', () => {
    mockMatchMedia(false);
    const segments = makeSegments(12, [{ phase: 'failed', progress: 0.4, engineId: 'xtts', reasonCode: 'engine_timeout' }]);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);

    const strip = container.querySelector('[role="img"]');
    const firstBlock = strip?.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(firstBlock).toBeTruthy();
    fireEvent.click(firstBlock);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('aria-hidden');
    expect(within(dialog).getByText(/Failed/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/xtts/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/engine_timeout/i)).toBeInTheDocument();
  });

  it('shows a Retry button in the popover only for a failed segment, and wires it to onRetry', () => {
    mockMatchMedia(false);
    const onRetry = vi.fn();
    const segments = makeSegments(12, [{ phase: 'failed', progress: 0.4 }]);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} onRetry={onRetry} />);

    const strip = container.querySelector('[role="img"]');
    const failedBlock = strip?.querySelectorAll('[aria-hidden="true"]')[0] as HTMLElement;
    fireEvent.click(failedBlock);

    const dialog = screen.getByRole('dialog');
    const retryBtn = within(dialog).getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith('seg-0');
    // Retrying closes the popover.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not show a Retry button when the caller has no retry path wired', () => {
    mockMatchMedia(false);
    const segments = makeSegments(12, [{ phase: 'failed', progress: 0.4 }]);
    const { container } = render(<SegmentRenderMonitor segments={segments} cap={3} />);
    const strip = container.querySelector('[role="img"]');
    const failedBlock = strip?.querySelectorAll('[aria-hidden="true"]')[0] as HTMLElement;
    fireEvent.click(failedBlock);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});

describe('SegmentRenderMonitor — task 010 M6 keyboard-reachable equivalent', () => {
  it('reaches the same detail/retry action via the accessible table, never touching the aria-hidden block field', async () => {
    mockMatchMedia(false);
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const segments = makeSegments(12, [{ phase: 'failed', progress: 0.4, engineId: 'xtts', reasonCode: 'engine_timeout' }]);
    render(<SegmentRenderMonitor segments={segments} cap={3} onRetry={onRetry} />);

    // Keyboard-only: tab to the first row's "Details" button in the accessible
    // table and activate it — no click/interaction with the aria-hidden block
    // field anywhere in this test.
    await user.tab();
    const detailsButtons = screen.getAllByRole('button', { name: /details/i });
    // The first Details button belongs to segment 0 (the failed one).
    detailsButtons[0].focus();
    expect(detailsButtons[0]).toHaveFocus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('aria-hidden');
    expect(within(dialog).getByText(/engine_timeout/i)).toBeInTheDocument();

    // The table's own "Retry" button (not the popover's) also reaches the
    // same action, keyboard-only.
    const tableRetryButtons = screen.getAllByRole('button', { name: /retry/i });
    // One retry button lives in the popover, one in the table row — both call
    // the same onRetry. Use the table row's (last rendered under the <table>).
    const tableRetry = tableRetryButtons.find((btn) => btn.closest('table'));
    expect(tableRetry).toBeTruthy();
    tableRetry!.focus();
    await user.keyboard('{Enter}');
    expect(onRetry).toHaveBeenCalledWith('seg-0');
  });
});
